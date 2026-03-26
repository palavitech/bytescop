from rest_framework.test import APITestCase

from accounts.models import User
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole, TenantStatus, InviteStatus


STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


class ListTenantsViewTests(APITestCase):
    """Test GET /api/auth/tenants/ — list tenants for authenticated user."""

    URL = "/api/auth/tenants/"

    def setUp(self):
        self.user = _create_user(email="user@example.com")
        self.tenant = _create_tenant()
        self.membership = _create_membership(self.user, self.tenant)

    def _auth(self):
        login_as(self.client, self.user, self.tenant)

    def test_unauthenticated_returns_401(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 401)

    def test_returns_active_memberships(self):
        self._auth()
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn("tenants", response.data)
        self.assertEqual(len(response.data["tenants"]), 1)

    def test_response_shape(self):
        self._auth()
        response = self.client.get(self.URL)
        tenant = response.data["tenants"][0]
        self.assertIn("id", tenant)
        self.assertIn("slug", tenant)
        self.assertIn("name", tenant)
        self.assertIn("role", tenant)
        self.assertEqual(tenant["slug"], "acme-corp")
        self.assertEqual(tenant["name"], "Acme Corp")

    def test_multiple_tenants_returned(self):
        tenant2 = _create_tenant(name="Beta Corp", slug="beta-corp")
        _create_membership(self.user, tenant2, role=TenantRole.MEMBER)
        self._auth()
        response = self.client.get(self.URL)
        self.assertEqual(len(response.data["tenants"]), 2)

    def test_excludes_inactive_memberships(self):
        tenant2 = _create_tenant(name="Inactive", slug="inactive")
        _create_membership(self.user, tenant2, is_active=False)
        self._auth()
        response = self.client.get(self.URL)
        self.assertEqual(len(response.data["tenants"]), 1)

    def test_excludes_suspended_tenants(self):
        tenant2 = _create_tenant(name="Suspended", slug="suspended", status=TenantStatus.SUSPENDED)
        _create_membership(self.user, tenant2)
        self._auth()
        response = self.client.get(self.URL)
        self.assertEqual(len(response.data["tenants"]), 1)

    def test_excludes_disabled_tenants(self):
        tenant2 = _create_tenant(name="Disabled", slug="disabled", status=TenantStatus.DISABLED)
        _create_membership(self.user, tenant2)
        self._auth()
        response = self.client.get(self.URL)
        self.assertEqual(len(response.data["tenants"]), 1)

    def test_excludes_pending_invite_tenants(self):
        """Tenants where invite is still pending should not appear in the list."""
        tenant2 = _create_tenant(name="Pending", slug="pending")
        m = _create_membership(self.user, tenant2, role=TenantRole.MEMBER)
        m.invite_status = InviteStatus.PENDING
        m.save(update_fields=["invite_status"])
        self._auth()
        response = self.client.get(self.URL)
        self.assertEqual(len(response.data["tenants"]), 1)


class SwitchTenantViewTests(APITestCase):
    """Test POST /api/auth/switch-tenant/ — switch authenticated user to another tenant."""

    URL = "/api/auth/switch-tenant/"

    def setUp(self):
        self.user = _create_user(email="user@example.com")
        self.tenant1 = _create_tenant(name="Tenant One", slug="tenant-one")
        self.tenant2 = _create_tenant(name="Tenant Two", slug="tenant-two")
        self.membership1 = _create_membership(self.user, self.tenant1)
        self.membership2 = _create_membership(self.user, self.tenant2, role=TenantRole.MEMBER)

    def _auth(self):
        login_as(self.client, self.user, self.tenant1)

    def test_unauthenticated_returns_401(self):
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_switch_updates_session(self):
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.session.get("tenant_id"),
            str(self.tenant2.id),
        )
        self.assertNotIn("access", response.data)

    def test_switch_returns_user(self):
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertEqual(response.data["user"]["email"], "user@example.com")

    def test_switch_returns_target_tenant(self):
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertEqual(response.data["tenant"]["slug"], "tenant-two")
        self.assertEqual(response.data["tenant"]["name"], "Tenant Two")

    def test_switch_returns_correct_role(self):
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertEqual(response.data["tenant"]["role"], TenantRole.MEMBER)

    def test_switch_returns_authorization(self):
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertIn("authorization", response.data)
        auth = response.data["authorization"]
        self.assertIn("is_root", auth)
        self.assertIn("permissions", auth)
        self.assertIn("groups", auth)

    def test_switch_owner_gets_is_root_true(self):
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant1.id)}, format="json")
        self.assertTrue(response.data["authorization"]["is_root"])

    def test_switch_member_gets_is_root_false(self):
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertFalse(response.data["authorization"]["is_root"])

    def test_nonexistent_id_rejected(self):
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": "00000000-0000-0000-0000-000000000000"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_inactive_membership_rejected(self):
        self.membership2.is_active = False
        self.membership2.save()
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_suspended_tenant_rejected(self):
        self.tenant2.status = TenantStatus.SUSPENDED
        self.tenant2.save()
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_no_membership_rejected(self):
        other_tenant = _create_tenant(name="Other", slug="other")
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(other_tenant.id)}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_missing_tenant_id_rejected(self):
        self._auth()
        response = self.client.post(self.URL, {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_pending_invite_rejected(self):
        """Cannot switch to a tenant where invite has not been accepted."""
        self.membership2.invite_status = InviteStatus.PENDING
        self.membership2.save(update_fields=["invite_status"])
        self._auth()
        response = self.client.post(self.URL, {"tenant_id": str(self.tenant2.id)}, format="json")
        self.assertEqual(response.status_code, 400)
