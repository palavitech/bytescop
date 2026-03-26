"""Unit tests for account_settings.mfa_policy."""

from django.test import TestCase

from account_settings.mfa_policy import get_mfa_policy, is_mfa_required
from account_settings.models import AccountSetting
from accounts.models import User
from authorization.models import TenantGroup
from tenancy.models import Tenant, TenantMember, TenantRole

STRONG_PASSWORD = "Str0ngP@ss!99"


def _setup_tenant():
    tenant = Tenant.objects.create(name="Policy Corp", slug="policy-corp")
    return tenant


def _create_member(tenant, role=TenantRole.MEMBER, email="member@example.com"):
    user = User.objects.create_user(email=email, password=STRONG_PASSWORD)
    member = TenantMember.objects.create(tenant=tenant, user=user, role=role)
    return member


class IsMfaRequiredTests(TestCase):
    def setUp(self):
        self.tenant = _setup_tenant()

    def test_owner_always_required(self):
        member = _create_member(self.tenant, role=TenantRole.OWNER, email="owner@example.com")
        self.assertTrue(is_mfa_required(member, self.tenant))

    def test_admin_group_member_required(self):
        member = _create_member(self.tenant, email="admin@example.com")
        admin_group = TenantGroup.objects.create(
            tenant=self.tenant, name="Administrators",
        )
        member.groups.add(admin_group)
        self.assertTrue(is_mfa_required(member, self.tenant))

    def test_regular_member_not_required_by_default(self):
        member = _create_member(self.tenant, email="regular@example.com")
        self.assertFalse(is_mfa_required(member, self.tenant))

    def test_mfa_required_all_setting_true(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="mfa_required_all", value="true",
        )
        member = _create_member(self.tenant, email="all@example.com")
        self.assertTrue(is_mfa_required(member, self.tenant))

    def test_mfa_required_all_setting_false(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="mfa_required_all", value="false",
        )
        member = _create_member(self.tenant, email="all2@example.com")
        self.assertFalse(is_mfa_required(member, self.tenant))


class GetMfaPolicyTests(TestCase):
    def setUp(self):
        self.tenant = _setup_tenant()

    def test_default_policy(self):
        policy = get_mfa_policy(self.tenant)
        self.assertFalse(policy["required_all"])
        self.assertTrue(policy["required_for_owners"])
        self.assertTrue(policy["required_for_admins"])

    def test_policy_with_required_all(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="mfa_required_all", value="true",
        )
        policy = get_mfa_policy(self.tenant)
        self.assertTrue(policy["required_all"])
