"""Setup wizard API views — first-run configuration for on-prem installs.

GET  /api/setup/status/    → {"setup_required": bool}
POST /api/setup/complete/  → creates admin user + workspace
"""

import json
import logging
import re
import time
from collections import defaultdict

from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from django.http import JsonResponse

logger = logging.getLogger('bytescop.setup')

SLUG_RE = re.compile(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?$')

# Simple in-memory rate limiter for setup endpoint (5 attempts per IP per hour)
_setup_attempts: dict[str, list[float]] = defaultdict(list)
_SETUP_RATE_LIMIT = 5
_SETUP_RATE_WINDOW = 3600  # 1 hour


def _check_setup_rate_limit(request) -> bool:
    """Return True if rate limited."""
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
    if not ip:
        ip = request.META.get('REMOTE_ADDR', '')
    now = time.monotonic()
    # Prune old entries
    _setup_attempts[ip] = [t for t in _setup_attempts[ip] if now - t < _SETUP_RATE_WINDOW]
    if len(_setup_attempts[ip]) >= _SETUP_RATE_LIMIT:
        return True
    _setup_attempts[ip].append(now)
    return False


@require_GET
def setup_status(request):
    """Check whether first-run setup is required."""
    from core.models import InstallState

    try:
        state = InstallState.objects.filter(id=1).first()
        required = not (state and state.installed)
    except Exception:
        logger.debug("InstallState table unavailable, treating as setup required")
        required = True

    return JsonResponse({'setup_required': required})


@csrf_exempt
@require_POST
def setup_complete(request):
    """Complete first-run setup: create admin user and workspace."""
    from core.models import InstallState
    from accounts.models import User
    from tenancy.models import Tenant, TenantMember
    from authorization.seed import seed_permissions, create_default_groups_for_tenant
    from subscriptions.services import assign_default_plan

    # Rate limit
    if _check_setup_rate_limit(request):
        logger.warning('Setup rate limited: ip=%s', request.META.get('REMOTE_ADDR', ''))
        return JsonResponse(
            {'error': 'RateLimited', 'detail': 'Too many setup attempts. Try again later.'},
            status=429,
        )

    # Check not already installed
    state = InstallState.objects.filter(id=1).first()
    if state and state.installed:
        return JsonResponse({'error': 'SetupNotRequired', 'detail': 'Setup has already been completed.'}, status=400)

    # Parse body
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'error': 'InvalidJSON', 'detail': 'Request body must be valid JSON.'}, status=400)

    # Validate required fields
    workspace_name = (body.get('workspace_name') or '').strip()
    admin_email = (body.get('admin_email') or '').strip().lower()
    admin_password = body.get('admin_password') or ''
    admin_first_name = (body.get('admin_first_name') or '').strip()
    admin_last_name = (body.get('admin_last_name') or '').strip()

    errors = {}
    if not workspace_name:
        errors['workspace_name'] = 'Workspace name is required.'
    if not admin_email:
        errors['admin_email'] = 'Admin email is required.'
    else:
        from core.validators import validate_email_address, validate_email_domain
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_email_address(admin_email)
            validate_email_domain(admin_email)
        except DjangoValidationError as e:
            errors['admin_email'] = e.message
    if not admin_password or len(admin_password) < 12:
        errors['admin_password'] = 'Password must be at least 12 characters.'

    # Generate slug from workspace name
    workspace_slug = re.sub(r'[^a-z0-9]+', '-', workspace_name.lower()).strip('-')
    if not workspace_slug or not SLUG_RE.match(workspace_slug):
        workspace_slug = 'workspace'

    if errors:
        return JsonResponse({'error': 'ValidationError', 'detail': errors}, status=400)

    try:
        with transaction.atomic():
            # Re-check inside transaction to prevent race conditions
            state = InstallState.objects.select_for_update().get(id=1)
            if state.installed:
                return JsonResponse({'error': 'SetupNotRequired', 'detail': 'Setup has already been completed.'}, status=400)

            # Create workspace (tenant)
            tenant = Tenant.objects.create(
                name=workspace_name,
                slug=workspace_slug,
                status='active',
            )

            # Create admin user
            from django.utils import timezone as tz
            user = User.objects.create_user(
                email=admin_email,
                password=admin_password,
                first_name=admin_first_name,
                last_name=admin_last_name,
                email_verified=True,
                password_changed_at=tz.now(),
            )

            # Create owner membership
            TenantMember.objects.create(
                tenant=tenant,
                user=user,
                role='owner',
                is_active=True,
                invite_status='accepted',
            )

            # Seed RBAC permissions + default groups for the workspace
            seed_permissions()
            create_default_groups_for_tenant(tenant)

            # Seed company_name setting from workspace name
            from account_settings.models import AccountSetting
            AccountSetting.objects.create(
                tenant=tenant,
                key='company_name',
                value=workspace_name,
                updated_by=user,
            )

            # Assign default subscription plan
            assign_default_plan(tenant)

            # Mark installed
            state.mark_installed()

            logger.info(
                'Setup complete: workspace=%s admin=%s',
                workspace_name, admin_email,
            )

        return JsonResponse({'ok': True, 'workspace_slug': workspace_slug})

    except Exception:
        logger.exception('Setup failed')
        return JsonResponse(
            {'error': 'SetupFailed', 'detail': 'An unexpected error occurred during setup.'},
            status=500,
        )
