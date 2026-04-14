"""Engagement-scoped visibility for non-admin members.

Owners and Administrators see all tenant data. Analysts and Collaborators
only see engagements they are assigned to (via EngagementStakeholder),
and the clients/assets linked to those engagements.

The signal for "full visibility" is the ``user.view`` permission — a system
admin permission that only Administrators receive by default.
"""

import logging

from django.db.models import QuerySet

from authorization.permissions import get_tenant_member, get_user_permissions
from tenancy.models import TenantRole

logger = logging.getLogger("bytescop.scoping")

# Members with this permission bypass engagement scoping and see all data.
FULL_VISIBILITY_PERMISSION = "user.view"


def is_engagement_scoped(request) -> bool:
    """Return True if the request user should only see assigned engagements.

    Returns False for Owners (role bypass) and Administrators (have user.view).
    Returns True for Analysts, Collaborators, and any custom group without
    the full-visibility permission.
    """
    member = get_tenant_member(request)
    if member is None:
        return True  # no membership → scoped (will be blocked by auth anyway)
    if member.role == TenantRole.OWNER:
        return False
    perms = get_user_permissions(member)
    return FULL_VISIBILITY_PERMISSION not in perms


def scope_engagements(qs: QuerySet, request) -> QuerySet:
    """Filter an Engagement queryset to only assigned engagements if scoped."""
    if not is_engagement_scoped(request):
        return qs
    member = get_tenant_member(request)
    if member is None:
        return qs.none()
    return qs.filter(stakeholders__member=member).distinct()


def scope_projects(qs: QuerySet, request) -> QuerySet:
    """Filter a Project queryset to projects containing assigned engagements."""
    if not is_engagement_scoped(request):
        return qs
    member = get_tenant_member(request)
    if member is None:
        return qs.none()
    return qs.filter(
        engagements__stakeholders__member=member,
    ).distinct()


def scope_clients(qs: QuerySet, request) -> QuerySet:
    """Filter a Client queryset to clients from assigned engagements."""
    if not is_engagement_scoped(request):
        return qs
    member = get_tenant_member(request)
    if member is None:
        return qs.none()
    return qs.filter(
        engagements__stakeholders__member=member,
    ).distinct()


def scope_assets(qs: QuerySet, request) -> QuerySet:
    """Filter an Asset queryset to assets in scope for assigned engagements."""
    if not is_engagement_scoped(request):
        return qs
    member = get_tenant_member(request)
    if member is None:
        return qs.none()
    return qs.filter(
        sow_links__sow__engagement__stakeholders__member=member,
    ).distinct()


def scope_findings(qs: QuerySet, request) -> QuerySet:
    """Filter a Finding queryset to findings from assigned engagements."""
    if not is_engagement_scoped(request):
        return qs
    member = get_tenant_member(request)
    if member is None:
        return qs.none()
    return qs.filter(
        engagement__stakeholders__member=member,
    ).distinct()


def get_visible_engagement_ids(request) -> set:
    """Return the set of engagement PKs visible to a scoped user.

    For non-scoped users, returns None (meaning "all").
    """
    if not is_engagement_scoped(request):
        return None
    member = get_tenant_member(request)
    if member is None:
        return set()
    from engagements.models import EngagementStakeholder
    return set(
        EngagementStakeholder.objects.filter(
            member=member,
        ).values_list("engagement_id", flat=True)
    )
