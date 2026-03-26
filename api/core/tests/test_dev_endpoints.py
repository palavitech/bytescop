from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from accounts.models import User
from assets.models import Asset
from audit.models import AuditAction, AuditLog
from authorization.models import TenantGroup
from clients.models import Client
from engagements.models import Engagement, Sow, SowAsset
from findings.models import ClassificationEntry, Finding
from subscriptions.models import SubscriptionPlan, TenantSubscription
from tenancy.models import Tenant, TenantMember


@override_settings(DEBUG=True)
class DevSeedCommandTests(TestCase):
    """Test the dev_seed management command."""

    def _run(self, *args):
        out = StringIO()
        call_command('dev_seed', *args, stdout=out, stderr=StringIO())
        return out.getvalue()

    def test_creates_multiple_tenants(self):
        self._run()
        self.assertEqual(Tenant.objects.count(), 3)

    def test_creates_users(self):
        self._run()
        self.assertEqual(
            User.objects.filter(email__endswith='@bytescop.example.com').count(), 10,
        )

    def test_creates_multi_tenant_users(self):
        self._run()
        from django.db.models import Count
        multi = (
            TenantMember.objects.values('user')
            .annotate(tc=Count('tenant'))
            .filter(tc__gt=1)
        )
        self.assertGreater(len(multi), 0)

    def test_creates_domain_data(self):
        self._run()
        self.assertGreater(Client.objects.count(), 0)
        self.assertGreater(Asset.objects.count(), 0)
        self.assertGreater(Engagement.objects.count(), 0)
        self.assertGreater(Finding.objects.count(), 0)

    def test_creates_subscription_plans(self):
        self._run()
        self.assertTrue(SubscriptionPlan.objects.filter(code='free').exists())
        self.assertEqual(TenantSubscription.objects.count(), 3)

    def test_creates_classification_entries(self):
        self._run()
        self.assertGreater(ClassificationEntry.objects.count(), 0)

    def test_creates_default_groups_per_tenant(self):
        self._run()
        for tenant in Tenant.objects.all():
            self.assertTrue(TenantGroup.objects.filter(tenant=tenant, name='Administrators').exists())
            self.assertTrue(TenantGroup.objects.filter(tenant=tenant, name='Analysts').exists())
            self.assertTrue(TenantGroup.objects.filter(tenant=tenant, name='Collaborators').exists())

    def test_creates_audit_entries(self):
        self._run()
        actions = set(AuditLog.objects.values_list('action', flat=True).distinct())
        self.assertIn(AuditAction.CREATE, actions)
        self.assertIn(AuditAction.UPDATE, actions)
        self.assertIn(AuditAction.DELETE, actions)
        self.assertIn(AuditAction.LOGIN_SUCCESS, actions)
        self.assertIn(AuditAction.LOGOUT, actions)
        self.assertIn(AuditAction.LOGIN_FAILED, actions)

    def test_creates_sows_and_scope(self):
        self._run()
        self.assertGreater(Sow.objects.count(), 0)
        self.assertGreater(SowAsset.objects.count(), 0)

    def test_flushes_before_seeding_by_default(self):
        # Run twice — second run should flush and recreate
        self._run()
        first_tenant_ids = set(Tenant.objects.values_list('id', flat=True))
        self._run()
        second_tenant_ids = set(Tenant.objects.values_list('id', flat=True))
        self.assertEqual(Tenant.objects.count(), 3)
        # IDs should differ since data was flushed
        self.assertFalse(first_tenant_ids & second_tenant_ids)

    def test_owner_users_have_owner_role(self):
        self._run()
        owners = TenantMember.objects.filter(role='owner')
        self.assertEqual(owners.count(), 3)

    @override_settings(DEBUG=False)
    def test_fails_when_debug_false(self):
        with self.assertRaises(CommandError):
            self._run()

    def test_dev_routes_not_registered(self):
        """Dev seed/flush API endpoints should not exist."""
        from django.urls import resolve, Resolver404
        for path in ['/api/dev/seed/', '/api/dev/flush/', '/api/dev/flush-all/']:
            with self.assertRaises(Resolver404):
                resolve(path)
