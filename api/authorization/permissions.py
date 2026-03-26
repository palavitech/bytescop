"""DRF permission classes for tenant-scoped RBAC."""

import logging

from rest_framework.permissions import BasePermission

from tenancy.models import TenantMember, TenantRole

logger = logging.getLogger("bytescop.permissions")


def get_tenant_member(request):
    """Resolve and cache the TenantMember for the current request.

    Returns None if the user is not authenticated, no tenant context,
    or no active membership exists.
    """
    if hasattr(request, "_cached_tenant_member"):
        return request._cached_tenant_member

    member = None
    user = getattr(request, "user", None)
    tenant = getattr(request, "tenant", None)

    if user and user.is_authenticated and tenant:
        member = (
            TenantMember.objects
            .filter(tenant=tenant, user=user, is_active=True)
            .prefetch_related("groups__permissions")
            .first()
        )

    request._cached_tenant_member = member
    return member


def get_user_permissions(member):
    """Return a flat set of permission codenames from all the member's groups."""
    if member is None:
        return set()
    return set(
        member.groups
        .values_list("permissions__codename", flat=True)
        .distinct()
    ) - {None}


def check_permission(request, required_codenames):
    """Check if user has the required permissions or is root.

    Returns (member, error_response). If error_response is not None,
    the caller should return it immediately.
    """
    from rest_framework import status as http_status
    from rest_framework.response import Response

    member = get_tenant_member(request)
    if member is None:
        logger.warning(
            "Permission denied (no membership) user=%s tenant=%s required=%s path=%s",
            getattr(getattr(request, "user", None), "email", "?"),
            getattr(getattr(request, "tenant", None), "slug", "-"),
            required_codenames,
            request.get_full_path(),
        )
        return None, Response(
            {"detail": "Tenant membership required."},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    if member.role == TenantRole.OWNER:
        return member, None

    user_perms = get_user_permissions(member)
    missing = [p for p in required_codenames if p not in user_perms]
    if missing:
        logger.warning(
            "Permission denied user=%s tenant=%s required=%s missing=%s path=%s",
            member.user.email,
            getattr(request.tenant, "slug", "-"),
            required_codenames,
            missing,
            request.get_full_path(),
        )
        return member, Response(
            {"detail": "You do not have permission to perform this action."},
            status=http_status.HTTP_403_FORBIDDEN,
        )
    return member, None


class TenantPermission(BasePermission):
    """DRF permission class that checks tenant-scoped group permissions.

    Usage on a ViewSet:
        permission_classes = [IsAuthenticated, TenantPermission]
        required_permissions = {
            'list':           ['client.view'],
            'retrieve':       ['client.view'],
            'create':         ['client.create'],
            'update':         ['client.update'],
            'partial_update': ['client.update'],
            'destroy':        ['client.delete'],
        }

    Root users (role=owner) bypass all permission checks.
    """

    def has_permission(self, request, view):
        member = get_tenant_member(request)
        if member is None:
            return False

        # Root user bypass
        if member.role == TenantRole.OWNER:
            return True

        # Determine required permissions for this action
        required = self._get_required_permissions(view)
        if not required:
            # No permissions mapped for this action → deny (fail-closed)
            action = getattr(view, "action", "?")
            path = request.get_full_path() if hasattr(request, "get_full_path") else "-"
            logger.warning(
                "TenantPermission denied (unmapped action) user=%s tenant=%s action=%s view=%s path=%s",
                member.user.email,
                getattr(request.tenant, "slug", "-"),
                action,
                view.__class__.__name__,
                path,
            )
            return False

        user_perms = get_user_permissions(member)
        if not all(perm in user_perms for perm in required):
            action = getattr(view, "action", "?")
            path = request.get_full_path() if hasattr(request, "get_full_path") else "-"
            logger.warning(
                "TenantPermission denied user=%s tenant=%s action=%s required=%s path=%s",
                member.user.email,
                getattr(request.tenant, "slug", "-"),
                action,
                required,
                path,
            )
            return False
        return True

    def _get_required_permissions(self, view):
        """Read required_permissions from the view, keyed by action name."""
        perm_map = getattr(view, "required_permissions", None)
        if not perm_map:
            return []

        action = getattr(view, "action", None)
        if action and action in perm_map:
            return perm_map[action]

        return []
