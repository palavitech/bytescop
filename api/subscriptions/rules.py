"""Subscription limit rules.

Each rule is a self-contained class that knows:
  - Which plan field it reads for the limit
  - How to count current usage
  - How to produce a user-friendly denial message

Rules register themselves in a global registry. The SubscriptionGuard
looks up rules by code and calls check().

Usage:
    result = LimitRegistry.check('findings_per_engagement', tenant, engagement=eng)
    if not result.allowed:
        return Response({'detail': result.message}, status=402)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from assets.models import Asset
from clients.models import Client
from engagements.models import Engagement
from evidence.models import Attachment
from findings.models import Finding
from tenancy.models import TenantMember

logger = logging.getLogger('bytescop.subscriptions')


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class LimitResult:
    """Outcome of a limit check."""
    allowed: bool
    current: int
    limit: int          # 0 means unlimited
    message: str = ''


# ---------------------------------------------------------------------------
# Abstract base rule
# ---------------------------------------------------------------------------

class LimitRule:
    """Abstract base for subscription limit rules.

    Subclasses must define:
        code       — unique rule identifier (e.g. 'findings_per_engagement')
        plan_field — name of the SubscriptionPlan field that stores the limit
        label      — human-readable name for error messages

    And implement:
        get_current_usage(tenant, **context) → int
    """

    code: str = ''
    plan_field: str = ''
    label: str = ''

    def get_current_usage(self, tenant, **context) -> int:
        raise NotImplementedError

    def check(self, plan, tenant, **context) -> LimitResult:
        """Check whether the limit is exceeded.

        Returns LimitResult with allowed=True if under the limit or
        the limit is 0 (unlimited).
        """
        limit = plan.get_limit(self.plan_field)

        # 0 = unlimited
        if limit == 0:
            return LimitResult(allowed=True, current=0, limit=0)

        current = self.get_current_usage(tenant, **context)

        if current >= limit:
            return LimitResult(
                allowed=False,
                current=current,
                limit=limit,
                message=(
                    f'{self.label} limit reached ({current}/{limit}). '
                    f'Upgrade your plan to increase this limit.'
                ),
            )

        return LimitResult(allowed=True, current=current, limit=limit)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

class _LimitRegistry:
    """Central registry of all limit rules."""

    def __init__(self):
        self._rules: dict[str, LimitRule] = {}

    def register(self, rule: LimitRule):
        if rule.code in self._rules:
            raise ValueError(f'Duplicate rule code: {rule.code}')
        self._rules[rule.code] = rule

    def get(self, code: str) -> LimitRule | None:
        return self._rules.get(code)

    def check(self, code: str, plan, tenant, **context) -> LimitResult:
        """Look up rule by code and run the check."""
        rule = self._rules.get(code)
        if rule is None:
            logger.warning('Unknown subscription rule: %s — allowing by default', code)
            return LimitResult(allowed=True, current=0, limit=0)
        return rule.check(plan, tenant, **context)

    def all_codes(self) -> list[str]:
        return sorted(self._rules.keys())


LimitRegistry = _LimitRegistry()


# ---------------------------------------------------------------------------
# Concrete rules
# ---------------------------------------------------------------------------

class MembersPerTenantRule(LimitRule):
    code = 'members_per_tenant'
    plan_field = 'max_members'
    label = 'Team members'

    def get_current_usage(self, tenant, **context) -> int:
        return TenantMember.objects.filter(tenant=tenant).count()


class ClientsPerTenantRule(LimitRule):
    code = 'clients_per_tenant'
    plan_field = 'max_clients'
    label = 'Organizations'

    def get_current_usage(self, tenant, **context) -> int:
        return Client.objects.filter(tenant=tenant).count()


class AssetsPerTenantRule(LimitRule):
    code = 'assets_per_tenant'
    plan_field = 'max_assets'
    label = 'Assets'

    def get_current_usage(self, tenant, **context) -> int:
        return Asset.objects.filter(tenant=tenant).count()


class EngagementsPerTenantRule(LimitRule):
    code = 'engagements_per_tenant'
    plan_field = 'max_engagements'
    label = 'Engagements'

    def get_current_usage(self, tenant, **context) -> int:
        return Engagement.objects.filter(tenant=tenant).count()


class FindingsPerEngagementRule(LimitRule):
    code = 'findings_per_engagement'
    plan_field = 'max_findings_per_engagement'
    label = 'Findings per engagement'

    def get_current_usage(self, tenant, **context) -> int:
        engagement = context.get('engagement')
        if engagement is None:
            return 0
        return Finding.objects.filter(
            tenant=tenant,
            engagement=engagement,
        ).count()


class ImagesPerFindingRule(LimitRule):
    """Count DRAFT + ACTIVE attachments linked to a finding's engagement.

    When uploading an image, the finding_id may not be known yet (images
    are uploaded to an engagement, then linked when the finding is saved).
    We count per-finding when a finding_id is provided, otherwise we
    allow the upload (the limit is re-checked on finding save via
    reconciliation).

    For finding creation/update, we count attachments already linked to
    the specific finding (ACTIVE) plus any being referenced in the markdown.
    """
    code = 'images_per_finding'
    plan_field = 'max_images_per_finding'
    label = 'Images per finding'

    def get_current_usage(self, tenant, **context) -> int:
        finding = context.get('finding')
        if finding is None:
            return 0
        return Attachment.objects.filter(
            tenant=tenant,
            finding=finding,
            status__in=['draft', 'active'],
        ).count()


# ---------------------------------------------------------------------------
# Auto-register all concrete rules
# ---------------------------------------------------------------------------

LimitRegistry.register(MembersPerTenantRule())
LimitRegistry.register(ClientsPerTenantRule())
LimitRegistry.register(AssetsPerTenantRule())
LimitRegistry.register(EngagementsPerTenantRule())
LimitRegistry.register(FindingsPerEngagementRule())
LimitRegistry.register(ImagesPerFindingRule())
