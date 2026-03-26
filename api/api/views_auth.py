import logging

from django.conf import settings
from django.contrib.auth import login as django_login, logout as django_logout
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from account_settings.mfa_policy import is_mfa_required
from accounts.models import User
from audit.models import AuditAction
from audit.service import log_audit
from core.rate_limit.helpers import (
    check_rate_limit,
    get_client_ip,
    rate_limit_429,
    record_rate_limit,
    reset_rate_limit,
)
from events.publisher import get_event_publisher
from .serializers.auth import SignupSerializer, LoginStep1Serializer, LoginStep2Serializer, SwitchTenantSerializer, build_full_auth_response
from tenancy.models import Tenant, TenantMember, TenantStatus, InviteStatus

logger = logging.getLogger("bytescop.auth")


def _login_session(request, user, membership, remember=False):
    """Establish a Django session for the authenticated user.

    Sets session keys for tenant context and MFA state,
    and configures session expiry based on remember-me preference.
    """
    django_login(request, user)
    request.session['tenant_id'] = str(membership.tenant.id)
    request.session['mfa_enabled'] = user.mfa_enabled
    if remember:
        request.session.set_expiry(settings.SESSION_COOKIE_AGE)  # 14 days
    else:
        request.session.set_expiry(0)  # browser close


def _try_resend_verification_on_duplicate(request):
    """If the email belongs to an unverified user, silently resend verification.

    Returns True if a resend was triggered (caller should return early).
    """
    from core.signing import SALT_EMAIL_VERIFY, create_signed_token

    email = (request.data.get("email") or "").strip().lower()
    if not email:
        return False

    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return False

    if user.email_verified:
        return False  # Already verified — let the normal 400 flow handle it

    # Per-email cooldown via rate limiter
    rl = check_rate_limit("resend_verification", email=email)
    if not rl.allowed:
        return True  # Silently skip, but pretend we sent

    verify_token = create_signed_token(
        {"user_id": str(user.pk), "purpose": "email_verify"},
        salt=SALT_EMAIL_VERIFY,
    )
    member = TenantMember.objects.filter(
        user=user, is_active=True, tenant__status=TenantStatus.ACTIVE,
    ).select_related("tenant").first()

    record_rate_limit("resend_verification", email=email)

    publisher = get_event_publisher()
    publisher.publish({
        "routing": ["notification"],
        "event_area": "account",
        "event_type": "signup_verify",
        "tenant_id": str(member.tenant.pk) if member else "",
        "user_id": str(user.pk),
        "email": user.email,
        "name": user.first_name,
        "verify_token": verify_token,
        "version": "1",
    })
    logger.info("Resend verification on duplicate signup email=%s", email)
    return True


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def signup(request):
    email = (request.data.get("email") or "").strip().lower()
    if email:
        rl = check_rate_limit("signup", email=email)
        if not rl.allowed:
            return rate_limit_429(rl)

    serializer = SignupSerializer(data=request.data)
    if not serializer.is_valid():
        # If the only error is duplicate email and user is unverified, silently resend
        email_errors = serializer.errors.get("email", [])
        is_duplicate = any("already exists" in str(e) for e in email_errors)
        if is_duplicate:
            _try_resend_verification_on_duplicate(request)
        serializer.is_valid(raise_exception=True)  # re-raise original errors
    data = serializer.save()
    if email:
        record_rate_limit("signup", email=email)
    # Attach tenant to request so log_audit() can scope the entry
    tenant_id = data.get("tenant_id")
    if tenant_id:
        request.tenant = Tenant.objects.filter(pk=tenant_id).first()
    logger.info("Signup succeeded email=%s tenant=%s", data.get("email", "?"), tenant_id or "?")
    log_audit(
        request=request, action=AuditAction.SIGNUP,
        resource_type="auth", resource_id="",
        resource_repr=f"Signup: {data.get('email', '?')}",
    )
    # Publish verification email event
    publisher = get_event_publisher()
    publisher.publish({
        "routing": ["notification"],
        "event_area": "account",
        "event_type": "signup_verify",
        "tenant_id": data["tenant_id"],
        "user_id": data["user_id"],
        "email": data["email"],
        "name": data["name"],
        "verify_token": data["verify_token"],
        "version": "1",
    })
    # Notify BytesCop team about the new signup (privacy-safe: no PII)
    publisher.publish({
        "routing": ["notification"],
        "event_area": "account",
        "event_type": "signup_new_tenant",
        "tenant_name": request.tenant.name if request.tenant else "",
        "plan_code": "free",
        "version": "1",
    })
    # Return only the public fields (no tokens, no verify_token)
    return Response(
        {"detail": data["detail"], "email_sent": data["email_sent"]},
        status=status.HTTP_201_CREATED,
    )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def login_step1(request):
    email = (request.data.get("email") or "").strip().lower()
    ip = get_client_ip(request)
    if email:
        rl = check_rate_limit("login", email=email, ip=ip)
        if not rl.allowed:
            return rate_limit_429(rl)

    serializer = LoginStep1Serializer(data=request.data)
    if not serializer.is_valid():
        # Record failed login attempt
        if email:
            record_rate_limit("login", email=email, ip=ip)
        # Resolve tenant for audit scoping
        if email and not getattr(request, 'tenant', None):
            member = TenantMember.objects.filter(
                user__email=email, is_active=True, tenant__status=TenantStatus.ACTIVE,
            ).select_related("tenant").first()
            if member:
                request.tenant = member.tenant
        log_audit(
            request=request, action=AuditAction.LOGIN_FAILED,
            resource_type="auth", resource_id="",
            resource_repr=f"Login failed: {request.data.get('email', '?')}",
        )
        from rest_framework.exceptions import ValidationError
        raise ValidationError(serializer.errors)
    tenants = serializer.get_tenants()
    logger.info("Login step1 tenant_count=%d", len(tenants))
    return Response({"tenants": tenants})


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def login_step2(request):
    email = (request.data.get("email") or "").strip().lower()
    ip = get_client_ip(request)
    if email:
        rl = check_rate_limit("login_select_tenant", email=email, ip=ip)
        if not rl.allowed:
            return rate_limit_429(rl)

    remember = bool(request.data.get("remember", False))
    serializer = LoginStep2Serializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.get_response_data()

    # Email verification gate — return 403 before establishing session
    if data.get("email_not_verified"):
        request.tenant = serializer.validated_data["membership"].tenant
        logger.info("Login step2 blocked: email not verified email=%s", request.data.get("email", "?"))
        return Response(
            {
                "detail": "Please verify your email address before logging in.",
                "code": "email_not_verified",
                "resend_available": True,
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # Attach tenant to request so log_audit() can scope the entry
    membership = serializer.validated_data["membership"]
    request.tenant = membership.tenant

    # MFA gate — don't establish session yet
    if data.get("mfa_required"):
        logger.info("Login step2 MFA required tenant=%s", request.data.get("tenant_id", "?"))
        return Response(data)

    # Successful login — establish session
    user = serializer.validated_data["user"]
    _login_session(request, user, membership, remember=remember)

    # Reset backoff for both login scopes
    if email:
        reset_rate_limit("login", reason="login_success", email=email, ip=ip)
        reset_rate_limit("login_select_tenant", reason="login_success", email=email, ip=ip)

    logger.info("Login step2 succeeded tenant=%s", request.data.get("tenant_id", "?"))
    log_audit(
        request=request, action=AuditAction.LOGIN_SUCCESS,
        resource_type="auth", resource_id="",
        resource_repr=f"Login: {request.data.get('email', '?')} → {request.tenant.name}",
    )
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_tenants(request):
    memberships = (
        TenantMember.objects
        .filter(user=request.user, is_active=True, tenant__status=TenantStatus.ACTIVE)
        .exclude(invite_status=InviteStatus.PENDING)
        .select_related("tenant")
    )
    tenants = [
        {
            "id": str(m.tenant.pk),
            "slug": m.tenant.slug,
            "name": m.tenant.name,
            "role": m.role,
        }
        for m in memberships
    ]
    logger.debug("List tenants user=%s count=%d", request.user.pk, len(tenants))
    return Response({"tenants": tenants})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def switch_tenant(request):
    serializer = SwitchTenantSerializer(
        data=request.data,
        context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    data = serializer.get_response_data()
    membership = serializer.validated_data["membership"]

    # Update session with new tenant context
    request.session['tenant_id'] = str(membership.tenant.id)
    request.session['mfa_enabled'] = request.user.mfa_enabled
    request.session.cycle_key()  # new session ID for new tenant context

    logger.info("Tenant switch user=%s tenant=%s", request.user.pk, request.data.get("tenant_id", "?"))
    log_audit(
        request=request, action=AuditAction.TENANT_SWITCH,
        resource_type="auth", resource_id="",
        resource_repr=f"Tenant switch: {request.data.get('tenant_id', '?')}",
    )
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    log_audit(
        request=request, action=AuditAction.LOGOUT,
        resource_type="auth", resource_id="",
        resource_repr=f"Logout: {request.user.email}",
    )
    logger.info("Logout user=%s", request.user.pk)
    django_logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)
