"""MFA views: login flow endpoints (AllowAny) and self-service (IsAuthenticated)."""

import logging

from django.conf import settings
from django.contrib.auth import login as django_login
from django.core import signing
from django.views.decorators.csrf import csrf_exempt
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from account_settings.mfa_policy import get_mfa_policy, is_mfa_required
from core.rate_limit.helpers import (
    check_rate_limit,
    get_client_ip,
    rate_limit_429,
    record_rate_limit,
    reset_rate_limit,
)
from accounts.mfa_crypto import decrypt_secret, encrypt_secret
from accounts.mfa_service import (
    confirm_enrollment,
    disable_mfa,
    enroll_mfa,
    generate_backup_codes,
    generate_qr_code_base64,
    generate_totp_secret,
    get_provisioning_uri,
    hash_backup_code,
    regenerate_backup_codes,
    publish_mfa_event,
    verify_mfa,
    verify_totp_code,
)
from accounts.models import User
from api.serializers.auth import build_full_auth_response
from core.signing import (
    SALT_MFA_CHALLENGE,
    SALT_MFA_RE_ENROLL,
    MAX_AGE_MFA_CHALLENGE,
    MAX_AGE_MFA_RE_ENROLL,
    create_signed_token,
    verify_signed_token,
)
from audit.models import AuditAction
from audit.service import log_audit
from tenancy.models import TenantMember, TenantStatus

logger = logging.getLogger("bytescop.auth")



# ---------------------------------------------------------------------------
# MFA token helpers
# ---------------------------------------------------------------------------

def _resolve_mfa_token(token_str):
    """Unpack an MFA challenge token.

    Returns ``(user, membership, None)`` on success or
    ``(None, None, Response)`` on failure.
    """
    try:
        payload = verify_signed_token(token_str, salt=SALT_MFA_CHALLENGE, max_age=MAX_AGE_MFA_CHALLENGE)
    except signing.BadSignature:
        return None, None, Response(
            {"detail": "Invalid or expired MFA token."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(pk=payload["user_id"], is_active=True)
    except User.DoesNotExist:
        return None, None, Response(
            {"detail": "User not found."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        membership = TenantMember.objects.select_related("tenant").get(
            user=user,
            tenant__id=payload["tenant_id"],
            tenant__status=TenantStatus.ACTIVE,
            is_active=True,
        )
    except TenantMember.DoesNotExist:
        return None, None, Response(
            {"detail": "Tenant membership not found."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return user, membership, None


def _refresh_mfa_token(user, tenant_id):
    """Issue a fresh MFA token (e.g. after setup, before confirm)."""
    return create_signed_token(
        {"user_id": str(user.pk), "tenant_id": tenant_id, "purpose": "mfa_challenge"},
        salt=SALT_MFA_CHALLENGE,
    )


def _mfa_login_session(request, user, membership):
    """Establish a Django session after MFA verification."""
    remember = bool(request.data.get("remember", False))
    django_login(request, user)
    request.session['tenant_id'] = str(membership.tenant.id)
    request.session['mfa_enabled'] = user.mfa_enabled
    if remember:
        request.session.set_expiry(settings.SESSION_COOKIE_AGE)
    else:
        request.session.set_expiry(0)


# ---------------------------------------------------------------------------
# Login flow endpoints (AllowAny — pre-auth)
# ---------------------------------------------------------------------------


class MfaVerifySerializer(serializers.Serializer):
    mfa_token = serializers.CharField()
    code = serializers.CharField(max_length=20)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def mfa_verify(request):
    """Verify a TOTP or backup code during login and return full auth response."""
    ser = MfaVerifySerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    user, membership, err = _resolve_mfa_token(ser.validated_data["mfa_token"])
    if err:
        return err

    # Rate limit by ip+user_id
    ip = get_client_ip(request)
    rl_kw = {"user_id": str(user.pk), "ip": ip}
    rl = check_rate_limit("mfa_verify", **rl_kw)
    if not rl.allowed:
        return rate_limit_429(rl)

    request.tenant = membership.tenant

    if not verify_mfa(user, ser.validated_data["code"]):
        record_rate_limit("mfa_verify", **rl_kw)
        log_audit(
            request=request, action=AuditAction.LOGIN_FAILED,
            resource_type="auth", resource_id=str(user.pk),
            resource_repr=f"MFA verify failed: {user.email}",
        )
        return Response(
            {"detail": "Invalid MFA code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Success — reset MFA rate limit
    reset_rate_limit("mfa_verify", reason="mfa_verify_success", **rl_kw)

    # Establish session
    _mfa_login_session(request, user, membership)

    data = build_full_auth_response(user, membership)
    log_audit(
        request=request, action=AuditAction.LOGIN_SUCCESS,
        resource_type="auth", resource_id=str(user.pk),
        resource_repr=f"MFA login: {user.email} → {membership.tenant.slug}",
    )
    logger.info("MFA verify succeeded user=%s tenant=%s", user.pk, membership.tenant.slug)
    return Response(data)


class MfaSetupSerializer(serializers.Serializer):
    mfa_token = serializers.CharField()


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def mfa_setup(request):
    """Start MFA enrollment during login (for users who must set up MFA)."""
    ser = MfaSetupSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    user, membership, err = _resolve_mfa_token(ser.validated_data["mfa_token"])
    if err:
        return err

    # Rate limit by ip+user_id
    ip = get_client_ip(request)
    rl_kw = {"user_id": str(user.pk), "ip": ip}
    rl = check_rate_limit("mfa_setup", **rl_kw)
    if not rl.allowed:
        return rate_limit_429(rl)

    record_rate_limit("mfa_setup", **rl_kw)

    enrollment = enroll_mfa(user)
    new_token = _refresh_mfa_token(user, str(membership.tenant.id))

    return Response({
        "secret": enrollment["secret"],
        "qr_code": enrollment["qr_code"],
        "backup_codes": enrollment["backup_codes"],
        "mfa_token": new_token,
    })


class MfaSetupConfirmSerializer(serializers.Serializer):
    mfa_token = serializers.CharField()
    code = serializers.CharField(max_length=6)


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def mfa_setup_confirm(request):
    """Confirm MFA enrollment with a TOTP code and return full auth response."""
    ser = MfaSetupConfirmSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    user, membership, err = _resolve_mfa_token(ser.validated_data["mfa_token"])
    if err:
        return err

    # Rate limit by ip+user_id
    ip = get_client_ip(request)
    rl_kw = {"user_id": str(user.pk), "ip": ip}
    rl = check_rate_limit("mfa_setup_confirm", **rl_kw)
    if not rl.allowed:
        return rate_limit_429(rl)

    request.tenant = membership.tenant

    if not confirm_enrollment(user, ser.validated_data["code"]):
        record_rate_limit("mfa_setup_confirm", **rl_kw)
        return Response(
            {"detail": "Invalid code. Please try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Success — reset rate limits for all MFA scopes
    reset_rate_limit("mfa_setup", reason="mfa_setup_success", **rl_kw)
    reset_rate_limit("mfa_setup_confirm", reason="mfa_setup_success", **rl_kw)

    # Establish session
    _mfa_login_session(request, user, membership)

    data = build_full_auth_response(user, membership)
    log_audit(
        request=request, action=AuditAction.CREATE,
        resource_type="mfa", resource_id=str(user.pk),
        resource_repr=f"MFA enrolled (login): {user.email}",
    )
    publish_mfa_event("mfa_enrolled", user, membership.tenant)
    logger.info("MFA setup confirmed user=%s tenant=%s", user.pk, membership.tenant.slug)
    return Response(data)


# ---------------------------------------------------------------------------
# Self-service endpoints (IsAuthenticated)
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_mfa_status(request):
    """Return the current user's MFA status and policy."""
    user = request.user
    member = TenantMember.objects.filter(
        user=user, tenant=request.tenant, is_active=True,
    ).first()

    required = is_mfa_required(member, request.tenant) if member else False
    policy = get_mfa_policy(request.tenant)

    return Response({
        "mfa_enabled": user.mfa_enabled,
        "mfa_enrolled_at": user.mfa_enrolled_at.isoformat() if user.mfa_enrolled_at else None,
        "mfa_required": required,
        "backup_codes_remaining": len(user.mfa_backup_codes) if user.mfa_enabled else 0,
        "policy": policy,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def me_mfa_enroll(request):
    """Start self-service MFA enrollment."""
    if request.user.mfa_enabled:
        return Response(
            {"detail": "MFA is already enabled. Disable it first."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    enrollment = enroll_mfa(request.user)
    return Response({
        "secret": enrollment["secret"],
        "qr_code": enrollment["qr_code"],
        "backup_codes": enrollment["backup_codes"],
    })


class MfaCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def me_mfa_enroll_confirm(request):
    """Confirm self-service MFA enrollment with a TOTP code."""
    ser = MfaCodeSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    if request.user.mfa_enabled:
        return Response(
            {"detail": "MFA is already enabled."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not confirm_enrollment(request.user, ser.validated_data["code"]):
        return Response(
            {"detail": "Invalid code. Please try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Update session to reflect MFA is now enabled
    request.session['mfa_enabled'] = True

    log_audit(
        request=request, action=AuditAction.CREATE,
        resource_type="mfa", resource_id=str(request.user.pk),
        resource_repr=f"MFA enrolled (self-service): {request.user.email}",
    )
    publish_mfa_event("mfa_enrolled", request.user, request.tenant)
    return Response({"detail": "MFA has been enabled."})


class MfaDisableSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def me_mfa_disable(request):
    """Disable MFA (requires TOTP code; blocked if MFA is mandatory)."""
    ser = MfaDisableSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    if not request.user.mfa_enabled:
        return Response(
            {"detail": "MFA is not enabled."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Check if MFA is mandatory for this user
    member = TenantMember.objects.filter(
        user=request.user, tenant=request.tenant, is_active=True,
    ).first()
    if member and is_mfa_required(member, request.tenant):
        return Response(
            {"detail": "MFA is mandatory for your account and cannot be disabled."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not verify_mfa(request.user, ser.validated_data["code"]):
        return Response(
            {"detail": "Invalid MFA code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    disable_mfa(request.user)

    # Update session to reflect MFA is now disabled
    request.session['mfa_enabled'] = False

    log_audit(
        request=request, action=AuditAction.DELETE,
        resource_type="mfa", resource_id=str(request.user.pk),
        resource_repr=f"MFA disabled: {request.user.email}",
    )
    publish_mfa_event("mfa_disabled", request.user, request.tenant)
    return Response({"detail": "MFA has been disabled."})


class MfaRegenerateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def me_mfa_regenerate_backup_codes(request):
    """Regenerate backup codes (requires TOTP code)."""
    ser = MfaRegenerateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    if not request.user.mfa_enabled:
        return Response(
            {"detail": "MFA is not enabled."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not verify_mfa(request.user, ser.validated_data["code"]):
        return Response(
            {"detail": "Invalid MFA code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    codes = regenerate_backup_codes(request.user)
    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="mfa", resource_id=str(request.user.pk),
        resource_repr=f"Backup codes regenerated: {request.user.email}",
    )
    publish_mfa_event("mfa_backup_codes_regenerated", request.user, request.tenant)
    return Response({"backup_codes": codes})


# ---------------------------------------------------------------------------
# MFA re-enroll (device change)
# ---------------------------------------------------------------------------


class MfaReEnrollSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=20)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def me_mfa_re_enroll(request):
    """Start MFA device change: verify current device, generate new secret.

    The pending secret is packed into a signed token — the user model is NOT
    modified until the confirm step.
    """
    ser = MfaReEnrollSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    if not request.user.mfa_enabled:
        return Response(
            {"detail": "MFA is not enabled."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not verify_mfa(request.user, ser.validated_data["code"]):
        return Response(
            {"detail": "Invalid MFA code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Generate new secret + QR + backup codes (without touching the user model)
    secret = generate_totp_secret()
    uri = get_provisioning_uri(secret, request.user.email)
    qr = generate_qr_code_base64(uri)
    codes = generate_backup_codes()

    # Pack pending data into a signed token
    re_enroll_token = create_signed_token(
        {
            "user_id": str(request.user.pk),
            "secret": encrypt_secret(secret),
            "backup_hashes": [hash_backup_code(c) for c in codes],
        },
        salt=SALT_MFA_RE_ENROLL,
    )

    return Response({
        "secret": secret,
        "qr_code": qr,
        "backup_codes": codes,
        "re_enroll_token": re_enroll_token,
    })


class MfaReEnrollConfirmSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6)
    re_enroll_token = serializers.CharField()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def me_mfa_re_enroll_confirm(request):
    """Confirm MFA device change: verify new TOTP code and swap secrets."""
    ser = MfaReEnrollConfirmSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    # Unpack signed token
    try:
        payload = verify_signed_token(
            ser.validated_data["re_enroll_token"],
            salt=SALT_MFA_RE_ENROLL,
            max_age=MAX_AGE_MFA_RE_ENROLL,
        )
    except signing.BadSignature:
        return Response(
            {"detail": "Invalid or expired re-enroll token."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Verify token belongs to this user
    if payload["user_id"] != str(request.user.pk):
        return Response(
            {"detail": "Token does not match the current user."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Decrypt the pending secret and verify the new TOTP code
    pending_secret = decrypt_secret(payload["secret"])
    if not verify_totp_code(pending_secret, ser.validated_data["code"]):
        return Response(
            {"detail": "Invalid code. Please try again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Swap: update user model with new secret and backup codes
    from django.utils import timezone

    request.user.mfa_secret = encrypt_secret(pending_secret)
    request.user.mfa_backup_codes = payload["backup_hashes"]
    request.user.mfa_enrolled_at = timezone.now()
    request.user.save(update_fields=["mfa_secret", "mfa_backup_codes", "mfa_enrolled_at"])

    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="mfa", resource_id=str(request.user.pk),
        resource_repr=f"MFA device changed: {request.user.email}",
    )
    publish_mfa_event("mfa_device_changed", request.user, request.tenant)
    return Response({"detail": "MFA device has been updated."})
