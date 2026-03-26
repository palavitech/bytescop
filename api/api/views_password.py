"""Self-service password change and password policy views."""

import logging

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from account_settings.password_policy import (
    get_merged_password_policy,
    get_password_policy,
    validate_password_against_policy,
    validate_password_for_user,
)
from audit.models import AuditAction
from audit.service import log_audit
from events.publisher import get_event_publisher

logger = logging.getLogger("bytescop.auth")


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    mfa_code = serializers.CharField(max_length=20, required=False, default="")


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def me_change_password(request):
    """Self-service password change."""
    ser = ChangePasswordSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data

    # Require MFA code if user has MFA enabled
    if request.user.mfa_enabled:
        from accounts.mfa_service import verify_mfa
        mfa_code = data.get("mfa_code", "")
        if not mfa_code:
            return Response(
                {"mfa_code": ["MFA code is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not verify_mfa(request.user, mfa_code):
            return Response(
                {"mfa_code": ["Invalid MFA code."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Verify current password
    if not request.user.check_password(data["current_password"]):
        return Response(
            {"current_password": ["Current password is incorrect."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate new password against merged cross-tenant policy
    try:
        validate_password_for_user(data["new_password"], request.user)
    except Exception as e:
        return Response(
            {"new_password": e.messages if hasattr(e, "messages") else [str(e)]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Set new password
    request.user.set_password(data["new_password"])
    request.user.password_changed_at = timezone.now()
    request.user.save(update_fields=["password", "password_changed_at"])

    log_audit(
        request=request,
        action=AuditAction.UPDATE,
        resource_type="password",
        resource_id=str(request.user.pk),
        resource_repr=f"Password changed: {request.user.email}",
    )
    get_event_publisher().publish({
        "routing": ["notification"],
        "event_area": "account",
        "event_type": "password_changed",
        "tenant_id": str(request.tenant.pk),
        "user_id": str(request.user.pk),
        "email": request.user.email,
        "name": request.user.first_name,
        "version": "1",
    })
    logger.info(
        "Password changed user=%s tenant=%s",
        request.user.pk,
        request.tenant.slug,
    )
    return Response({"detail": "Password changed successfully."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_password_policy(request):
    """Return the merged password policy for the authenticated user."""
    policy = get_merged_password_policy(request.user)
    return Response(policy)
