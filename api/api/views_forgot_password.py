"""Views for self-service forgot password (public, unauthenticated).

Flow:
1. POST /api/auth/forgot-password/       → request reset email
2. GET  /api/auth/reset-password/validate/ → validate token, return policy + MFA flag
3. POST /api/auth/reset-password/         → submit new password (+ optional MFA code)
"""

import logging

from django.core import signing
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from account_settings.password_policy import (
    get_merged_password_policy,
    validate_password_for_user,
)
from accounts.models import User
from audit.models import AuditAction
from audit.service import log_audit
from core.rate_limit.helpers import (
    check_rate_limit,
    rate_limit_429,
    record_rate_limit,
    reset_rate_limit,
)
from core.signing import (
    SALT_PASSWORD_RESET,
    MAX_AGE_PASSWORD_RESET,
    create_signed_token,
    verify_signed_token,
)
from events.publisher import get_event_publisher
from tenancy.models import TenantMember, TenantStatus

logger = logging.getLogger("bytescop.auth")

# Generic response — never reveal whether an email exists
GENERIC_SENT_MSG = "If that email is registered, you will receive a password reset link."


# ---------------------------------------------------------------------------
# Step 1: Request password reset email
# ---------------------------------------------------------------------------


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password(request):
    """Request a password reset email."""
    ser = ForgotPasswordSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    email = ser.validated_data["email"].strip().lower()

    # Always return generic message — don't leak user existence
    generic_response = Response({"detail": GENERIC_SENT_MSG})

    # Rate limit by email — silent (return 200, not 429)
    rl = check_rate_limit("forgot_password", email=email)
    if not rl.allowed:
        return generic_response

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        # Record attempt even for non-existent emails to prevent enumeration
        record_rate_limit("forgot_password", email=email)
        return generic_response

    # Only send to verified users — prevents using forgot-password
    # to bypass email verification
    if not user.email_verified:
        return generic_response

    if not user.is_active:
        return generic_response

    # Generate HMAC token
    token = create_signed_token(
        {
            "purpose": "password-reset",
            "uid": str(user.pk),
            "initiated_by": "self",
        },
        salt=SALT_PASSWORD_RESET,
    )

    # Find first active tenant for event metadata
    member = (
        TenantMember.objects
        .filter(user=user, is_active=True, tenant__status=TenantStatus.ACTIVE)
        .select_related("tenant")
        .first()
    )
    tenant_id = str(member.tenant.pk) if member else ""

    # Record attempt and publish email event
    record_rate_limit("forgot_password", email=email)

    publisher = get_event_publisher()
    publisher.publish({
        "routing": ["notification"],
        "event_area": "account",
        "event_type": "forgot_password",
        "tenant_id": tenant_id,
        "user_id": str(user.pk),
        "email": user.email,
        "name": user.first_name,
        "reset_token": token,
        "mfa_enabled": user.mfa_enabled,
        "version": "1",
    })

    logger.info("Password reset requested email=%s", user.email)
    return generic_response


# ---------------------------------------------------------------------------
# Step 2: Validate reset token
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([AllowAny])
def reset_password_validate(request):
    """Validate a password reset token and return policy + MFA requirement."""
    token = request.query_params.get("token")
    if not token:
        return Response(
            {"detail": "Reset token is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        payload = verify_signed_token(token, SALT_PASSWORD_RESET, MAX_AGE_PASSWORD_RESET)
    except signing.SignatureExpired:
        return Response(
            {"detail": "This reset link has expired. Please request a new one.",
             "code": "token_expired"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except signing.BadSignature:
        return Response(
            {"detail": "Invalid reset link.",
             "code": "token_invalid"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if payload.get("purpose") != "password-reset":
        return Response(
            {"detail": "Invalid reset link.", "code": "token_invalid"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    uid = payload.get("uid")
    try:
        user = User.objects.get(pk=uid)
    except (User.DoesNotExist, ValueError, TypeError):
        return Response(
            {"detail": "Invalid reset link.", "code": "token_invalid"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({
        "valid": True,
        "mfa_required": user.mfa_enabled,
        "password_policy": get_merged_password_policy(user),
    })


# ---------------------------------------------------------------------------
# Step 3: Submit new password
# ---------------------------------------------------------------------------


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField()
    password_confirm = serializers.CharField()
    mfa_code = serializers.CharField(max_length=20, required=False, default="")

    def validate(self, data):
        if data["password"] != data["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        return data


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password(request):
    """Submit a new password using a valid reset token."""
    ser = ResetPasswordSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data

    # Rate limit by token prefix
    token_kw = {"token": data["token"]}
    rl = check_rate_limit("reset_password", **token_kw)
    if not rl.allowed:
        return rate_limit_429(rl)

    # Verify token again (must still be valid at submission time)
    try:
        payload = verify_signed_token(
            data["token"], SALT_PASSWORD_RESET, MAX_AGE_PASSWORD_RESET,
        )
    except signing.SignatureExpired:
        record_rate_limit("reset_password", **token_kw)
        return Response(
            {"detail": "This reset link has expired. Please request a new one.",
             "code": "token_expired"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except signing.BadSignature:
        record_rate_limit("reset_password", **token_kw)
        return Response(
            {"detail": "Invalid reset link.", "code": "token_invalid"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if payload.get("purpose") != "password-reset":
        record_rate_limit("reset_password", **token_kw)
        return Response(
            {"detail": "Invalid reset link.", "code": "token_invalid"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    uid = payload.get("uid")
    try:
        user = User.objects.get(pk=uid)
    except (User.DoesNotExist, ValueError, TypeError):
        record_rate_limit("reset_password", **token_kw)
        return Response(
            {"detail": "Invalid reset link.", "code": "token_invalid"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify MFA if user has it enabled
    if user.mfa_enabled:
        from accounts.mfa_service import verify_mfa
        mfa_code = data.get("mfa_code", "")
        if not mfa_code:
            return Response(
                {"mfa_code": ["MFA code is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not verify_mfa(user, mfa_code):
            record_rate_limit("reset_password", **token_kw)
            return Response(
                {"mfa_code": ["Invalid MFA code."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Validate password against merged cross-tenant policy
    try:
        validate_password_for_user(data["password"], user)
    except Exception as e:
        errors = e.messages if hasattr(e, "messages") else [str(e)]
        return Response({"password": errors}, status=status.HTTP_400_BAD_REQUEST)

    # Set new password
    user.set_password(data["password"])
    user.password_changed_at = timezone.now()
    user.save(update_fields=["password", "password_changed_at"])

    # Success — reset rate limit for this token
    reset_rate_limit("reset_password", reason="password_reset_success", **token_kw)

    # Audit log — set request context for unauthenticated endpoint
    member = (
        TenantMember.objects
        .filter(user=user, is_active=True, tenant__status=TenantStatus.ACTIVE)
        .select_related("tenant")
        .first()
    )
    if member:
        request.tenant = member.tenant
    request.user = user  # so audit captures actor_email
    log_audit(
        request=request,
        action=AuditAction.UPDATE,
        resource_type="password",
        resource_id=str(user.pk),
        resource_repr=f"Password reset (forgot password): {user.email}",
    )

    logger.info("Password reset completed user=%s initiated_by=%s",
                user.pk, payload.get("initiated_by", "self"))
    return Response({"detail": "Password reset successfully. You can now log in."})
