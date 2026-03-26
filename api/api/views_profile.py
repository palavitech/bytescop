"""Self-service profile endpoints.

GET    /api/me/profile/                — current user's profile + tenant membership
PATCH  /api/me/profile/                — update first_name / last_name
POST   /api/me/profile/avatar/         — upload avatar image (multipart)
DELETE /api/me/profile/avatar/         — remove avatar
"""

import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from account_settings.definitions import DEFINITION_MAP
from account_settings.mfa_policy import is_mfa_required
from account_settings.models import AccountSetting
from accounts.avatar_service import AvatarService, get_avatar_url
from account_settings.password_policy import check_password_reset_required
from api.serializers.auth import _permissions_payload
from audit.models import AuditAction
from audit.service import log_audit
from subscriptions.services import get_subscription_info
from tenancy.models import TenantMember

logger = logging.getLogger("bytescop.profile")


def _get_membership(request):
    """Return the TenantMember for request.user + request.tenant, or None."""
    return (
        TenantMember.objects
        .filter(tenant=request.tenant, user=request.user, is_active=True)
        .select_related("tenant")
        .first()
    )


def _profile_data(user, membership):
    """Build the profile response dict."""
    mfa_setup_required = False
    if membership:
        mfa_setup_required = is_mfa_required(membership, membership.tenant) and not user.mfa_enabled

    # Resolve date_format from tenant settings (or definition default)
    date_format = DEFINITION_MAP["date_format"].default
    if membership:
        stored = (
            AccountSetting.objects
            .filter(tenant=membership.tenant, key="date_format")
            .values_list("value", flat=True)
            .first()
        )
        if stored:
            date_format = stored

    tenant = membership.tenant if membership else None
    reset_required, reset_reason = check_password_reset_required(user, tenant)

    return {
        "user": {
            "id": str(user.pk),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone": user.phone,
            "timezone": user.timezone,
            "avatar_url": get_avatar_url(user),
            "password_changed_at": user.password_changed_at.isoformat() if user.password_changed_at else None,
        },
        "tenant": {
            "id": str(tenant.pk),
            "slug": tenant.slug,
            "name": tenant.name,
            "role": membership.role,
        } if membership else None,
        "authorization": _permissions_payload(membership) if membership else None,
        "role": membership.role if membership else None,
        "member_since": membership.created_at.isoformat() if membership else None,
        "mfa_setup_required": mfa_setup_required,
        "subscription": get_subscription_info(tenant) if tenant else None,
        "password_reset_required": reset_required,
        "password_reset_reason": reset_reason,
        "date_format": date_format,
    }


# ---------------------------------------------------------------------------
# GET / PATCH  /api/me/profile/
# ---------------------------------------------------------------------------

@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me_profile(request):
    membership = _get_membership(request)

    if request.method == "GET":
        return Response(_profile_data(request.user, membership))

    # PATCH — update profile fields
    user = request.user
    before = {
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "timezone": user.timezone,
    }

    update_fields = []
    first = request.data.get("first_name")
    last = request.data.get("last_name")
    phone = request.data.get("phone")
    tz = request.data.get("timezone")

    if first is not None:
        user.first_name = str(first).strip()
        update_fields.append("first_name")
    if last is not None:
        user.last_name = str(last).strip()
        update_fields.append("last_name")
    if phone is not None:
        user.phone = str(phone).strip()[:40]
        update_fields.append("phone")
    if tz is not None:
        user.timezone = str(tz).strip()[:80]
        update_fields.append("timezone")

    if not update_fields:
        return Response(
            {"detail": "No fields to update."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.save(update_fields=update_fields)

    after = {
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "timezone": user.timezone,
    }
    log_audit(
        request=request,
        action=AuditAction.UPDATE,
        resource_type="profile",
        resource_id=str(user.pk),
        resource_repr=f"Profile: {user.email}",
        before=before,
        after=after,
    )

    return Response(_profile_data(user, membership))


# ---------------------------------------------------------------------------
# POST / DELETE  /api/me/profile/avatar/
# ---------------------------------------------------------------------------

@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def me_avatar(request):
    user = request.user
    svc = AvatarService()

    if request.method == "POST":
        file_obj = request.FILES.get("avatar") or request.FILES.get("file")
        if not file_obj:
            return Response(
                {"detail": "No file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            storage_uri = svc.process_and_save(user, file_obj, str(request.tenant.id))
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.avatar_uri = storage_uri
        user.save(update_fields=["avatar_uri"])

        log_audit(
            request=request,
            action=AuditAction.UPDATE,
            resource_type="profile",
            resource_id=str(user.pk),
            resource_repr=f"Avatar uploaded: {user.email}",
            after={"avatar_url": get_avatar_url(user)},
        )

        return Response({"avatar_url": get_avatar_url(user)})

    # DELETE
    if not user.avatar_uri:
        return Response(status=status.HTTP_204_NO_CONTENT)

    svc.delete(user.avatar_uri)
    user.avatar_uri = ""
    user.save(update_fields=["avatar_uri"])

    log_audit(
        request=request,
        action=AuditAction.DELETE,
        resource_type="profile",
        resource_id=str(user.pk),
        resource_repr=f"Avatar removed: {user.email}",
    )

    return Response(status=status.HTTP_204_NO_CONTENT)
