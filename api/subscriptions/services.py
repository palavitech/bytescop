"""Subscription services.

Provides:
  - get_plan_for_tenant(tenant) — resolve the active plan (fallback: default plan)
  - get_subscription_info(tenant) — build the subscription payload for API responses
  - assign_default_plan(tenant) — attach the default plan to a newly created tenant
  - check_limit(code, tenant, **context) — run a limit rule check
  - check_image_limit(tenant, description_md, recommendation_md) — image count check
"""

import logging
import re

from .models import SubscriptionPlan, SubscriptionStatus, TenantSubscription
from .rules import LimitRegistry, LimitResult

logger = logging.getLogger('bytescop.subscriptions')


def get_plan_for_tenant(tenant):
    """Return the active SubscriptionPlan for a tenant.

    Falls back to the default plan if no subscription exists or the
    subscription is inactive.
    """
    try:
        sub = tenant.subscription
        if sub.is_active:
            return sub.plan
    except TenantSubscription.DoesNotExist:
        pass

    # Fallback: default plan
    plan = SubscriptionPlan.objects.filter(is_default=True, is_active=True).first()
    if plan is None:
        logger.error('No default subscription plan found — allowing everything')
    return plan


def _get_tenant_usage(tenant):
    """Return current resource counts for the tenant."""
    from tenancy.models import TenantMember
    from clients.models import Client
    from assets.models import Asset
    from engagements.models import Engagement
    from projects.models import Project

    return {
        'members': TenantMember.objects.filter(tenant=tenant).count(),
        'clients': Client.objects.filter(tenant=tenant).count(),
        'assets': Asset.objects.filter(tenant=tenant).count(),
        'projects': Project.objects.filter(tenant=tenant).count(),
        'engagements': Engagement.objects.filter(tenant=tenant).count(),
    }


def get_subscription_info(tenant):
    """Build the subscription dict for profile / auth API responses."""
    plan = get_plan_for_tenant(tenant)
    if plan is None:
        return {
            'plan_code': 'free',
            'plan_name': 'Free',
            'limits': {},
            'features': {},
            'usage': {},
        }

    return {
        'plan_code': plan.code,
        'plan_name': plan.name,
        'limits': {
            'max_members': plan.max_members,
            'max_clients': plan.max_clients,
            'max_assets': plan.max_assets,
            'max_projects': plan.max_projects,
            'max_engagements': plan.max_engagements,
            'max_findings_per_engagement': plan.max_findings_per_engagement,
            'max_images_per_finding': plan.max_images_per_finding,
        },
        'features': {
            'audit_log': plan.audit_log_enabled,
            'data_export': plan.data_export_enabled,
            'custom_branding': plan.custom_branding_enabled,
        },
        'usage': _get_tenant_usage(tenant),
    }


def assign_default_plan(tenant):
    """Create a TenantSubscription with the default plan.

    Called during signup. Idempotent — skips if subscription already exists.
    """
    if TenantSubscription.objects.filter(tenant=tenant).exists():
        return

    plan = SubscriptionPlan.objects.filter(is_default=True, is_active=True).first()
    if plan is None:
        logger.warning(
            'No default subscription plan found — tenant %s has no subscription',
            tenant.slug,
        )
        return

    TenantSubscription.objects.create(
        tenant=tenant,
        plan=plan,
        status=SubscriptionStatus.ACTIVE,
    )
    logger.info('Assigned plan "%s" to tenant %s', plan.code, tenant.slug)


def check_limit(code, tenant, **context) -> LimitResult:
    """Run a subscription limit check for the given tenant.

    Returns a LimitResult. If no plan is found, allows by default.
    """
    plan = get_plan_for_tenant(tenant)
    if plan is None:
        return LimitResult(allowed=True, current=0, limit=0)
    return LimitRegistry.check(code, plan, tenant, **context)


# ---------------------------------------------------------------------------
# Image limit helper
# ---------------------------------------------------------------------------

# Matches attachment tokens in markdown image URLs:
#   ![...](/api/attachments/<uuid>/content/...)
_ATTACHMENT_TOKEN_RE = re.compile(
    r'/api/attachments/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/content/',
    re.IGNORECASE,
)


def count_image_tokens(description_md: str, recommendation_md: str) -> int:
    """Count unique attachment tokens referenced in the markdown fields."""
    combined = (description_md or '') + (recommendation_md or '')
    tokens = set(_ATTACHMENT_TOKEN_RE.findall(combined))
    return len(tokens)


def check_image_limit(tenant, description_md: str, recommendation_md: str) -> LimitResult:
    """Check if the number of images in the markdown exceeds the plan limit.

    This is called from the finding create/update views before saving.
    Counts unique attachment tokens in the combined markdown.
    """
    plan = get_plan_for_tenant(tenant)
    if plan is None:
        return LimitResult(allowed=True, current=0, limit=0)

    limit = plan.max_images_per_finding
    if limit == 0:
        return LimitResult(allowed=True, current=0, limit=0)

    current = count_image_tokens(description_md, recommendation_md)

    if current > limit:
        return LimitResult(
            allowed=False,
            current=current,
            limit=limit,
            message=(
                f'Images per finding limit reached ({current}/{limit}). '
                f'Upgrade your plan to increase this limit.'
            ),
        )

    return LimitResult(allowed=True, current=current, limit=limit)
