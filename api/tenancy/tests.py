from django.db import IntegrityError
from django.test import TestCase, RequestFactory

from accounts.models import User

from .middleware import TenantMiddleware
from .models import Tenant, TenantMember, TenantRole, TenantStatus


STRONG_PASSWORD = "Str0ngP@ss!99"


class TenantStatusEnumTests(TestCase):
    """Test TenantStatus TextChoices enum."""

    def test_active_value(self):
        self.assertEqual(TenantStatus.ACTIVE, "active")

    def test_suspended_value(self):
        self.assertEqual(TenantStatus.SUSPENDED, "suspended")

    def test_disabled_value(self):
        self.assertEqual(TenantStatus.DISABLED, "disabled")

    def test_choices_count(self):
        self.assertEqual(len(TenantStatus.choices), 4)


class TenantRoleEnumTests(TestCase):
    """Test TenantRole TextChoices enum."""

    def test_owner_value(self):
        self.assertEqual(TenantRole.OWNER, "owner")

    def test_member_value(self):
        self.assertEqual(TenantRole.MEMBER, "member")

    def test_choices_count(self):
        self.assertEqual(len(TenantRole.choices), 2)


class TenantModelTests(TestCase):
    """Test Tenant model."""

    def test_create_tenant(self):
        tenant = Tenant.objects.create(name="Acme Corp", slug="acme-corp")
        self.assertEqual(tenant.name, "Acme Corp")
        self.assertEqual(tenant.slug, "acme-corp")

    def test_default_status_is_active(self):
        tenant = Tenant.objects.create(name="Acme Corp", slug="acme-corp")
        self.assertEqual(tenant.status, TenantStatus.ACTIVE)

    def test_slug_unique(self):
        Tenant.objects.create(name="Acme Corp", slug="acme-corp")
        with self.assertRaises(IntegrityError):
            Tenant.objects.create(name="Another Corp", slug="acme-corp")

    def test_str_returns_name(self):
        tenant = Tenant.objects.create(name="Acme Corp", slug="acme-corp")
        self.assertEqual(str(tenant), "Acme Corp")

    def test_inherits_timestamped_ordering(self):
        t1 = Tenant.objects.create(name="First", slug="first")
        t2 = Tenant.objects.create(name="Second", slug="second")
        self.assertEqual(list(Tenant.objects.all())[0].pk, t2.pk)


class TenantMemberModelTests(TestCase):
    """Test TenantMember model."""

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Acme Corp", slug="acme-corp")
        self.user = User.objects.create_user(email="test@example.com", password=STRONG_PASSWORD)

    def test_create_member(self):
        member = TenantMember.objects.create(
            tenant=self.tenant, user=self.user, role=TenantRole.OWNER,
        )
        self.assertEqual(member.tenant, self.tenant)
        self.assertEqual(member.user, self.user)

    def test_default_role_is_member(self):
        member = TenantMember.objects.create(tenant=self.tenant, user=self.user)
        self.assertEqual(member.role, TenantRole.MEMBER)

    def test_default_is_active(self):
        member = TenantMember.objects.create(tenant=self.tenant, user=self.user)
        self.assertTrue(member.is_active)

    def test_unique_tenant_user_constraint(self):
        TenantMember.objects.create(tenant=self.tenant, user=self.user)
        with self.assertRaises(IntegrityError):
            TenantMember.objects.create(tenant=self.tenant, user=self.user)

    def test_same_user_different_tenants(self):
        tenant2 = Tenant.objects.create(name="Beta Corp", slug="beta-corp")
        TenantMember.objects.create(tenant=self.tenant, user=self.user)
        member2 = TenantMember.objects.create(tenant=tenant2, user=self.user)
        self.assertEqual(member2.tenant, tenant2)

    def test_str_format(self):
        member = TenantMember.objects.create(
            tenant=self.tenant, user=self.user, role=TenantRole.MEMBER,
        )
        self.assertEqual(str(member), "test@example.com @ Acme Corp (member)")

    def test_cascade_delete_tenant(self):
        TenantMember.objects.create(tenant=self.tenant, user=self.user)
        self.tenant.delete()
        self.assertEqual(TenantMember.objects.count(), 0)

    def test_cascade_delete_user(self):
        TenantMember.objects.create(tenant=self.tenant, user=self.user)
        self.user.delete()
        self.assertEqual(TenantMember.objects.count(), 0)

    def test_related_name_members(self):
        TenantMember.objects.create(tenant=self.tenant, user=self.user)
        self.assertEqual(self.tenant.members.count(), 1)

    def test_related_name_memberships(self):
        TenantMember.objects.create(tenant=self.tenant, user=self.user)
        self.assertEqual(self.user.memberships.count(), 1)


class TenantMiddlewareTests(TestCase):
    """Test TenantMiddleware session-based resolution."""

    def setUp(self):
        self.factory = RequestFactory()
        self.middleware = TenantMiddleware(get_response=lambda r: None)
        self.tenant = Tenant.objects.create(
            name="Acme Corp", slug="acme-corp", status=TenantStatus.ACTIVE,
        )

    def _make_request(self, path="/api/test/", tenant_id=None):
        """Create a request with a mock session."""
        request = self.factory.get(path)
        request.session = {}
        if tenant_id is not None:
            request.session['tenant_id'] = str(tenant_id)
        return request

    def test_valid_session_tenant_sets_tenant(self):
        request = self._make_request(tenant_id=self.tenant.id)
        self.middleware.process_request(request)
        self.assertEqual(request.tenant, self.tenant)

    def test_missing_session_tenant_sets_none(self):
        request = self._make_request()
        self.middleware.process_request(request)
        self.assertIsNone(request.tenant)

    def test_invalid_session_tenant_sets_none(self):
        request = self._make_request(tenant_id="nonexistent")
        self.middleware.process_request(request)
        self.assertIsNone(request.tenant)

    def test_suspended_tenant_sets_none(self):
        self.tenant.status = TenantStatus.SUSPENDED
        self.tenant.save()
        request = self._make_request(tenant_id=self.tenant.id)
        self.middleware.process_request(request)
        self.assertIsNone(request.tenant)

    def test_disabled_tenant_sets_none(self):
        self.tenant.status = TenantStatus.DISABLED
        self.tenant.save()
        request = self._make_request(tenant_id=self.tenant.id)
        self.middleware.process_request(request)
        self.assertIsNone(request.tenant)
