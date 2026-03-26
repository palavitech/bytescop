"""Views for accepting user invitations (public, unauthenticated)."""

import logging

from django.core import signing
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from account_settings.logo_service import LogoService
from account_settings.models import AccountSetting
from account_settings.password_policy import (
    get_merged_password_policy,
    get_password_policy,
    validate_password_against_policy,
    validate_password_for_user,
)
from audit.models import AuditAction
from audit.service import log_audit
from events.publisher import get_event_publisher
from core.rate_limit.helpers import (
    check_rate_limit,
    rate_limit_429,
    record_rate_limit,
)
from core.signing import (
    SALT_INVITE_SESSION,
    MAX_AGE_INVITE_SESSION,
    create_signed_token,
    verify_signed_token,
)
from tenancy.invite_service import validate_and_consume_token
from tenancy.models import InviteStatus, TenantMember

logger = logging.getLogger("bytescop.invite")

GENERIC_ERROR = "This invitation link is invalid or has expired."


def _get_logo_url(tenant):
    """Return the logo content URL for the tenant, or None."""
    try:
        setting = AccountSetting.objects.get(tenant=tenant, key="logo")
    except AccountSetting.DoesNotExist:
        return None
    if not setting.value:
        return None
    return "/api/settings/logo-content/"


# ---------------------------------------------------------------------------
# Step 1: Validate token → return signed session data
# ---------------------------------------------------------------------------


class ValidateTokenSerializer(serializers.Serializer):
    token = serializers.CharField()


@api_view(["POST"])
@permission_classes([AllowAny])
def accept_invite_validate(request):
    """Validate an invite token and return a signed session for password set."""
    ser = ValidateTokenSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    # Rate limit by token prefix
    token_kw = {"token": ser.validated_data["token"]}
    rl = check_rate_limit("accept_invite", **token_kw)
    if not rl.allowed:
        return rate_limit_429(rl)

    record_rate_limit("accept_invite", **token_kw)

    member, error = validate_and_consume_token(ser.validated_data["token"])
    if error:
        return Response({"detail": GENERIC_ERROR}, status=status.HTTP_400_BAD_REQUEST)

    # Build signed session payload
    session_data = create_signed_token(
        {
            "member_id": str(member.pk),
            "user_id": str(member.user.pk),
            "tenant_id": str(member.tenant.pk),
        },
        salt=SALT_INVITE_SESSION,
    )

    # Return merged password policy so frontend can show the checklist
    policy = get_merged_password_policy(member.user)

    # Tenant branding for welcome screen
    tenant = member.tenant
    logo_url = _get_logo_url(tenant)

    return Response({
        "valid": True,
        "session": session_data,
        "password_policy": policy,
        "email": member.user.email,
        "tenant_name": tenant.name,
        "logo_url": logo_url,
    })


# ---------------------------------------------------------------------------
# Step 2: Set password using signed session
# ---------------------------------------------------------------------------


class SetPasswordSerializer(serializers.Serializer):
    session = serializers.CharField()
    password = serializers.CharField()
    password_confirm = serializers.CharField()

    def validate(self, data):
        if data["password"] != data["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )
        return data


@api_view(["POST"])
@permission_classes([AllowAny])
def accept_invite_set_password(request):
    """Set password for an invited user using the signed session."""
    ser = SetPasswordSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data

    # Rate limit by session prefix
    session_kw = {"token": data["session"]}
    rl = check_rate_limit("accept_invite", **session_kw)
    if not rl.allowed:
        return rate_limit_429(rl)

    record_rate_limit("accept_invite", **session_kw)

    # Verify signed session
    try:
        session = verify_signed_token(
            data["session"],
            salt=SALT_INVITE_SESSION,
            max_age=MAX_AGE_INVITE_SESSION,
        )
    except (signing.BadSignature, signing.SignatureExpired):
        return Response(
            {"detail": "Your session has expired. Please use the invitation link again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Fetch member
    try:
        member = TenantMember.objects.select_related("user", "tenant").get(
            pk=session["member_id"],
            tenant_id=session["tenant_id"],
        )
    except TenantMember.DoesNotExist:
        return Response({"detail": GENERIC_ERROR}, status=status.HTTP_400_BAD_REQUEST)

    if member.invite_status != InviteStatus.PENDING:
        return Response(
            {"detail": "This invitation has already been accepted."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate password against merged cross-tenant policy
    try:
        validate_password_for_user(data["password"], member.user)
    except Exception as e:
        errors = e.messages if hasattr(e, "messages") else [str(e)]
        return Response({"password": errors}, status=status.HTTP_400_BAD_REQUEST)

    # Set password and mark accepted.
    # Auto-verify email: the user proved ownership by clicking a signed,
    # time-limited invite link sent to this address.
    member.user.set_password(data["password"])
    member.user.password_changed_at = timezone.now()
    member.user.email_verified = True
    member.user.save(update_fields=["password", "password_changed_at", "email_verified"])

    member.invite_status = InviteStatus.ACCEPTED
    member.save(update_fields=["invite_status", "updated_at"])

    # Audit — use member's tenant for scoping
    request.tenant = member.tenant
    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="member", resource_id=member.pk,
        resource_repr=f"Invite accepted: {member.user.email}",
    )

    # Send welcome email
    get_event_publisher().publish({
        "routing": ["notification"],
        "event_area": "account",
        "event_type": "welcome",
        "tenant_id": str(member.tenant.pk),
        "user_id": str(member.user.pk),
        "email": member.user.email,
        "name": member.user.get_full_name(),
        "tenant_name": member.tenant.name,
        "version": "1",
    })

    logger.info("Invite accepted member=%s email=%s", member.pk, member.user.email)
    return Response({"detail": "Password set successfully. You may now log in."})
