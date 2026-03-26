"""License API views.

GET  /api/license/ — return current license status
POST /api/license/ — activate a license key (validates + stores in DB)
DELETE /api/license/ — remove license key (reverts to Community Edition)
"""

import json
import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from account_settings.models import AccountSetting
from .service import get_license, reset_license, validate_license_key

logger = logging.getLogger('bytescop.licensing')


def _license_response(lic):
    """Build a consistent license status response dict."""
    active = lic.valid and not lic.expired
    return {
        'plan': lic.plan if active else 'community',
        'features': lic.features if active else [],
        'max_users': lic.max_users,
        'max_workspaces': lic.max_workspaces,
        'expired': lic.expired,
        'expires_at': lic.expires_at or None,
        'customer': lic.customer,
        'has_key': lic.plan != 'community' or lic.expired,
    }


@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def license_status(request):
    """License management endpoint."""
    if request.method == 'GET':
        return _handle_get(request)
    elif request.method == 'POST':
        return _handle_post(request)
    elif request.method == 'DELETE':
        return _handle_delete(request)


def _handle_get(request):
    """Return current license status."""
    reset_license()
    lic = get_license(tenant=request.tenant)
    return Response(_license_response(lic))


def _handle_post(request):
    """Activate a license key."""
    try:
        body = json.loads(request.body) if request.body else {}
    except (json.JSONDecodeError, ValueError):
        return Response(
            {'detail': 'Invalid JSON.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    key_str = (body.get('key') or '').strip()
    if not key_str:
        return Response(
            {'detail': 'License key is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate the key before storing
    lic = validate_license_key(key_str)
    if not lic.valid:
        return Response(
            {'detail': 'Invalid license key. The key could not be verified.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Store in DB
    AccountSetting.objects.update_or_create(
        tenant=request.tenant,
        key='license_key',
        defaults={
            'value': key_str,
            'updated_by': request.user,
        },
    )

    # Clear cache so next read picks up the new key
    reset_license()
    lic = get_license(tenant=request.tenant)

    logger.info(
        'License activated: tenant=%s plan=%s customer=%s',
        request.tenant.slug, lic.plan, lic.customer,
    )

    return Response(_license_response(lic))


def _handle_delete(request):
    """Remove the license key (revert to Community Edition)."""
    deleted, _ = AccountSetting.objects.filter(
        tenant=request.tenant,
        key='license_key',
    ).delete()

    reset_license()
    lic = get_license(tenant=request.tenant)

    if deleted:
        logger.info('License removed: tenant=%s', request.tenant.slug)

    return Response(_license_response(lic))
