import logging

from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

from django.core.exceptions import ValidationError

from .models import Tenant, TenantStatus

logger = logging.getLogger("bytescop.tenancy")

# Paths that do not require a tenant context.
TENANT_EXEMPT_PREFIXES = (
    "/admin/",
    "/api/health/",
    "/api/auth/",
    "/api/contact-us/",
    "/api/attachments/",
    "/api/dev/",
    "/api/tenant/close/status/",
)


class TenantMiddleware(MiddlewareMixin):
    """Resolve tenant from session.

    Reads tenant_id from the Django session (set at login/switch-tenant).
    Returns 400 for authenticated API routes with missing/invalid tenant.
    Exempt paths (auth, health, attachments) skip the check.
    """

    def process_request(self, request):
        tenant_id = request.session.get('tenant_id') if hasattr(request, 'session') else None
        tenant = None
        if tenant_id:
            try:
                tenant = Tenant.objects.get(pk=tenant_id)
            except (Tenant.DoesNotExist, ValueError, ValidationError):
                logger.warning("Tenant not found id=%s path=%s", tenant_id, request.get_full_path())

        # Block closing tenants with a distinct error code
        if tenant and tenant.status == TenantStatus.CLOSING:
            if self._requires_tenant(request):
                return JsonResponse(
                    {"detail": "This tenant is being closed.", "code": "tenant_closing"},
                    status=403,
                )

        # Block non-active tenants (suspended, disabled)
        if tenant and tenant.status != TenantStatus.ACTIVE:
            tenant = None

        if tenant:
            logger.debug("Tenant resolved id=%s slug=%s", tenant.pk, tenant.slug)
        request.tenant = tenant

        # Reject authenticated API routes with no valid tenant.
        # Unauthenticated requests pass through — DRF will return 401/403.
        user = getattr(request, 'user', None)
        is_authenticated = user and hasattr(user, 'is_authenticated') and user.is_authenticated
        if tenant is None and is_authenticated and self._requires_tenant(request):
            return JsonResponse(
                {"detail": "Tenant context required. Please log in."},
                status=400,
            )

    def _requires_tenant(self, request):
        """Return True if this path needs a valid tenant context."""
        path = request.path
        if not path.startswith("/api/"):
            return False
        for prefix in TENANT_EXEMPT_PREFIXES:
            if path.startswith(prefix):
                return False
        return True
