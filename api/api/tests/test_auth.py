from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APITestCase

from accounts.models import User
from audit.models import AuditLog
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole, TenantStatus

from api.serializers.auth import _generate_unique_slug


STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    kwargs.setdefault("email_verified", True)
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


# ---------------------------------------------------------------------------
# Unit tests — helper functions
# ---------------------------------------------------------------------------


class GenerateUniqueSlugTests(TestCase):
    """Test _generate_unique_slug()."""

    def test_basic_slug(self):
        slug = _generate_unique_slug("Acme Corp")
        self.assertEqual(slug, "acme-corp")

    def test_collision_appends_counter(self):
        Tenant.objects.create(name="Acme Corp", slug="acme-corp")
        slug = _generate_unique_slug("Acme Corp")
        self.assertEqual(slug, "acme-corp-1")

    def test_multiple_collisions(self):
        Tenant.objects.create(name="Acme Corp", slug="acme-corp")
        Tenant.objects.create(name="Acme Corp 1", slug="acme-corp-1")
        slug = _generate_unique_slug("Acme Corp")
        self.assertEqual(slug, "acme-corp-2")

    def test_empty_name_falls_back_to_tenant(self):
        slug = _generate_unique_slug("")
        self.assertEqual(slug, "tenant")

    def test_special_characters_slugified(self):
        slug = _generate_unique_slug("My Company & Partners!")
        self.assertEqual(slug, "my-company-partners")


# ---------------------------------------------------------------------------
# Serializer tests — LoginStep1Serializer
# ---------------------------------------------------------------------------


class LoginStep1SerializerTests(APITestCase):
    """Test LoginStep1Serializer via the login step1 endpoint."""

    URL = "/api/auth/login/"

    def setUp(self):
        cache.clear()
        self.user = _create_user(email="user@example.com")
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)

    def test_valid_login_returns_200(self):
        response = self.client.post(
            self.URL, {"email": "user@example.com", "password": STRONG_PASSWORD}, format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_valid_login_returns_tenants(self):
        response = self.client.post(
            self.URL, {"email": "user@example.com", "password": STRONG_PASSWORD}, format="json",
        )
        self.assertIn("tenants", response.data)
        self.assertEqual(len(response.data["tenants"]), 1)

    def test_tenant_data_has_required_fields(self):
        response = self.client.post(
            self.URL, {"email": "user@example.com", "password": STRONG_PASSWORD}, format="json",
        )
        tenant_data = response.data["tenants"][0]
        self.assertIn("id", tenant_data)
        self.assertIn("slug", tenant_data)
        self.assertIn("name", tenant_data)
        self.assertIn("role", tenant_data)

    def test_invalid_password_rejected(self):
        response = self.client.post(
            self.URL, {"email": "user@example.com", "password": "wrong"}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_nonexistent_email_rejected(self):
        response = self.client.post(
            self.URL, {"email": "nobody@example.com", "password": STRONG_PASSWORD}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_inactive_user_rejected(self):
        self.user.is_active = False
        self.user.save()
        response = self.client.post(
            self.URL, {"email": "user@example.com", "password": STRONG_PASSWORD}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_only_active_tenants_returned(self):
        suspended_tenant = _create_tenant(name="Suspended", slug="suspended", status=TenantStatus.SUSPENDED)
        _create_membership(self.user, suspended_tenant)
        response = self.client.post(
            self.URL, {"email": "user@example.com", "password": STRONG_PASSWORD}, format="json",
        )
        self.assertEqual(len(response.data["tenants"]), 1)

    def test_only_active_memberships_returned(self):
        tenant2 = _create_tenant(name="Inactive Membership", slug="inactive")
        _create_membership(self.user, tenant2, is_active=False)
        response = self.client.post(
            self.URL, {"email": "user@example.com", "password": STRONG_PASSWORD}, format="json",
        )
        self.assertEqual(len(response.data["tenants"]), 1)


# ---------------------------------------------------------------------------
# Serializer tests — LoginStep2Serializer
# ---------------------------------------------------------------------------


class LoginStep2SerializerTests(APITestCase):
    """Test LoginStep2Serializer via the login step2 endpoint."""

    URL = "/api/auth/login/select-tenant/"

    def setUp(self):
        cache.clear()
        self.user = _create_user(email="user@example.com")
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant, role=TenantRole.MEMBER)

    def _payload(self, **overrides):
        data = {
            "email": "user@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.id),
        }
        data.update(overrides)
        return data

    def test_valid_login_returns_200(self):
        response = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(response.status_code, 200)

    def test_valid_login_creates_session(self):
        response = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(
            self.client.session.get("tenant_id"),
            str(self.tenant.id),
        )
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)

    def test_valid_login_returns_user(self):
        response = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(response.data["user"]["email"], "user@example.com")

    def test_valid_login_returns_tenant(self):
        response = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(response.data["tenant"]["slug"], "acme-corp")

    def test_response_includes_role(self):
        response = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(response.data["tenant"]["role"], TenantRole.MEMBER)

    def test_invalid_credentials_rejected(self):
        response = self.client.post(self.URL, self._payload(password="wrong"), format="json")
        self.assertEqual(response.status_code, 400)

    def test_wrong_tenant_rejected(self):
        response = self.client.post(self.URL, self._payload(tenant_id="00000000-0000-0000-0000-000000000000"), format="json")
        self.assertEqual(response.status_code, 400)

    def test_suspended_tenant_rejected(self):
        self.tenant.status = TenantStatus.SUSPENDED
        self.tenant.save()
        response = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(response.status_code, 400)

    def test_inactive_membership_rejected(self):
        TenantMember.objects.filter(user=self.user, tenant=self.tenant).update(is_active=False)
        response = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(response.status_code, 400)

    def test_unverified_email_returns_403(self):
        self.user.email_verified = False
        self.user.save(update_fields=["email_verified"])
        response = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "email_not_verified")
        self.assertTrue(response.data["resend_available"])

    def test_unverified_email_does_not_return_tokens(self):
        self.user.email_verified = False
        self.user.save(update_fields=["email_verified"])
        response = self.client.post(self.URL, self._payload(), format="json")
        self.assertNotIn("access", response.data)

    def test_audit_log_shows_tenant_name_not_uuid(self):
        """The audit resource_repr for login should contain the tenant name,
        not the raw tenant UUID."""
        self.client.post(self.URL, self._payload(), format="json")

        entry = AuditLog.objects.filter(action="login_success").order_by("-timestamp").first()
        self.assertIsNotNone(entry, "Expected a login_success audit entry")
        self.assertIn(
            self.tenant.name,
            entry.resource_repr,
            f"Audit repr should contain tenant name '{self.tenant.name}', got: {entry.resource_repr}",
        )
        self.assertNotIn(
            str(self.tenant.id),
            entry.resource_repr,
            f"Audit repr should NOT contain raw tenant UUID, got: {entry.resource_repr}",
        )


# ---------------------------------------------------------------------------
# View tests — logout
# ---------------------------------------------------------------------------


class LogoutViewTests(APITestCase):
    """Test the logout endpoint."""

    URL = "/api/auth/logout/"

    def setUp(self):
        self.user = _create_user(email="user@example.com")
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)

    def test_logout_returns_204(self):
        login_as(self.client, self.user, self.tenant)
        response = self.client.post(self.URL, format="json")
        self.assertEqual(response.status_code, 204)

    def test_logout_flushes_session(self):
        login_as(self.client, self.user, self.tenant)
        self.client.post(self.URL, format="json")
        self.assertIsNone(self.client.session.get("tenant_id"))

    def test_logout_without_body_still_returns_204(self):
        """Logout without request body still succeeds."""
        login_as(self.client, self.user, self.tenant)
        response = self.client.post(self.URL, {}, format="json")
        self.assertEqual(response.status_code, 204)

    def test_logout_unauthenticated_rejected(self):
        """SessionAuthentication returns 403 for unauthenticated POST."""
        response = self.client.post(self.URL, format="json")
        self.assertIn(response.status_code, [401, 403])


# ---------------------------------------------------------------------------
# URL resolution tests
# ---------------------------------------------------------------------------


class ApiUrlResolutionTests(TestCase):
    """Test API URL names resolve correctly."""

    def test_switch_tenant_url(self):
        from django.urls import reverse
        self.assertEqual(reverse("auth-switch-tenant"), "/api/auth/switch-tenant/")

    def test_login_url(self):
        from django.urls import reverse
        self.assertEqual(reverse("auth-login"), "/api/auth/login/")

    def test_login_select_tenant_url(self):
        from django.urls import reverse
        self.assertEqual(reverse("auth-login-select-tenant"), "/api/auth/login/select-tenant/")

    def test_logout_url(self):
        from django.urls import reverse
        self.assertEqual(reverse("auth-logout"), "/api/auth/logout/")


# ---------------------------------------------------------------------------
# Login step 1 — multiple tenants (#92)
# ---------------------------------------------------------------------------


class LoginStep1MultiTenantTests(APITestCase):
    """Test that login step 1 lists all active tenant memberships."""

    URL = "/api/auth/login/"

    def setUp(self):
        cache.clear()
        self.user = _create_user(email="multi@example.com")
        self.tenant_a = _create_tenant(name="Tenant A", slug="tenant-a")
        self.tenant_b = _create_tenant(name="Tenant B", slug="tenant-b")
        _create_membership(self.user, self.tenant_a, role=TenantRole.OWNER)
        _create_membership(self.user, self.tenant_b, role=TenantRole.MEMBER)

    def test_login_step1_returns_multiple_tenants(self):
        """User with memberships in 2 active tenants sees both in step 1."""
        resp = self.client.post(
            self.URL,
            {"email": "multi@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("tenants", resp.data)
        self.assertEqual(len(resp.data["tenants"]), 2)

    def test_login_step1_tenant_names_present(self):
        resp = self.client.post(
            self.URL,
            {"email": "multi@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        names = {t["name"] for t in resp.data["tenants"]}
        self.assertIn("Tenant A", names)
        self.assertIn("Tenant B", names)

    def test_login_step1_tenant_roles_correct(self):
        resp = self.client.post(
            self.URL,
            {"email": "multi@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        roles_by_slug = {t["slug"]: t["role"] for t in resp.data["tenants"]}
        self.assertEqual(roles_by_slug["tenant-a"], TenantRole.OWNER)
        self.assertEqual(roles_by_slug["tenant-b"], TenantRole.MEMBER)


# ---------------------------------------------------------------------------
# Switch tenant without re-auth (#100)
# ---------------------------------------------------------------------------


class SwitchTenantTests(APITestCase):
    """Test POST /api/auth/switch-tenant/ updates session for target tenant."""

    URL = "/api/auth/switch-tenant/"

    def setUp(self):
        cache.clear()
        self.user = _create_user(email="switch@example.com")
        self.tenant_a = _create_tenant(name="Switch A", slug="switch-a")
        self.tenant_b = _create_tenant(name="Switch B", slug="switch-b")
        _create_membership(self.user, self.tenant_a, role=TenantRole.OWNER)
        _create_membership(self.user, self.tenant_b, role=TenantRole.MEMBER)

        login_as(self.client, self.user, self.tenant_a)

    def test_switch_tenant_updates_session(self):
        """Switch-tenant updates session tenant_id for the target tenant."""
        resp = self.client.post(
            self.URL,
            {"tenant_id": str(self.tenant_b.id)},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            self.client.session.get("tenant_id"),
            str(self.tenant_b.id),
        )
        self.assertNotIn("access", resp.data)

    def test_switch_tenant_response_has_target_tenant_info(self):
        resp = self.client.post(
            self.URL,
            {"tenant_id": str(self.tenant_b.id)},
            format="json",
        )
        self.assertEqual(resp.data["tenant"]["slug"], "switch-b")
        self.assertEqual(resp.data["tenant"]["name"], "Switch B")
