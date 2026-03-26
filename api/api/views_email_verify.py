"""Views for email verification (public, unauthenticated)."""

import logging

from django.contrib.auth import authenticate
from django.core import signing
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.models import User
from core.rate_limit.helpers import (
    check_rate_limit,
    rate_limit_429,
    record_rate_limit,
    reset_rate_limit,
)
from core.signing import (
    SALT_EMAIL_VERIFY,
    MAX_AGE_EMAIL_VERIFY,
    verify_signed_token,
    create_signed_token,
)
from events.publisher import get_event_publisher
from tenancy.models import TenantMember, TenantStatus

logger = logging.getLogger("bytescop.auth")


@api_view(["GET"])
@permission_classes([AllowAny])
def verify_email(request):
    """Validate a signed email-verification token and activate the user."""
    token = request.query_params.get("token")
    if not token:
        return Response(
            {"detail": "Verification token is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Rate limit by token prefix
    token_kw = {"token": token}
    rl = check_rate_limit("verify_email", **token_kw)
    if not rl.allowed:
        return rate_limit_429(rl)

    try:
        payload = verify_signed_token(token, SALT_EMAIL_VERIFY, MAX_AGE_EMAIL_VERIFY)
    except signing.SignatureExpired:
        record_rate_limit("verify_email", **token_kw)
        return Response(
            {"detail": "This verification link has expired. Please request a new one."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except signing.BadSignature:
        record_rate_limit("verify_email", **token_kw)
        return Response(
            {"detail": "Invalid verification link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user_id = payload.get("user_id")
    if not user_id or payload.get("purpose") != "email_verify":
        record_rate_limit("verify_email", **token_kw)
        return Response(
            {"detail": "Invalid verification link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(pk=user_id)
    except (User.DoesNotExist, ValueError, TypeError):
        record_rate_limit("verify_email", **token_kw)
        return Response(
            {"detail": "Invalid verification link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if user.email_verified:
        return Response({"detail": "Email already verified. You can log in."})

    user.email_verified = True
    user.save(update_fields=["email_verified"])

    # Success — reset rate limit for this token
    reset_rate_limit("verify_email", reason="email_verified", **token_kw)

    # Send welcome email
    member = (
        TenantMember.objects
        .filter(user=user, is_active=True, tenant__status=TenantStatus.ACTIVE)
        .select_related("tenant")
        .first()
    )
    if member:
        get_event_publisher().publish({
            "routing": ["notification"],
            "event_area": "account",
            "event_type": "welcome",
            "tenant_id": str(member.tenant.pk),
            "user_id": str(user.pk),
            "email": user.email,
            "name": user.first_name,
            "tenant_name": member.tenant.name,
            "version": "1",
        })

    logger.info("Email verified user_id=%s email=%s", user.pk, user.email)
    return Response({"detail": "Email verified successfully. You can now log in."})


@api_view(["POST"])
@permission_classes([AllowAny])
def resend_verification(request):
    """Re-send the verification email. Requires email + password to prevent abuse."""
    email = request.data.get("email", "").strip().lower()
    password = request.data.get("password", "")

    if not email or not password:
        return Response(
            {"detail": "Email and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Generic response — never reveal user existence
    generic_msg = "If that account exists, a verification email has been sent."
    generic_response = Response({"detail": generic_msg})

    # Rate limit by email — silent (return 200, not 429)
    rl = check_rate_limit("resend_verification", email=email)
    if not rl.allowed:
        return generic_response

    # Authenticate to confirm ownership — don't leak whether email exists
    user = authenticate(email=email, password=password)
    if user is None or not user.is_active:
        return generic_response

    if user.email_verified:
        return generic_response

    # Generate new token and publish event
    verify_token = create_signed_token(
        {"user_id": str(user.pk), "purpose": "email_verify"},
        salt=SALT_EMAIL_VERIFY,
    )

    # Find the tenant for the event (use owner's first active tenant)
    member = (
        TenantMember.objects
        .filter(user=user, is_active=True, tenant__status=TenantStatus.ACTIVE)
        .select_related("tenant")
        .first()
    )
    tenant_id = str(member.tenant.pk) if member else ""

    # Record attempt
    record_rate_limit("resend_verification", email=email)

    publisher = get_event_publisher()
    publisher.publish({
        "routing": ["notification"],
        "event_area": "account",
        "event_type": "signup_verify",
        "tenant_id": tenant_id,
        "user_id": str(user.pk),
        "email": user.email,
        "name": user.first_name,
        "verify_token": verify_token,
        "version": "1",
    })

    logger.info("Resend verification email=%s", user.email)
    return generic_response
