"""Middleware that enforces MFA setup for users who are required to have it.

Algorithm:
1. Only applies to ``/api/`` paths, skipping exempt prefixes.
2. Reads ``mfa_enabled`` from the Django session (set at login).
3. If ``mfa_enabled`` is ``True`` → fast path, no DB query.
4. If ``mfa_enabled`` is ``False`` → query TenantMember + is_mfa_required()
   → return 403 if required.
5. If no session or unauthenticated → pass through (let DRF handle auth).
"""

import logging

from django.http import JsonResponse

from account_settings.mfa_policy import is_mfa_required
from tenancy.models import TenantMember, TenantStatus

logger = logging.getLogger("bytescop.auth")

# Prefixes the user must be able to reach *before* completing MFA setup.
EXEMPT_PREFIXES = (
    "/api/me/mfa/",         # MFA self-service endpoints
    "/api/me/profile/",     # Frontend needs profile for app init
    "/api/auth/",           # Login, signup, logout, MFA login flow
    "/api/health/",         # Health check
    "/api/dev/",            # Dev seed/flush endpoints
    "/api/users/",          # Avatar serving (AllowAny)
    "/api/attachments/",    # Attachment serving (AllowAny)
)


class MfaEnforcementMiddleware:
    """Block API requests when MFA is required but not configured."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        # Only enforce on /api/ paths
        if not path.startswith("/api/"):
            return self.get_response(request)

        # Skip exempt prefixes
        for prefix in EXEMPT_PREFIXES:
            if path.startswith(prefix):
                return self.get_response(request)

        # Check if user is authenticated (session-based)
        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return self.get_response(request)

        # Fast path: session says MFA is enabled
        mfa_enabled = request.session.get('mfa_enabled')
        if mfa_enabled is True:
            return self.get_response(request)

        # No session key → pass through (backwards compatibility during migration)
        if mfa_enabled is None:
            return self.get_response(request)

        # Slow path: mfa_enabled is False — check if MFA is actually required
        tenant_id = request.session.get('tenant_id')
        if not tenant_id:
            return self.get_response(request)

        try:
            member = (
                TenantMember.objects
                .select_related("tenant")
                .get(
                    user=request.user,
                    tenant__id=tenant_id,
                    tenant__status=TenantStatus.ACTIVE,
                    is_active=True,
                )
            )
        except (TenantMember.DoesNotExist, ValueError):
            return self.get_response(request)

        if is_mfa_required(member, member.tenant):
            logger.info(
                "MFA enforcement: blocked user_id=%s tenant=%s path=%s",
                request.user.pk, tenant_id, path,
            )
            return JsonResponse(
                {
                    "detail": "MFA setup is required before accessing this resource.",
                    "code": "mfa_setup_required",
                },
                status=403,
            )

        return self.get_response(request)
