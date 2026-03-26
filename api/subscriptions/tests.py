"""Tests for the subscriptions app.

Covers:
  - Models (SubscriptionPlan, TenantSubscription)
  - Rules (LimitRule base, FindingsPerEngagementRule, ImagesPerFindingRule)
  - Services (get_plan_for_tenant, assign_default_plan, check_limit, check_image_limit)
  - Guard (SubscriptionGuard DRF permission)
  - Seed command (ensure_subscription_plans)
"""

from unittest.mock import MagicMock

from django.test import TestCase
from rest_framework.test import APIRequestFactory

from accounts.models import User
from evidence.models import Attachment
from findings.models import Finding
from tenancy.models import Tenant, TenantMember, TenantRole, TenantStatus

from .guard import SubscriptionGuard, SubscriptionLimitExceeded
from .models import SubscriptionPlan, SubscriptionStatus, TenantSubscription
from .rules import (
    AssetsPerTenantRule,
    ClientsPerTenantRule,
    EngagementsPerTenantRule,
    FindingsPerEngagementRule,
    ImagesPerFindingRule,
    LimitRegistry,
    LimitRule,
    MembersPerTenantRule,
)
from .services import (
    _get_tenant_usage,
    assign_default_plan,
    check_image_limit,
    check_limit,
    count_image_tokens,
    get_plan_for_tenant,
    get_subscription_info,
)


class _BaseMixin(TestCase):
    """Shared test setup: tenant, user, plan, subscription."""

    def setUp(self):
        # Clean up any plans seeded by data migrations
        TenantSubscription.objects.all().delete()
        SubscriptionPlan.objects.all().delete()

        self.tenant = Tenant.objects.create(
            name='Test Corp', slug='test-corp', status=TenantStatus.ACTIVE,
        )
        self.user = User.objects.create_user(
            email='test@example.com', password='testpass123',
            first_name='Test', last_name='User',
        )
        self.member = TenantMember.objects.create(
            tenant=self.tenant, user=self.user, role=TenantRole.OWNER,
        )
        self.plan = SubscriptionPlan.objects.create(
            name='Test Plan', code='test-plan', is_default=True, is_active=True,
            max_findings_per_engagement=5,
            max_images_per_finding=3,
            max_members=2,
            max_clients=3,
        )
        self.subscription = TenantSubscription.objects.create(
            tenant=self.tenant, plan=self.plan,
            status=SubscriptionStatus.ACTIVE,
        )


# -----------------------------------------------------------------------
# Model tests
# -----------------------------------------------------------------------

class SubscriptionPlanModelTests(TestCase):

    def test_get_limit_returns_field_value(self):
        plan = SubscriptionPlan(max_findings_per_engagement=20)
        self.assertEqual(plan.get_limit('max_findings_per_engagement'), 20)

    def test_get_limit_returns_zero_for_unknown_field(self):
        plan = SubscriptionPlan()
        self.assertEqual(plan.get_limit('nonexistent_field'), 0)

    def test_str(self):
        plan = SubscriptionPlan(name='Pro')
        self.assertEqual(str(plan), 'Pro')

    def test_unlimited_when_zero(self):
        plan = SubscriptionPlan(max_engagements=0)
        self.assertEqual(plan.get_limit('max_engagements'), 0)


class TenantSubscriptionModelTests(_BaseMixin):

    def test_is_active_true(self):
        self.assertTrue(self.subscription.is_active)

    def test_is_active_false_when_expired(self):
        self.subscription.status = SubscriptionStatus.EXPIRED
        self.subscription.save()
        self.assertFalse(self.subscription.is_active)

    def test_str(self):
        self.assertIn('Test Corp', str(self.subscription))
        self.assertIn('Test Plan', str(self.subscription))


# -----------------------------------------------------------------------
# Rule tests
# -----------------------------------------------------------------------

class LimitRuleBaseTests(TestCase):

    def test_abstract_get_current_usage_raises(self):
        rule = LimitRule()
        with self.assertRaises(NotImplementedError):
            rule.get_current_usage(None)

    def test_check_allows_when_unlimited(self):
        plan = SubscriptionPlan(max_findings_per_engagement=0)
        rule = FindingsPerEngagementRule()
        result = rule.check(plan, None)
        self.assertTrue(result.allowed)
        self.assertEqual(result.limit, 0)

    def test_check_allows_when_under_limit(self):
        plan = SubscriptionPlan(max_findings_per_engagement=10)
        rule = FindingsPerEngagementRule()
        rule.get_current_usage = lambda tenant, **ctx: 5
        result = rule.check(plan, None)
        self.assertTrue(result.allowed)
        self.assertEqual(result.current, 5)
        self.assertEqual(result.limit, 10)

    def test_check_blocks_when_at_limit(self):
        plan = SubscriptionPlan(max_findings_per_engagement=5)
        rule = FindingsPerEngagementRule()
        rule.get_current_usage = lambda tenant, **ctx: 5
        result = rule.check(plan, None)
        self.assertFalse(result.allowed)
        self.assertIn('limit reached', result.message)

    def test_check_blocks_when_over_limit(self):
        plan = SubscriptionPlan(max_findings_per_engagement=5)
        rule = FindingsPerEngagementRule()
        rule.get_current_usage = lambda tenant, **ctx: 8
        result = rule.check(plan, None)
        self.assertFalse(result.allowed)


class MembersPerTenantRuleTests(_BaseMixin):

    def test_counts_members(self):
        rule = MembersPerTenantRule()
        # setUp creates one member already
        self.assertEqual(rule.get_current_usage(self.tenant), 1)

    def test_counts_only_own_tenant(self):
        other = Tenant.objects.create(name='Other', slug='other', status=TenantStatus.ACTIVE)
        other_user = User.objects.create_user(email='other@example.com', password='pass123')
        TenantMember.objects.create(tenant=other, user=other_user, role=TenantRole.MEMBER)
        rule = MembersPerTenantRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 1)

    def test_blocks_at_limit(self):
        self.plan.max_members = 1
        self.plan.save()
        rule = MembersPerTenantRule()
        result = rule.check(self.plan, self.tenant)
        self.assertFalse(result.allowed)

    def test_allows_under_limit(self):
        self.plan.max_members = 5
        self.plan.save()
        rule = MembersPerTenantRule()
        result = rule.check(self.plan, self.tenant)
        self.assertTrue(result.allowed)


class ClientsPerTenantRuleTests(_BaseMixin):

    def _create_client(self):
        from clients.models import Client
        return Client.objects.create(tenant=self.tenant, name='Client')

    def test_counts_clients(self):
        self._create_client()
        self._create_client()
        rule = ClientsPerTenantRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 2)

    def test_counts_only_own_tenant(self):
        from clients.models import Client
        self._create_client()
        other = Tenant.objects.create(name='Other', slug='other', status=TenantStatus.ACTIVE)
        Client.objects.create(tenant=other, name='Other Client')
        rule = ClientsPerTenantRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 1)

    def test_blocks_at_limit(self):
        self.plan.max_clients = 1
        self.plan.save()
        self._create_client()
        rule = ClientsPerTenantRule()
        result = rule.check(self.plan, self.tenant)
        self.assertFalse(result.allowed)

    def test_allows_under_limit(self):
        self.plan.max_clients = 5
        self.plan.save()
        rule = ClientsPerTenantRule()
        result = rule.check(self.plan, self.tenant)
        self.assertTrue(result.allowed)


class AssetsPerTenantRuleTests(_BaseMixin):

    def _create_asset(self):
        from assets.models import Asset
        return Asset.objects.create(
            tenant=self.tenant, name='Asset', asset_type='host',
        )

    def test_counts_assets(self):
        self._create_asset()
        self._create_asset()
        rule = AssetsPerTenantRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 2)

    def test_counts_only_own_tenant(self):
        from assets.models import Asset
        self._create_asset()
        other = Tenant.objects.create(name='Other', slug='other', status=TenantStatus.ACTIVE)
        Asset.objects.create(tenant=other, name='Other Asset', asset_type='host')
        rule = AssetsPerTenantRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 1)

    def test_blocks_at_limit(self):
        self.plan.max_assets = 1
        self.plan.save()
        self._create_asset()
        rule = AssetsPerTenantRule()
        result = rule.check(self.plan, self.tenant)
        self.assertFalse(result.allowed)

    def test_allows_under_limit(self):
        self.plan.max_assets = 10
        self.plan.save()
        rule = AssetsPerTenantRule()
        result = rule.check(self.plan, self.tenant)
        self.assertTrue(result.allowed)


class EngagementsPerTenantRuleTests(_BaseMixin):

    def _create_engagement(self):
        from engagements.models import Engagement
        return Engagement.objects.create(
            tenant=self.tenant, name='Eng', created_by=self.user,
        )

    def test_returns_zero_when_no_engagements(self):
        rule = EngagementsPerTenantRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 0)

    def test_counts_engagements_for_tenant(self):
        for _ in range(3):
            self._create_engagement()
        rule = EngagementsPerTenantRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 3)

    def test_does_not_count_other_tenant(self):
        self._create_engagement()
        other_tenant = Tenant.objects.create(
            name='Other', slug='other', status=TenantStatus.ACTIVE,
        )
        from engagements.models import Engagement
        Engagement.objects.create(
            tenant=other_tenant, name='Other Eng', created_by=self.user,
        )
        rule = EngagementsPerTenantRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 1)

    def test_check_blocks_at_limit(self):
        self.plan.max_engagements = 2
        self.plan.save()
        self._create_engagement()
        self._create_engagement()
        rule = EngagementsPerTenantRule()
        result = rule.check(self.plan, self.tenant)
        self.assertFalse(result.allowed)
        self.assertIn('limit reached', result.message)

    def test_check_allows_under_limit(self):
        self.plan.max_engagements = 5
        self.plan.save()
        self._create_engagement()
        rule = EngagementsPerTenantRule()
        result = rule.check(self.plan, self.tenant)
        self.assertTrue(result.allowed)

    def test_check_allows_when_unlimited(self):
        self.plan.max_engagements = 0
        self.plan.save()
        for _ in range(10):
            self._create_engagement()
        rule = EngagementsPerTenantRule()
        result = rule.check(self.plan, self.tenant)
        self.assertTrue(result.allowed)


class FindingsPerEngagementRuleTests(_BaseMixin):

    def _create_engagement(self):
        from engagements.models import Engagement
        return Engagement.objects.create(
            tenant=self.tenant, name='Test Engagement',
            created_by=self.user,
        )

    def test_returns_zero_when_no_engagement(self):
        rule = FindingsPerEngagementRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 0)

    def test_counts_findings_for_engagement(self):
        eng = self._create_engagement()
        for i in range(3):
            Finding.objects.create(
                tenant=self.tenant, engagement=eng,
                title=f'Finding {i}', severity='high',
                created_by=self.user,
            )
        rule = FindingsPerEngagementRule()
        self.assertEqual(
            rule.get_current_usage(self.tenant, engagement=eng), 3,
        )


class ImagesPerFindingRuleTests(_BaseMixin):

    def _create_engagement_and_finding(self):
        from engagements.models import Engagement
        eng = Engagement.objects.create(
            tenant=self.tenant, name='Eng', created_by=self.user,
        )
        finding = Finding.objects.create(
            tenant=self.tenant, engagement=eng,
            title='Find', severity='high', created_by=self.user,
        )
        return eng, finding

    def test_returns_zero_when_no_finding(self):
        rule = ImagesPerFindingRule()
        self.assertEqual(rule.get_current_usage(self.tenant), 0)

    def test_counts_active_and_draft_attachments(self):
        eng, finding = self._create_engagement_and_finding()
        for status_val in ['active', 'draft', 'active']:
            Attachment.objects.create(
                tenant=self.tenant, engagement=eng, finding=finding,
                status=status_val, filename='img.png', sha256='a' * 64,
                storage_uri='test', content_type='image/png', size_bytes=100,
                uploaded_by=self.user,
            )
        # Add an orphaned attachment (should NOT be counted)
        Attachment.objects.create(
            tenant=self.tenant, engagement=eng, finding=finding,
            status='orphaned', filename='old.png', sha256='b' * 64,
            storage_uri='test2', content_type='image/png', size_bytes=100,
            uploaded_by=self.user,
        )

        rule = ImagesPerFindingRule()
        self.assertEqual(
            rule.get_current_usage(self.tenant, finding=finding), 3,
        )


class LimitRegistryTests(TestCase):

    def test_all_codes_returns_registered_rules(self):
        codes = LimitRegistry.all_codes()
        self.assertIn('members_per_tenant', codes)
        self.assertIn('clients_per_tenant', codes)
        self.assertIn('assets_per_tenant', codes)
        self.assertIn('engagements_per_tenant', codes)
        self.assertIn('findings_per_engagement', codes)
        self.assertIn('images_per_finding', codes)

    def test_check_unknown_rule_allows(self):
        plan = SubscriptionPlan()
        result = LimitRegistry.check('nonexistent_rule', plan, None)
        self.assertTrue(result.allowed)


# -----------------------------------------------------------------------
# Service tests
# -----------------------------------------------------------------------

class GetPlanForTenantTests(_BaseMixin):

    def test_returns_active_plan(self):
        plan = get_plan_for_tenant(self.tenant)
        self.assertEqual(plan.code, 'test-plan')

    def test_falls_back_to_default_when_expired(self):
        self.subscription.status = SubscriptionStatus.EXPIRED
        self.subscription.save()
        plan = get_plan_for_tenant(self.tenant)
        # Falls back to the default plan (same one in this test)
        self.assertEqual(plan.code, 'test-plan')

    def test_falls_back_to_default_when_no_subscription(self):
        self.subscription.delete()
        plan = get_plan_for_tenant(self.tenant)
        self.assertEqual(plan.code, 'test-plan')

    def test_returns_none_when_no_plans(self):
        self.subscription.delete()
        self.plan.delete()
        self.tenant.refresh_from_db()
        plan = get_plan_for_tenant(self.tenant)
        self.assertIsNone(plan)


class AssignDefaultPlanTests(TestCase):

    def setUp(self):
        TenantSubscription.objects.all().delete()
        SubscriptionPlan.objects.all().delete()

        self.tenant = Tenant.objects.create(
            name='New Corp', slug='new-corp', status=TenantStatus.ACTIVE,
        )
        self.plan = SubscriptionPlan.objects.create(
            name='Free', code='free-test', is_default=True, is_active=True,
        )

    def test_creates_subscription(self):
        assign_default_plan(self.tenant)
        self.assertTrue(TenantSubscription.objects.filter(tenant=self.tenant).exists())
        sub = TenantSubscription.objects.get(tenant=self.tenant)
        self.assertEqual(sub.plan.code, 'free-test')
        self.assertEqual(sub.status, SubscriptionStatus.ACTIVE)

    def test_idempotent(self):
        assign_default_plan(self.tenant)
        assign_default_plan(self.tenant)
        self.assertEqual(
            TenantSubscription.objects.filter(tenant=self.tenant).count(), 1,
        )

    def test_skips_when_no_default_plan(self):
        self.plan.is_default = False
        self.plan.save()
        assign_default_plan(self.tenant)
        self.assertFalse(TenantSubscription.objects.filter(tenant=self.tenant).exists())


class GetSubscriptionInfoTests(_BaseMixin):

    def test_returns_plan_info(self):
        info = get_subscription_info(self.tenant)
        self.assertEqual(info['plan_code'], 'test-plan')
        self.assertEqual(info['plan_name'], 'Test Plan')
        self.assertEqual(info['limits']['max_findings_per_engagement'], 5)
        self.assertEqual(info['limits']['max_images_per_finding'], 3)
        self.assertIn('features', info)

    def test_returns_fallback_when_no_plan(self):
        self.subscription.delete()
        self.plan.delete()
        self.tenant.refresh_from_db()
        info = get_subscription_info(self.tenant)
        self.assertEqual(info['plan_code'], 'free')
        self.assertEqual(info['limits'], {})

    def test_usage_counts_members(self):
        info = get_subscription_info(self.tenant)
        # _BaseMixin creates 1 TenantMember in setUp
        self.assertEqual(info['usage']['members'], 1)

    def test_usage_counts_clients(self):
        from clients.models import Client
        Client.objects.create(tenant=self.tenant, name='Client A')
        Client.objects.create(tenant=self.tenant, name='Client B')
        info = get_subscription_info(self.tenant)
        self.assertEqual(info['usage']['clients'], 2)

    def test_usage_counts_assets(self):
        from assets.models import Asset
        Asset.objects.create(tenant=self.tenant, name='Asset A', asset_type='HOST')
        Asset.objects.create(tenant=self.tenant, name='Asset B', asset_type='HOST')
        Asset.objects.create(tenant=self.tenant, name='Asset C', asset_type='HOST')
        info = get_subscription_info(self.tenant)
        self.assertEqual(info['usage']['assets'], 3)

    def test_usage_counts_engagements(self):
        from engagements.models import Engagement
        Engagement.objects.create(tenant=self.tenant, name='Eng 1', created_by=self.user)
        Engagement.objects.create(tenant=self.tenant, name='Eng 2', created_by=self.user)
        info = get_subscription_info(self.tenant)
        self.assertEqual(info['usage']['engagements'], 2)

    def test_usage_empty_when_no_plan(self):
        self.subscription.delete()
        self.plan.delete()
        self.tenant.refresh_from_db()
        info = get_subscription_info(self.tenant)
        self.assertEqual(info['usage'], {})


class GetTenantUsageTests(_BaseMixin):

    def test_returns_zero_counts_for_new_tenant(self):
        usage = _get_tenant_usage(self.tenant)
        # _BaseMixin creates 1 TenantMember in setUp
        self.assertEqual(usage['members'], 1)
        self.assertEqual(usage['clients'], 0)
        self.assertEqual(usage['assets'], 0)
        self.assertEqual(usage['engagements'], 0)

    def test_counts_multiple_resources(self):
        from clients.models import Client
        from assets.models import Asset
        from engagements.models import Engagement

        # Add a second member
        extra_user = User.objects.create_user(
            email='extra@example.com', password='testpass123',
        )
        TenantMember.objects.create(
            tenant=self.tenant, user=extra_user, role=TenantRole.MEMBER,
        )

        Client.objects.create(tenant=self.tenant, name='Client 1')
        Client.objects.create(tenant=self.tenant, name='Client 2')
        Client.objects.create(tenant=self.tenant, name='Client 3')

        Asset.objects.create(tenant=self.tenant, name='Asset 1', asset_type='HOST')
        Asset.objects.create(tenant=self.tenant, name='Asset 2', asset_type='HOST')

        Engagement.objects.create(tenant=self.tenant, name='Eng 1', created_by=self.user)

        usage = _get_tenant_usage(self.tenant)
        self.assertEqual(usage['members'], 2)
        self.assertEqual(usage['clients'], 3)
        self.assertEqual(usage['assets'], 2)
        self.assertEqual(usage['engagements'], 1)


class CheckLimitTests(_BaseMixin):

    def test_allows_when_no_plan(self):
        self.subscription.delete()
        self.plan.delete()
        self.tenant.refresh_from_db()
        result = check_limit('findings_per_engagement', self.tenant)
        self.assertTrue(result.allowed)


# -----------------------------------------------------------------------
# Image limit tests
# -----------------------------------------------------------------------

class CountImageTokensTests(TestCase):

    def test_counts_unique_tokens(self):
        md = (
            '![img1](/api/attachments/11111111-1111-1111-1111-111111111111/content/?sig=abc)\n'
            '![img2](/api/attachments/22222222-2222-2222-2222-222222222222/content/?sig=def)\n'
            '![img1 again](/api/attachments/11111111-1111-1111-1111-111111111111/content/?sig=ghi)\n'
        )
        self.assertEqual(count_image_tokens(md, ''), 2)

    def test_counts_across_both_fields(self):
        desc = '![a](/api/attachments/11111111-1111-1111-1111-111111111111/content/?sig=x)'
        rec = '![b](/api/attachments/22222222-2222-2222-2222-222222222222/content/?sig=y)'
        self.assertEqual(count_image_tokens(desc, rec), 2)

    def test_returns_zero_for_empty(self):
        self.assertEqual(count_image_tokens('', ''), 0)

    def test_returns_zero_for_no_images(self):
        self.assertEqual(count_image_tokens('Some text **bold**', 'More text'), 0)

    def test_handles_none(self):
        self.assertEqual(count_image_tokens(None, None), 0)


class CheckImageLimitTests(_BaseMixin):

    def _make_image_md(self, count):
        """Generate markdown with `count` unique image tokens."""
        lines = []
        for i in range(count):
            # Build valid UUIDs like aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
            hex_char = format(i, 'x')
            uid = (
                f'{hex_char * 8}-{hex_char * 4}-{hex_char * 4}'
                f'-{hex_char * 4}-{hex_char * 12}'
            )
            lines.append(f'![img{i}](/api/attachments/{uid}/content/?sig=s{i})')
        return '\n'.join(lines)

    def test_allows_under_limit(self):
        md = self._make_image_md(2)
        result = check_image_limit(self.tenant, md, '')
        self.assertTrue(result.allowed)
        self.assertEqual(result.current, 2)
        self.assertEqual(result.limit, 3)

    def test_allows_at_limit(self):
        md = self._make_image_md(3)
        result = check_image_limit(self.tenant, md, '')
        self.assertTrue(result.allowed)
        self.assertEqual(result.current, 3)

    def test_blocks_over_limit(self):
        md = self._make_image_md(4)
        result = check_image_limit(self.tenant, md, '')
        self.assertFalse(result.allowed)
        self.assertIn('limit reached', result.message)

    def test_allows_when_unlimited(self):
        self.plan.max_images_per_finding = 0
        self.plan.save()
        md = self._make_image_md(20)
        result = check_image_limit(self.tenant, md, '')
        self.assertTrue(result.allowed)


# -----------------------------------------------------------------------
# Guard tests
# -----------------------------------------------------------------------

class SubscriptionGuardTests(_BaseMixin):

    def _make_request(self, method='POST'):
        factory = APIRequestFactory()
        req = factory.post('/fake/') if method == 'POST' else factory.get('/fake/')
        req.tenant = self.tenant
        req.user = self.user
        return req

    def _make_view(self, action='create', subscription_limits=None):
        view = MagicMock()
        view.action = action
        view.subscription_limits = subscription_limits
        return view

    def test_allows_get_requests(self):
        guard = SubscriptionGuard()
        factory = APIRequestFactory()
        req = factory.get('/fake/')
        req.tenant = self.tenant
        self.assertTrue(guard.has_permission(req, MagicMock()))

    def test_allows_when_no_limits_map(self):
        guard = SubscriptionGuard()
        req = self._make_request()
        view = self._make_view(subscription_limits=None)
        self.assertTrue(guard.has_permission(req, view))

    def test_allows_when_action_not_in_limits(self):
        guard = SubscriptionGuard()
        req = self._make_request()
        view = self._make_view(
            action='list',
            subscription_limits={'create': {'rule': 'findings_per_engagement'}},
        )
        self.assertTrue(guard.has_permission(req, view))

    def test_allows_when_under_limit(self):
        from engagements.models import Engagement
        eng = Engagement.objects.create(
            tenant=self.tenant, name='Empty Eng', created_by=self.user,
        )
        guard = SubscriptionGuard()
        req = self._make_request()
        view = self._make_view(
            action='create',
            subscription_limits={
                'create': {
                    'rule': 'findings_per_engagement',
                    'context': lambda v, r: {'engagement': eng},
                },
            },
        )
        # No findings exist for this engagement, so usage = 0 < 5
        self.assertTrue(guard.has_permission(req, view))

    def test_raises_when_at_limit(self):
        from engagements.models import Engagement
        eng = Engagement.objects.create(
            tenant=self.tenant, name='Full Eng', created_by=self.user,
        )
        for i in range(5):
            Finding.objects.create(
                tenant=self.tenant, engagement=eng,
                title=f'F{i}', severity='high', created_by=self.user,
            )

        guard = SubscriptionGuard()
        req = self._make_request()
        view = self._make_view(
            action='create',
            subscription_limits={
                'create': {
                    'rule': 'findings_per_engagement',
                    'context': lambda v, r: {'engagement': eng},
                },
            },
        )
        with self.assertRaises(SubscriptionLimitExceeded) as ctx:
            guard.has_permission(req, view)
        self.assertEqual(ctx.exception.status_code, 402)

    def test_allows_when_no_tenant(self):
        guard = SubscriptionGuard()
        factory = APIRequestFactory()
        req = factory.post('/fake/')
        # No tenant attribute
        view = self._make_view(
            action='create',
            subscription_limits={'create': {'rule': 'findings_per_engagement'}},
        )
        self.assertTrue(guard.has_permission(req, view))


# -----------------------------------------------------------------------
# Seed command tests
# -----------------------------------------------------------------------

class EnsureSubscriptionPlansCommandTests(TestCase):

    def test_command_creates_plan_and_backfills(self):
        from io import StringIO
        from django.core.management import call_command

        # Clean up any existing plans from the data migration
        TenantSubscription.objects.all().delete()
        SubscriptionPlan.objects.all().delete()

        tenant = Tenant.objects.create(
            name='Cmd Corp', slug='cmd-corp', status=TenantStatus.ACTIVE,
        )

        out = StringIO()
        call_command('ensure_subscription_plans', stdout=out)
        output = out.getvalue()

        self.assertIn('Free', output)
        self.assertTrue(SubscriptionPlan.objects.filter(code='free').exists())
        self.assertTrue(TenantSubscription.objects.filter(tenant=tenant).exists())

    def test_command_is_idempotent(self):
        from io import StringIO
        from django.core.management import call_command

        TenantSubscription.objects.all().delete()
        SubscriptionPlan.objects.all().delete()

        call_command('ensure_subscription_plans', stdout=StringIO())
        call_command('ensure_subscription_plans', stdout=StringIO())

        self.assertEqual(SubscriptionPlan.objects.filter(code='free').count(), 1)


# -----------------------------------------------------------------------
# Integration tests — Free plan limit enforcement at the API level
# -----------------------------------------------------------------------

from rest_framework.test import APITestCase

from assets.models import Asset
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from clients.models import Client
from core.test_utils import login_as
from engagements.models import Engagement, Sow, SowAsset

STRONG_PASSWORD = 'Str0ngP@ss!99'


class _FreePlanIntegrationBase(APITestCase):
    """Shared setup: tenant with Free plan, owner with full auth."""

    def setUp(self):
        seed_permissions()
        self.tenant = Tenant.objects.create(
            name='Limit Corp', slug='limit-corp', status=TenantStatus.ACTIVE,
        )
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = User.objects.create_user(
            email='owner@limit.com', password=STRONG_PASSWORD,
            first_name='Owner', last_name='User', email_verified=True,
        )
        self.owner.mfa_enabled = True
        self.owner.save(update_fields=['mfa_enabled'])

        self.owner_member = TenantMember.objects.create(
            tenant=self.tenant, user=self.owner, role=TenantRole.OWNER,
        )
        self.owner_member.groups.add(self.groups['Administrators'])

        # Use the seeded Free plan but override limits to small numbers for testing
        self.plan = SubscriptionPlan.objects.get(code='free')
        self.subscription = TenantSubscription.objects.get_or_create(
            tenant=self.tenant,
            defaults={'plan': self.plan, 'status': SubscriptionStatus.ACTIVE},
        )[0]

    def _auth(self):
        login_as(self.client, self.owner, self.tenant)


class MembersLimitIntegrationTests(_FreePlanIntegrationBase):
    """POST /api/authorization/members/ returns 402 at member limit."""

    URL = '/api/authorization/members/'

    def setUp(self):
        super().setUp()
        self.plan.max_members = 2
        self.plan.save()

    def test_allows_under_limit(self):
        self._auth()
        resp = self.client.post(self.URL, {
            'email': 'member1@limit.com',
            'first_name': 'M1', 'last_name': 'User',
            'group_ids': [str(self.groups['Analysts'].pk)],
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_blocks_at_limit(self):
        # Owner counts as 1 member. Create 1 more to hit limit of 2.
        u2 = User.objects.create_user(
            email='m2@limit.com', password=STRONG_PASSWORD, email_verified=True,
        )
        TenantMember.objects.create(
            tenant=self.tenant, user=u2, role=TenantRole.MEMBER,
        )
        self._auth()
        resp = self.client.post(self.URL, {
            'email': 'blocked@limit.com',
            'first_name': 'Blocked', 'last_name': 'User',
            'group_ids': [],
        }, format='json')
        self.assertEqual(resp.status_code, 402)
        self.assertIn('limit reached', resp.data['message'])

    def test_response_body_has_detail(self):
        self.plan.max_members = 1
        self.plan.save()
        self._auth()
        resp = self.client.post(self.URL, {
            'email': 'extra@limit.com',
            'first_name': 'X', 'last_name': 'User',
            'group_ids': [],
        }, format='json')
        self.assertEqual(resp.status_code, 402)
        self.assertIn('Team members', resp.data['message'])


class ClientsLimitIntegrationTests(_FreePlanIntegrationBase):
    """POST /api/clients/ returns 402 at client limit."""

    URL = '/api/clients/'

    def setUp(self):
        super().setUp()
        self.plan.max_clients = 2
        self.plan.save()

    def test_allows_under_limit(self):
        self._auth()
        resp = self.client.post(self.URL, {'name': 'Client 1'}, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_blocks_at_limit(self):
        Client.objects.create(tenant=self.tenant, name='C1')
        Client.objects.create(tenant=self.tenant, name='C2')
        self._auth()
        resp = self.client.post(self.URL, {'name': 'C3'}, format='json')
        self.assertEqual(resp.status_code, 402)
        self.assertIn('limit reached', resp.data['message'])

    def test_list_still_works_at_limit(self):
        Client.objects.create(tenant=self.tenant, name='C1')
        Client.objects.create(tenant=self.tenant, name='C2')
        self._auth()
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)


class AssetsLimitIntegrationTests(_FreePlanIntegrationBase):
    """POST /api/assets/ returns 402 at asset limit."""

    URL = '/api/assets/'

    def setUp(self):
        super().setUp()
        self.plan.max_assets = 2
        self.plan.save()
        self.org = Client.objects.create(tenant=self.tenant, name='Org')

    def test_allows_under_limit(self):
        self._auth()
        resp = self.client.post(self.URL, {
            'name': 'Asset 1', 'asset_type': 'host', 'client': str(self.org.pk),
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_blocks_at_limit(self):
        Asset.objects.create(tenant=self.tenant, name='A1', asset_type='host', client=self.org)
        Asset.objects.create(tenant=self.tenant, name='A2', asset_type='host', client=self.org)
        self._auth()
        resp = self.client.post(self.URL, {
            'name': 'A3', 'asset_type': 'host', 'client': str(self.org.pk),
        }, format='json')
        self.assertEqual(resp.status_code, 402)
        self.assertIn('limit reached', resp.data['message'])

    def test_list_still_works_at_limit(self):
        Asset.objects.create(tenant=self.tenant, name='A1', asset_type='host', client=self.org)
        Asset.objects.create(tenant=self.tenant, name='A2', asset_type='host', client=self.org)
        self._auth()
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)


class EngagementsLimitIntegrationTests(_FreePlanIntegrationBase):
    """POST /api/engagements/ returns 402 at engagement limit."""

    URL = '/api/engagements/'

    def setUp(self):
        super().setUp()
        self.plan.max_engagements = 2
        self.plan.save()

    def test_allows_under_limit(self):
        self._auth()
        resp = self.client.post(self.URL, {'name': 'Eng 1'}, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_blocks_at_limit(self):
        Engagement.objects.create(tenant=self.tenant, name='E1', created_by=self.owner)
        Engagement.objects.create(tenant=self.tenant, name='E2', created_by=self.owner)
        self._auth()
        resp = self.client.post(self.URL, {'name': 'E3'}, format='json')
        self.assertEqual(resp.status_code, 402)
        self.assertIn('limit reached', resp.data['message'])

    def test_list_still_works_at_limit(self):
        Engagement.objects.create(tenant=self.tenant, name='E1', created_by=self.owner)
        Engagement.objects.create(tenant=self.tenant, name='E2', created_by=self.owner)
        self._auth()
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)


class FindingsLimitIntegrationTests(_FreePlanIntegrationBase):
    """POST /api/engagements/<id>/findings/ returns 402 at findings limit."""

    def setUp(self):
        super().setUp()
        self.plan.max_findings_per_engagement = 2
        self.plan.save()

        self.org = Client.objects.create(tenant=self.tenant, name='Org')
        self.asset = Asset.objects.create(
            tenant=self.tenant, name='Target', asset_type='host', client=self.org,
        )
        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name='Eng', created_by=self.owner, client=self.org,
        )
        sow = Sow.objects.create(engagement=self.engagement, title='SoW', status='approved')
        SowAsset.objects.create(sow=sow, asset=self.asset, in_scope=True)

    def _url(self):
        return f'/api/engagements/{self.engagement.pk}/findings/'

    def test_allows_under_limit(self):
        self._auth()
        resp = self.client.post(self._url(), {
            'title': 'F1', 'severity': 'high', 'asset': str(self.asset.pk),
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_blocks_at_limit(self):
        for i in range(2):
            Finding.objects.create(
                tenant=self.tenant, engagement=self.engagement,
                title=f'F{i}', severity='high', created_by=self.owner,
                asset=self.asset,
            )
        self._auth()
        resp = self.client.post(self._url(), {
            'title': 'F3', 'severity': 'high', 'asset': str(self.asset.pk),
        }, format='json')
        self.assertEqual(resp.status_code, 402)
        self.assertIn('limit reached', resp.data['message'])


class ImagesLimitIntegrationTests(_FreePlanIntegrationBase):
    """Finding create/update with too many images returns 402."""

    def setUp(self):
        super().setUp()
        self.plan.max_images_per_finding = 2
        self.plan.save()

        self.org = Client.objects.create(tenant=self.tenant, name='Org')
        self.asset = Asset.objects.create(
            tenant=self.tenant, name='Target', asset_type='host', client=self.org,
        )
        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name='Eng', created_by=self.owner, client=self.org,
        )
        sow = Sow.objects.create(engagement=self.engagement, title='SoW', status='approved')
        SowAsset.objects.create(sow=sow, asset=self.asset, in_scope=True)

    def _findings_url(self):
        return f'/api/engagements/{self.engagement.pk}/findings/'

    def _make_image_md(self, count):
        lines = []
        for i in range(count):
            h = format(i, 'x')
            uid = f'{h * 8}-{h * 4}-{h * 4}-{h * 4}-{h * 12}'
            lines.append(f'![img{i}](/api/attachments/{uid}/content/?sig=s{i})')
        return '\n'.join(lines)

    def test_allows_images_under_limit(self):
        self._auth()
        resp = self.client.post(self._findings_url(), {
            'title': 'F1', 'severity': 'high', 'asset': str(self.asset.pk),
            'description_md': self._make_image_md(2),
        }, format='json')
        self.assertEqual(resp.status_code, 201)

    def test_blocks_images_over_limit(self):
        self._auth()
        resp = self.client.post(self._findings_url(), {
            'title': 'F1', 'severity': 'high', 'asset': str(self.asset.pk),
            'description_md': self._make_image_md(3),
        }, format='json')
        self.assertEqual(resp.status_code, 402)
        self.assertIn('limit reached', resp.data['message'])

    def test_blocks_images_on_update(self):
        self._auth()
        # Create a finding with 1 image (under limit)
        resp = self.client.post(self._findings_url(), {
            'title': 'F1', 'severity': 'high', 'asset': str(self.asset.pk),
            'description_md': self._make_image_md(1),
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        finding_id = resp.data['id']

        # Update to 3 images (over limit)
        detail_url = f'/api/engagements/{self.engagement.pk}/findings/{finding_id}/'
        resp = self.client.patch(detail_url, {
            'description_md': self._make_image_md(3),
        }, format='json')
        self.assertEqual(resp.status_code, 402)
        self.assertIn('limit reached', resp.data['message'])
