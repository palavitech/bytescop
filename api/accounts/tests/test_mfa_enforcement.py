"""Tests for MFA enforcement middleware and related responses."""

import pyotp
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from account_settings.models import AccountSetting
from accounts.mfa_service import confirm_enrollment, enroll_mfa
from accounts.models import User
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole, TenantStatus

STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="enforce@example.com", password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Enforce Corp", slug="enforce-corp"):
    return Tenant.objects.create(name=name, slug=slug)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


def _setup_mfa(user):
    """Enroll and confirm MFA for a user. Returns the TOTP secret."""
    result = enroll_mfa(user)
    secret = result["secret"]
    code = pyotp.TOTP(secret).now()
    confirm_enrollment(user, code)
    user.refresh_from_db()
    return secret


# ---------------------------------------------------------------------------
# Middleware enforcement tests
# ---------------------------------------------------------------------------

class MfaEnforcementMiddlewareTests(APITestCase):
    """Test that the MFA enforcement middleware blocks/allows correctly."""

    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.OWNER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

    # --- Owner without MFA: blocked on protected endpoints ---

    def test_owner_without_mfa_blocked_on_dashboard(self):
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)
        resp = self.client.get("/api/dashboard/")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["code"], "mfa_setup_required")

    def test_owner_without_mfa_blocked_on_clients(self):
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)
        resp = self.client.get("/api/clients/")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["code"], "mfa_setup_required")

    def test_owner_without_mfa_blocked_on_engagements(self):
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)
        resp = self.client.get("/api/engagements/")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["code"], "mfa_setup_required")

    def test_owner_without_mfa_blocked_on_settings(self):
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)
        resp = self.client.get("/api/settings/")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["code"], "mfa_setup_required")

    # --- Owner without MFA: allowed on exempt endpoints ---

    def test_owner_without_mfa_allowed_on_mfa_status(self):
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)
        resp = self.client.get("/api/me/mfa/status/")
        # Should pass through middleware (DRF auth handles the rest)
        self.assertNotEqual(resp.status_code, 403)

    def test_owner_without_mfa_allowed_on_mfa_enroll(self):
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)
        resp = self.client.post("/api/me/mfa/enroll/", {}, format="json")
        # Should pass through middleware
        self.assertNotEqual(resp.status_code, 403)

    def test_owner_without_mfa_allowed_on_profile(self):
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)
        resp = self.client.get("/api/me/profile/")
        self.assertNotEqual(resp.status_code, 403)

    def test_owner_without_mfa_allowed_on_auth_logout(self):
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)
        resp = self.client.post("/api/auth/logout/", {}, format="json")
        # Auth endpoints are exempt
        self.assertNotEqual(resp.status_code, 403)

    # --- Owner WITH MFA: fast path, everything works ---

    def test_owner_with_mfa_passes_through(self):
        _setup_mfa(self.user)
        login_as(self.client, self.user, self.tenant)
        resp = self.client.get("/api/dashboard/")
        # Should not be blocked by MFA middleware
        self.assertNotEqual(resp.status_code, 403)

    # --- Regular member without MFA requirement: passes through ---

    def test_member_without_mfa_requirement_passes(self):
        user2 = _create_user(email="member@example.com")
        _create_membership(user2, self.tenant, role=TenantRole.MEMBER)
        login_as(self.client, user2, self.tenant)
        resp = self.client.get("/api/dashboard/")
        # Should not be 403 from middleware
        self.assertNotEqual(resp.status_code, 403)

    # --- mfa_required_all tenant setting ---

    def test_mfa_required_all_blocks_member_without_mfa(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="mfa_required_all", value="true",
        )
        user2 = _create_user(email="allmfa@example.com")
        _create_membership(user2, self.tenant, role=TenantRole.MEMBER)
        login_as(self.client, user2, self.tenant, mfa_enabled=False)
        resp = self.client.get("/api/clients/")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["code"], "mfa_setup_required")

    # --- Administrators group member ---

    def test_admin_group_member_without_mfa_blocked(self):
        user2 = _create_user(email="admin-member@example.com")
        member2 = _create_membership(user2, self.tenant, role=TenantRole.MEMBER)
        admin_group = self.tenant.groups.filter(name="Administrators").first()
        if admin_group:
            member2.groups.add(admin_group)
        login_as(self.client, user2, self.tenant, mfa_enabled=False)
        resp = self.client.get("/api/clients/")
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.json()["code"], "mfa_setup_required")

    # --- No session: passes through to DRF ---

    def test_no_auth_passes_through(self):
        resp = self.client.get("/api/dashboard/")
        # Should get 401 from DRF, not 403 from middleware
        self.assertIn(resp.status_code, [400, 401])

    # --- Non-API paths are not affected ---

    def test_non_api_path_not_affected(self):
        """Non-/api/ paths are not intercepted by the middleware."""
        resp = self.client.get("/health/")
        # /health/ may or may not exist; the point is the middleware
        # doesn't return 403 mfa_setup_required for non-API paths.
        self.assertNotEqual(resp.status_code, 403)


# ---------------------------------------------------------------------------
# Signup response tests
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Profile response tests
# ---------------------------------------------------------------------------

class ProfileMfaResponseTests(APITestCase):
    """Test that profile response includes mfa_setup_required."""

    def setUp(self):
        self.tenant = _create_tenant(slug="profile-mfa-corp")
        self.user = _create_user(email="profile-mfa@example.com")
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.OWNER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

    def test_profile_shows_mfa_required_for_owner_without_mfa(self):
        # Profile is exempt from middleware, so it should respond
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["mfa_setup_required"])

    def test_profile_shows_mfa_not_required_after_setup(self):
        _setup_mfa(self.user)
        login_as(self.client, self.user, self.tenant)
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["mfa_setup_required"])

    def test_profile_shows_mfa_not_required_for_regular_member(self):
        user2 = _create_user(email="reg-member@example.com")
        _create_membership(user2, self.tenant, role=TenantRole.MEMBER)
        login_as(self.client, user2, self.tenant)
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["mfa_setup_required"])


# ---------------------------------------------------------------------------
# Self-service enroll confirm returns fresh session
# ---------------------------------------------------------------------------

class EnrollConfirmSessionTests(APITestCase):
    """Test that self-service MFA enroll confirm updates session."""

    def setUp(self):
        self.tenant = _create_tenant(slug="enroll-token-corp")
        self.user = _create_user(email="enroll-token@example.com")
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.OWNER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

    def test_enroll_confirm_updates_session(self):
        login_as(self.client, self.user, self.tenant, mfa_enabled=False)

        # Start enrollment
        resp = self.client.post("/api/me/mfa/enroll/", {}, format="json")
        self.assertEqual(resp.status_code, 200)
        secret = resp.data["secret"]

        # Confirm enrollment
        code = pyotp.TOTP(secret).now()
        resp = self.client.post(
            "/api/me/mfa/enroll/confirm/",
            {"code": code},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["detail"], "MFA has been enabled.")
        self.assertNotIn("access", resp.data)

        # Session should have mfa_enabled=True now
        self.assertTrue(self.client.session.get("mfa_enabled"))
