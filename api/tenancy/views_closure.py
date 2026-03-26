"""Tenant closure endpoints — delete workspace permanently."""

import logging
import uuid

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from accounts.mfa_service import verify_mfa
from audit.service import log_audit
from audit.models import AuditAction
from authorization.permissions import check_permission
from events.publisher import get_event_publisher
from tenancy.models import TenantClosure, TenantMember, TenantStatus, DataExportChoice

logger = logging.getLogger("bytescop.tenancy")


def _get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def closure_preflight(request):
    """Pre-check for the closure wizard — verifies permission."""
    member, err = check_permission(request, ["tenant.close"])
    if err:
        return err

    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def closure_verify_mfa(request):
    """Step 1: Validate MFA code. Must be called before execute.

    Request: {mfa_code: str}
    Response: {verified: true}
    """
    member, err = check_permission(request, ["tenant.close"])
    if err:
        return err

    tenant = request.tenant

    if tenant.status != TenantStatus.ACTIVE:
        logger.warning(
            "Closure MFA rejected — workspace not active: tenant=%s status=%s user=%s",
            tenant.slug, tenant.status, request.user.email,
        )
        return Response(
            {"detail": "Workspace is not active."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    mfa_code = (request.data.get("mfa_code") or "").strip()

    if not mfa_code:
        return Response(
            {"detail": "MFA code is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not request.user.mfa_enabled:
        logger.warning(
            "Closure MFA rejected — MFA not enabled: tenant=%s user=%s",
            tenant.slug, request.user.email,
        )
        return Response(
            {"detail": "MFA must be enabled to delete a workspace."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not verify_mfa(request.user, mfa_code):
        logger.warning(
            "Closure MFA rejected — invalid code: tenant=%s user=%s",
            tenant.slug, request.user.email,
        )
        return Response(
            {"detail": "Invalid MFA code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Store MFA verification in session so execute can check it
    request.session['closure_mfa_verified_at'] = timezone.now().isoformat()
    request.session.save()

    logger.info(
        "Closure MFA verified: tenant=%s user=%s",
        tenant.slug, request.user.email,
    )

    return Response({"verified": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def closure_execute(request):
    """Step 2: Confirm with workspace name and execute deletion.

    Requires MFA to have been verified via closure_verify_mfa first.

    Request: {workspace_name: str}
    """
    member, err = check_permission(request, ["tenant.close"])
    if err:
        return err

    tenant = request.tenant

    if tenant.status != TenantStatus.ACTIVE:
        logger.warning(
            "Closure execute rejected — workspace not active: tenant=%s status=%s user=%s",
            tenant.slug, tenant.status, request.user.email,
        )
        return Response(
            {"detail": "Workspace is not active."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Check MFA was verified recently (within 5 minutes)
    mfa_verified_at = request.session.get('closure_mfa_verified_at')
    if not mfa_verified_at:
        logger.warning(
            "Closure execute rejected — no MFA verification in session: tenant=%s user=%s",
            tenant.slug, request.user.email,
        )
        return Response(
            {"detail": "MFA verification required. Please go back and verify your MFA code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from datetime import timedelta
    from django.utils.dateparse import parse_datetime
    verified_time = parse_datetime(mfa_verified_at)
    if not verified_time or timezone.now() - verified_time > timedelta(minutes=5):
        # Clear stale verification
        request.session.pop('closure_mfa_verified_at', None)
        request.session.save()
        logger.warning(
            "Closure execute rejected — MFA verification expired: tenant=%s user=%s",
            tenant.slug, request.user.email,
        )
        return Response(
            {"detail": "MFA verification expired. Please verify again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    workspace_name = (request.data.get("workspace_name") or "").strip()

    if not workspace_name:
        return Response(
            {"detail": "Workspace name is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if workspace_name != tenant.name:
        logger.warning(
            "Closure execute rejected — name mismatch: tenant=%s user=%s given='%s'",
            tenant.slug, request.user.email, workspace_name,
        )
        return Response(
            {"detail": "Workspace name does not match."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Create closure record for audit trail
    closure = TenantClosure.objects.create(
        id=uuid.uuid4(),
        tenant_name=tenant.name,
        tenant_slug=tenant.slug,
        owner_email=request.user.email,
        data_export_choice=DataExportChoice.NOT_NEEDED,
        confirmation_code_hash="",
        code_expires_at=timezone.now(),
        ip_address=_get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
        closed_at=timezone.now(),
    )

    # Mark tenant as CLOSING
    tenant.status = TenantStatus.CLOSING
    tenant.save(update_fields=["status", "updated_at"])

    # Clear MFA verification from session
    request.session.pop('closure_mfa_verified_at', None)
    request.session.save()

    # Publish job event for purge
    try:
        get_event_publisher().publish({
            "routing": ["job"],
            "event_area": "tenant",
            "event_type": "closure_execute",
            "tenant_id": str(tenant.pk),
            "tenant_slug": tenant.slug,
            "user_id": str(request.user.pk),
            "email": request.user.email,
            "name": request.user.get_full_name(),
            "tenant_name": tenant.name,
            "closure_id": str(closure.pk),
            "version": "1",
        })
    except Exception:
        logger.exception(
            "Failed to publish closure purge event — tenant stuck in CLOSING: "
            "tenant=%s closure=%s",
            tenant.slug, closure.pk,
        )
        # Don't rollback — the closure record and CLOSING status are correct.
        # An admin can re-trigger or manually purge. Still return success to
        # the user since the workspace is already marked for deletion.

    log_audit(
        request=request,
        action=AuditAction.DELETE,
        resource_type="tenant_closure",
        resource_id=str(closure.pk),
        resource_repr=f"Workspace deleted: {tenant.name}",
    )

    logger.info(
        "Workspace deletion executed: tenant=%s user=%s closure=%s",
        tenant.slug, request.user.email, closure.pk,
    )

    return Response(
        {
            "detail": "Workspace deletion confirmed. All data will be permanently deleted.",
            "closure_id": str(closure.pk),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def closure_status(request):
    """Poll endpoint for closure progress — no auth required.

    Query param: closure_id (UUID)
    """
    closure_id = request.query_params.get("closure_id", "").strip()
    if not closure_id:
        return Response(
            {"detail": "closure_id query parameter is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        closure = TenantClosure.objects.get(pk=closure_id)
    except (TenantClosure.DoesNotExist, ValueError):
        return Response(
            {"detail": "Closure record not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Determine status
    progress = closure.progress or {}
    error = progress.get("error")

    if error:
        closure_state = "failed"
    elif closure.purged_at:
        closure_state = "completed"
    elif closure.closed_at:
        closure_state = "processing"
    else:
        closure_state = "processing"

    # Check worker health only when still processing
    workers_healthy = None
    if closure_state == "processing":
        try:
            from bytescop.celery import app as celery_app
            ping_result = celery_app.control.ping(timeout=2)
            workers_healthy = len(ping_result) > 0
        except Exception:
            workers_healthy = False

    # Count remaining active tenants for this owner email
    remaining_tenants = (
        TenantMember.objects.filter(
            user__email=closure.owner_email,
            is_active=True,
        )
        .values("tenant_id")
        .distinct()
        .count()
    )

    return Response({
        "status": closure_state,
        "tenant_name": closure.tenant_name,
        "steps": progress.get("steps", []),
        "error": error,
        "workers_healthy": workers_healthy,
        "remaining_tenants": remaining_tenants,
        "started_at": closure.closed_at.isoformat() if closure.closed_at else None,
        "completed_at": closure.purged_at.isoformat() if closure.purged_at else None,
    })
