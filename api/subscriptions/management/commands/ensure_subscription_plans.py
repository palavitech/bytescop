"""Seed default subscription plans and backfill existing tenants.

Idempotent — safe to run multiple times (creates or updates plans,
skips tenants that already have a subscription).

Usage:
    python manage.py ensure_subscription_plans
"""

from django.core.management.base import BaseCommand

from subscriptions.models import SubscriptionPlan, SubscriptionStatus, TenantSubscription
from tenancy.models import Tenant, TenantStatus


# Plan definitions — the single source of truth for default plans.
# Add new plans here to have them seeded automatically.
DEFAULT_PLANS = [
    {
        'code': 'free',
        'name': 'Free',
        'description': 'Free plan — no limits.',
        'is_default': True,
        'is_active': True,
        'display_order': 0,
        # Limits (0 = unlimited)
        'max_members': 0,
        'max_clients': 0,
        'max_assets': 0,
        'max_engagements': 0,
        'max_findings_per_engagement': 0,
        'max_images_per_finding': 0,
        # Features
        'audit_log_enabled': True,
        'data_export_enabled': False,
        'custom_branding_enabled': False,
    },
]


class Command(BaseCommand):
    help = 'Create or update default subscription plans and backfill existing tenants.'

    def handle(self, *args, **options):
        for plan_def in DEFAULT_PLANS:
            code = plan_def['code']
            plan, created = SubscriptionPlan.objects.update_or_create(
                code=code,
                defaults=plan_def,
            )
            verb = 'Created' if created else 'Updated'
            self.stdout.write(f'  {verb} plan: {plan.name} ({plan.code})')

        # Backfill: assign default plan to tenants without a subscription
        default_plan = SubscriptionPlan.objects.filter(
            is_default=True, is_active=True,
        ).first()

        if default_plan is None:
            self.stdout.write(self.style.WARNING('No default plan found — skipping backfill.'))
            return

        tenants_without_sub = Tenant.objects.filter(
            status=TenantStatus.ACTIVE,
        ).exclude(
            subscription__isnull=False,
        )

        count = 0
        for tenant in tenants_without_sub:
            TenantSubscription.objects.create(
                tenant=tenant,
                plan=default_plan,
                status=SubscriptionStatus.ACTIVE,
            )
            count += 1

        if count:
            self.stdout.write(f'  Backfilled {count} tenant(s) with "{default_plan.name}" plan.')
        else:
            self.stdout.write('  All tenants already have a subscription.')

        self.stdout.write(self.style.SUCCESS('Done.'))
