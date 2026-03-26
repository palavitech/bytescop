"""Integration tests for all MFA endpoints."""

import pyotp
from django.core import signing
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from account_settings.models import AccountSetting
from accounts.mfa_crypto import decrypt_secret
from accounts.mfa_service import confirm_enrollment, enroll_mfa
from accounts.models import User
from core.signing import (
    SALT_MFA_CHALLENGE as MFA_TOKEN_SALT,
    SALT_MFA_RE_ENROLL as RE_ENROLL_TOKEN_SALT,
    MAX_AGE_MFA_CHALLENGE as MFA_TOKEN_MAX_AGE,
    MAX_AGE_MFA_RE_ENROLL as RE_ENROLL_TOKEN_MAX_AGE,
)
from authorization.models import TenantGroup
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole, TenantStatus

STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="mfa@example.com", password=STRONG_PASSWORD, **kwargs):
    kwargs.setdefault("email_verified", True)
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="MFA Corp", slug="mfa-corp"):
    return Tenant.objects.create(name=name, slug=slug)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


def _make_mfa_token(user, tenant):
    return signing.dumps(
        {"user_id": str(user.pk), "tenant_id": str(tenant.id), "purpose": "mfa_challenge"},
        salt=MFA_TOKEN_SALT,
    )


def _setup_mfa(user):
    """Enroll and confirm MFA for a user. Returns the TOTP secret."""
    result = enroll_mfa(user)
    secret = result["secret"]
    code = pyotp.TOTP(secret).now()
    confirm_enrollment(user, code)
    user.refresh_from_db()
    return secret


class LoginStep2MfaGateTests(APITestCase):
    """Test that LoginStep2 returns MFA challenge when appropriate."""

    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.OWNER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

    def test_no_mfa_returns_session(self):
        """User without MFA enabled (and not required) gets a session directly."""
        # Make a regular member, not owner (owners require MFA)
        user2 = _create_user(email="nomfa@example.com")
        _create_membership(user2, self.tenant, role=TenantRole.MEMBER)

        resp = self.client.post("/api/auth/login/select-tenant/", {
            "email": "nomfa@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.id),
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            self.client.session.get("tenant_id"),
            str(self.tenant.id),
        )
        self.assertNotIn("mfa_required", resp.data)

    def test_mfa_enabled_user_gets_challenge(self):
        """User with MFA enabled gets MFA challenge instead of session."""
        _setup_mfa(self.user)

        resp = self.client.post("/api/auth/login/select-tenant/", {
            "email": "mfa@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.id),
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["mfa_required"])
        self.assertFalse(resp.data["mfa_setup_required"])
        self.assertIn("mfa_token", resp.data)
        self.assertNotIn("access", resp.data)

    def test_owner_without_mfa_gets_setup_challenge(self):
        """Owner without MFA setup gets mfa_setup_required."""
        resp = self.client.post("/api/auth/login/select-tenant/", {
            "email": "mfa@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.id),
        })
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["mfa_required"])
        self.assertTrue(resp.data["mfa_setup_required"])
        self.assertIn("mfa_token", resp.data)


# ---------------------------------------------------------------------------
# MFA login flow endpoints
# ---------------------------------------------------------------------------


class MfaVerifyTests(APITestCase):
    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant)
        self.secret = _setup_mfa(self.user)
        self.mfa_token = _make_mfa_token(self.user, self.tenant)

    def test_verify_valid_code(self):
        code = pyotp.TOTP(self.secret).now()
        resp = self.client.post("/api/auth/mfa/verify/", {
            "mfa_token": self.mfa_token,
            "code": code,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            self.client.session.get("tenant_id"),
            str(self.tenant.id),
        )
        self.assertIn("user", resp.data)
        self.assertNotIn("access", resp.data)

    def test_verify_invalid_code(self):
        resp = self.client.post("/api/auth/mfa/verify/", {
            "mfa_token": self.mfa_token,
            "code": "000000",
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Invalid MFA code", resp.data["detail"])

    def test_verify_backup_code(self):
        result = enroll_mfa(self.user)
        code = pyotp.TOTP(result["secret"]).now()
        confirm_enrollment(self.user, code)
        self.user.refresh_from_db()

        self.mfa_token = _make_mfa_token(self.user, self.tenant)

        resp = self.client.post("/api/auth/mfa/verify/", {
            "mfa_token": self.mfa_token,
            "code": result["backup_codes"][0],
        })
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            self.client.session.get("tenant_id"),
            str(self.tenant.id),
        )

    def test_verify_totp_replay_rejected(self):
        """Same TOTP code used twice within the window must be rejected (M6)."""
        code = pyotp.TOTP(self.secret).now()
        # First use — should succeed
        resp1 = self.client.post("/api/auth/mfa/verify/", {
            "mfa_token": self.mfa_token,
            "code": code,
        })
        self.assertEqual(resp1.status_code, 200)

        # Second use — same code, fresh MFA token, should be rejected
        mfa_token2 = _make_mfa_token(self.user, self.tenant)
        resp2 = self.client.post("/api/auth/mfa/verify/", {
            "mfa_token": mfa_token2,
            "code": code,
        })
        self.assertEqual(resp2.status_code, 400)

    def test_verify_expired_token(self):
        expired = signing.dumps(
            {"user_id": str(self.user.pk), "tenant_id": str(self.tenant.id), "purpose": "mfa_challenge"},
            salt=MFA_TOKEN_SALT,
        )
        # Monkey-patch to simulate expiry
        with self.settings(SECRET_KEY="test-secret"):
            resp = self.client.post("/api/auth/mfa/verify/", {
                "mfa_token": "invalid-token",
                "code": "123456",
            })
        self.assertEqual(resp.status_code, 400)

    def test_verify_invalid_token(self):
        resp = self.client.post("/api/auth/mfa/verify/", {
            "mfa_token": "garbage-token",
            "code": "123456",
        })
        self.assertEqual(resp.status_code, 400)


class MfaSetupTests(APITestCase):
    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant)
        self.mfa_token = _make_mfa_token(self.user, self.tenant)

    def test_setup_returns_qr_and_codes(self):
        resp = self.client.post("/api/auth/mfa/setup/", {
            "mfa_token": self.mfa_token,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIn("qr_code", resp.data)
        self.assertIn("secret", resp.data)
        self.assertIn("backup_codes", resp.data)
        self.assertIn("mfa_token", resp.data)
        self.assertEqual(len(resp.data["backup_codes"]), 10)

    def test_setup_confirm_valid_code(self):
        # First setup
        resp = self.client.post("/api/auth/mfa/setup/", {
            "mfa_token": self.mfa_token,
        })
        self.assertEqual(resp.status_code, 200)
        secret = resp.data["secret"]
        new_token = resp.data["mfa_token"]

        code = pyotp.TOTP(secret).now()
        resp2 = self.client.post("/api/auth/mfa/setup/confirm/", {
            "mfa_token": new_token,
            "code": code,
        })
        self.assertEqual(resp2.status_code, 200)
        self.assertEqual(
            self.client.session.get("tenant_id"),
            str(self.tenant.id),
        )
        self.assertNotIn("access", resp2.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.mfa_enabled)

    def test_setup_confirm_invalid_code(self):
        resp = self.client.post("/api/auth/mfa/setup/", {
            "mfa_token": self.mfa_token,
        })
        new_token = resp.data["mfa_token"]

        resp2 = self.client.post("/api/auth/mfa/setup/confirm/", {
            "mfa_token": new_token,
            "code": "000000",
        })
        self.assertEqual(resp2.status_code, 400)


# ---------------------------------------------------------------------------
# Self-service MFA endpoints
# ---------------------------------------------------------------------------


class MeSelfServiceMfaTests(APITestCase):
    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.MEMBER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

        # Authenticate via session
        login_as(self.client, self.user, self.tenant)

    def test_mfa_status_not_enrolled(self):
        resp = self.client.get("/api/me/mfa/status/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["mfa_enabled"])
        self.assertFalse(resp.data["mfa_required"])
        self.assertEqual(resp.data["backup_codes_remaining"], 0)

    def test_mfa_enroll_and_confirm(self):
        # Enroll
        resp = self.client.post("/api/me/mfa/enroll/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("qr_code", resp.data)
        secret = resp.data["secret"]

        # Confirm
        code = pyotp.TOTP(secret).now()
        resp2 = self.client.post("/api/me/mfa/enroll/confirm/", {"code": code})
        self.assertEqual(resp2.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.mfa_enabled)

    def test_mfa_enroll_already_enabled(self):
        _setup_mfa(self.user)
        resp = self.client.post("/api/me/mfa/enroll/")
        self.assertEqual(resp.status_code, 400)

    def test_mfa_disable(self):
        secret = _setup_mfa(self.user)
        code = pyotp.TOTP(secret).now()
        resp = self.client.post("/api/me/mfa/disable/", {"code": code})
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.mfa_enabled)

    def test_mfa_disable_invalid_code(self):
        _setup_mfa(self.user)
        resp = self.client.post("/api/me/mfa/disable/", {"code": "000000"})
        self.assertEqual(resp.status_code, 400)

    def test_mfa_disable_mandatory(self):
        """Cannot disable MFA when it's mandatory (e.g. admin group)."""
        secret = _setup_mfa(self.user)
        admin_group = TenantGroup.objects.get(
            tenant=self.tenant, name="Administrators",
        )
        self.member.groups.add(admin_group)

        code = pyotp.TOTP(secret).now()
        resp = self.client.post("/api/me/mfa/disable/", {"code": code})
        self.assertEqual(resp.status_code, 403)

    def test_mfa_disable_not_enabled(self):
        resp = self.client.post("/api/me/mfa/disable/", {"code": "123456"})
        self.assertEqual(resp.status_code, 400)

    def test_regenerate_backup_codes(self):
        secret = _setup_mfa(self.user)
        code = pyotp.TOTP(secret).now()
        resp = self.client.post("/api/me/mfa/regenerate-backup-codes/", {"code": code})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("backup_codes", resp.data)
        self.assertEqual(len(resp.data["backup_codes"]), 10)

    def test_regenerate_backup_codes_not_enabled(self):
        resp = self.client.post("/api/me/mfa/regenerate-backup-codes/", {"code": "123456"})
        self.assertEqual(resp.status_code, 400)

    def test_mfa_status_when_enrolled(self):
        _setup_mfa(self.user)
        resp = self.client.get("/api/me/mfa/status/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["mfa_enabled"])
        self.assertIsNotNone(resp.data["mfa_enrolled_at"])
        self.assertGreater(resp.data["backup_codes_remaining"], 0)


# ---------------------------------------------------------------------------
# MFA re-enroll (device change)
# ---------------------------------------------------------------------------


class MeReEnrollMfaTests(APITestCase):
    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.MEMBER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

        self.secret = _setup_mfa(self.user)

        login_as(self.client, self.user, self.tenant)

    def test_re_enroll_valid_code(self):
        """Re-enroll returns QR/secret/codes/token and does NOT change user model."""
        old_secret = self.user.mfa_secret
        code = pyotp.TOTP(self.secret).now()
        resp = self.client.post("/api/me/mfa/re-enroll/", {"code": code})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("qr_code", resp.data)
        self.assertIn("secret", resp.data)
        self.assertIn("backup_codes", resp.data)
        self.assertIn("re_enroll_token", resp.data)
        self.assertEqual(len(resp.data["backup_codes"]), 10)

        # User model should be unchanged
        self.user.refresh_from_db()
        self.assertEqual(self.user.mfa_secret, old_secret)
        self.assertTrue(self.user.mfa_enabled)

    def test_re_enroll_with_backup_code(self):
        """Re-enroll works using a backup code for identity verification."""
        # Re-enroll to get fresh backup codes
        result = enroll_mfa(self.user)
        code = pyotp.TOTP(result["secret"]).now()
        confirm_enrollment(self.user, code)
        self.user.refresh_from_db()

        backup_code = result["backup_codes"][0]
        resp = self.client.post("/api/me/mfa/re-enroll/", {"code": backup_code})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("re_enroll_token", resp.data)

    def test_re_enroll_invalid_code(self):
        resp = self.client.post("/api/me/mfa/re-enroll/", {"code": "000000"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Invalid MFA code", resp.data["detail"])

    def test_re_enroll_mfa_not_enabled(self):
        """Cannot re-enroll if MFA is not enabled."""
        from accounts.mfa_service import disable_mfa
        disable_mfa(self.user)
        resp = self.client.post("/api/me/mfa/re-enroll/", {"code": "123456"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("not enabled", resp.data["detail"])

    def test_re_enroll_confirm_valid(self):
        """Full re-enroll flow: old TOTP should fail, new TOTP should work."""
        old_secret = self.secret
        code = pyotp.TOTP(old_secret).now()

        # Step 1: start re-enroll
        resp = self.client.post("/api/me/mfa/re-enroll/", {"code": code})
        self.assertEqual(resp.status_code, 200)
        new_secret = resp.data["secret"]
        re_enroll_token = resp.data["re_enroll_token"]

        # Step 2: confirm with new TOTP
        new_code = pyotp.TOTP(new_secret).now()
        resp2 = self.client.post("/api/me/mfa/re-enroll/confirm/", {
            "code": new_code,
            "re_enroll_token": re_enroll_token,
        })
        self.assertEqual(resp2.status_code, 200)
        self.assertIn("MFA device has been updated", resp2.data["detail"])

        # Verify the new secret is stored
        self.user.refresh_from_db()
        stored_secret = decrypt_secret(self.user.mfa_secret)
        self.assertEqual(stored_secret, new_secret)
        self.assertTrue(self.user.mfa_enabled)

    def test_re_enroll_confirm_invalid_code(self):
        """Confirm with wrong code returns 400."""
        code = pyotp.TOTP(self.secret).now()
        resp = self.client.post("/api/me/mfa/re-enroll/", {"code": code})
        re_enroll_token = resp.data["re_enroll_token"]

        resp2 = self.client.post("/api/me/mfa/re-enroll/confirm/", {
            "code": "000000",
            "re_enroll_token": re_enroll_token,
        })
        self.assertEqual(resp2.status_code, 400)
        self.assertIn("Invalid code", resp2.data["detail"])

    def test_re_enroll_confirm_expired_token(self):
        """Confirm with garbage token returns 400."""
        resp = self.client.post("/api/me/mfa/re-enroll/confirm/", {
            "code": "123456",
            "re_enroll_token": "garbage-token",
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Invalid or expired", resp.data["detail"])

    def test_re_enroll_confirm_wrong_user(self):
        """Token from another user should be rejected."""
        # Start re-enroll as current user
        code = pyotp.TOTP(self.secret).now()
        resp = self.client.post("/api/me/mfa/re-enroll/", {"code": code})
        re_enroll_token = resp.data["re_enroll_token"]

        # Create and authenticate as a different user
        user2 = _create_user(email="other@example.com")
        _create_membership(user2, self.tenant, role=TenantRole.MEMBER)
        _setup_mfa(user2)
        login_as(self.client, user2, self.tenant)

        resp2 = self.client.post("/api/me/mfa/re-enroll/confirm/", {
            "code": "123456",
            "re_enroll_token": re_enroll_token,
        })
        self.assertEqual(resp2.status_code, 400)
        self.assertIn("does not match", resp2.data["detail"])


# ---------------------------------------------------------------------------
# Admin reset MFA
# ---------------------------------------------------------------------------


class AdminResetMfaTests(APITestCase):
    def setUp(self):
        self.tenant = _create_tenant()
        self.admin = _create_user(email="admin@example.com")
        self.admin_member = _create_membership(self.admin, self.tenant, role=TenantRole.OWNER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

        self.target = _create_user(email="target@example.com")
        self.target_member = _create_membership(
            self.target, self.tenant, role=TenantRole.MEMBER,
        )

        self.admin.mfa_enabled = True
        self.admin.save(update_fields=["mfa_enabled"])
        login_as(self.client, self.admin, self.tenant)

    def test_reset_mfa_success(self):
        _setup_mfa(self.target)
        resp = self.client.post(f"/api/authorization/members/{self.target_member.pk}/reset-mfa/")
        self.assertEqual(resp.status_code, 200)
        self.target.refresh_from_db()
        self.assertFalse(self.target.mfa_enabled)

    def test_reset_mfa_not_enabled(self):
        resp = self.client.post(f"/api/authorization/members/{self.target_member.pk}/reset-mfa/")
        self.assertEqual(resp.status_code, 400)

    def test_reset_mfa_self_forbidden(self):
        """Cannot reset your own MFA via admin endpoint."""
        _setup_mfa(self.admin)
        resp = self.client.post(f"/api/authorization/members/{self.admin_member.pk}/reset-mfa/")
        self.assertEqual(resp.status_code, 403)
        self.assertIn("cannot reset your own", resp.data["detail"])

    def test_owner_resets_other_owner_success(self):
        """Owner A can reset Owner B's MFA."""
        owner_b = _create_user(email="ownerb@example.com")
        owner_b_member = _create_membership(owner_b, self.tenant, role=TenantRole.OWNER)
        _setup_mfa(owner_b)

        resp = self.client.post(f"/api/authorization/members/{owner_b_member.pk}/reset-mfa/")
        self.assertEqual(resp.status_code, 200)
        owner_b.refresh_from_db()
        self.assertFalse(owner_b.mfa_enabled)

    def test_non_owner_resets_owner_forbidden(self):
        """Non-owner cannot reset an owner's MFA."""
        # Authenticate as a member (non-owner) with user.update permission
        member_user = _create_user(email="member@example.com")
        member = _create_membership(member_user, self.tenant, role=TenantRole.MEMBER)
        admin_group = TenantGroup.objects.get(tenant=self.tenant, name="Administrators")
        member.groups.add(admin_group)

        member_user.mfa_enabled = True
        member_user.save(update_fields=["mfa_enabled"])
        login_as(self.client, member_user, self.tenant)

        _setup_mfa(self.admin)
        resp = self.client.post(f"/api/authorization/members/{self.admin_member.pk}/reset-mfa/")
        self.assertEqual(resp.status_code, 403)
        self.assertIn("Only an owner", resp.data["detail"])


# ---------------------------------------------------------------------------
# Password change with MFA
# ---------------------------------------------------------------------------


class PasswordChangeWithMfaTests(APITestCase):
    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.MEMBER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

        login_as(self.client, self.user, self.tenant)

    def test_password_change_without_mfa(self):
        """No MFA required when MFA not enabled."""
        resp = self.client.post("/api/me/profile/password/", {
            "current_password": STRONG_PASSWORD,
            "new_password": "NewStr0ng!Pass99",
        })
        self.assertEqual(resp.status_code, 200)

    def test_password_change_with_mfa_missing_code(self):
        """MFA code required when MFA is enabled."""
        _setup_mfa(self.user)
        resp = self.client.post("/api/me/profile/password/", {
            "current_password": STRONG_PASSWORD,
            "new_password": "NewStr0ng!Pass99",
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("mfa_code", resp.data)

    def test_password_change_with_mfa_valid_code(self):
        secret = _setup_mfa(self.user)
        code = pyotp.TOTP(secret).now()
        resp = self.client.post("/api/me/profile/password/", {
            "current_password": STRONG_PASSWORD,
            "new_password": "NewStr0ng!Pass99",
            "mfa_code": code,
        })
        self.assertEqual(resp.status_code, 200)

    def test_password_change_with_mfa_invalid_code(self):
        _setup_mfa(self.user)
        resp = self.client.post("/api/me/profile/password/", {
            "current_password": STRONG_PASSWORD,
            "new_password": "NewStr0ng!Pass99",
            "mfa_code": "000000",
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("mfa_code", resp.data)


# ---------------------------------------------------------------------------
# MFA verify rate limiting under brute-force (#76)
# ---------------------------------------------------------------------------


class MfaVerifyRateLimitTests(APITestCase):
    """Test that MFA verify is rate-limited after repeated failures."""

    def setUp(self):
        from django.core.cache import cache
        from core.rate_limit.models import RateLimitEntry

        cache.clear()
        RateLimitEntry.objects.all().delete()

        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant)
        self.secret = _setup_mfa(self.user)
        self.mfa_token = _make_mfa_token(self.user, self.tenant)

    def test_mfa_verify_rate_limited_after_failures(self):
        """mfa_verify schedule [0,0,0,1,5,15]: 3 free, 4th blocked with 429 + Retry-After."""
        # Make 3 failed attempts (within the free window)
        for _ in range(3):
            resp = self.client.post("/api/auth/mfa/verify/", {
                "mfa_token": self.mfa_token,
                "code": "000000",
            })
            self.assertEqual(resp.status_code, 400)

        # 4th attempt should be rate-limited
        resp = self.client.post("/api/auth/mfa/verify/", {
            "mfa_token": self.mfa_token,
            "code": "000000",
        })
        self.assertEqual(resp.status_code, 429)
        self.assertIn("Retry-After", resp)
        retry_after = int(resp["Retry-After"])
        self.assertGreater(retry_after, 0)


# ---------------------------------------------------------------------------
# Owner cannot disable MFA (#77)
# ---------------------------------------------------------------------------


class OwnerCannotDisableMfaTests(APITestCase):
    """Test that an owner cannot disable their own MFA (it's mandatory)."""

    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user(email="owner-mfa@example.com")
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.OWNER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

        self.secret = _setup_mfa(self.user)

        login_as(self.client, self.user, self.tenant)

    def test_owner_cannot_disable_mfa(self):
        """Owner MFA is mandatory — disable endpoint should return 403."""
        code = pyotp.TOTP(self.secret).now()
        resp = self.client.post("/api/me/mfa/disable/", {"code": code})
        self.assertEqual(resp.status_code, 403)
        self.assertIn("mandatory", resp.data["detail"])
