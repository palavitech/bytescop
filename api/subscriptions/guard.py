"""SubscriptionGuard — DRF permission class for subscription limit enforcement.

This is the single centralized gate for all subscription limits. Views
declare which limits apply via a `subscription_limits` dict on the view
class, and the guard handles the rest.

Usage on a ViewSet:

    class EngagementViewSet(AuditedModelViewSet):
        permission_classes = [IsAuthenticated, TenantPermission, SubscriptionGuard]

        subscription_limits = {
            'findings_create': {
                'rule': 'findings_per_engagement',
                'context': lambda view, request: {
                    'engagement': view.get_object(),
                },
            },
            'upload_image': {
                'rule': 'images_per_finding',
                'context': lambda view, request: {
                    'finding': None,  # checked at reconciliation time
                },
            },
        }

The guard:
  1. Checks if the current view action has a subscription_limits entry
  2. If yes, resolves the tenant's plan and runs the rule
  3. Raises SubscriptionLimitExceeded (HTTP 402) if exceeded
  4. Passes through silently if no limit applies

HTTP 402 "Payment Required" is semantically perfect for subscription limits.
"""

import logging

from rest_framework.exceptions import APIException
from rest_framework.permissions import BasePermission

from .services import check_limit

logger = logging.getLogger('bytescop.subscriptions')


class SubscriptionLimitExceeded(APIException):
    """Raised when a subscription limit is exceeded."""
    status_code = 402
    default_detail = 'Subscription limit reached. Upgrade your plan to continue.'
    default_code = 'subscription_limit_exceeded'


class SubscriptionGuard(BasePermission):
    """DRF permission that enforces subscription limits.

    Instead of returning False (which yields a generic 403), this guard
    raises SubscriptionLimitExceeded (402) with a descriptive message
    when a limit is exceeded.
    """

    def has_permission(self, request, view):
        # Only enforce on write operations
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True

        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return True

        limits_map = getattr(view, 'subscription_limits', None)
        if not limits_map:
            return True

        action = getattr(view, 'action', None)
        if action is None:
            return True

        config = limits_map.get(action)
        if config is None:
            return True

        rule_code = config['rule']
        context_fn = config.get('context')
        context = {}
        if context_fn:
            context = context_fn(view, request) or {}

        result = check_limit(rule_code, tenant, **context)

        if not result.allowed:
            logger.info(
                'Subscription limit blocked: rule=%s tenant=%s current=%d limit=%d',
                rule_code, tenant.slug, result.current, result.limit,
            )
            raise SubscriptionLimitExceeded(detail=result.message)

        return True
