"""Audit logging service — the single entry point for creating audit records."""

import json
import logging

from django.core.serializers.json import DjangoJSONEncoder

from .models import AuditLog

logger = logging.getLogger("bytescop.audit")


def _json_safe(value):
    """Round-trip through JSON so UUIDs, dates, etc. become plain strings."""
    if value is None:
        return None
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


def compute_diff(before, after):
    """Return {field: {old, new}} for changed fields only."""
    if not before or not after:
        return None

    diff = {}
    all_keys = set(list(before.keys()) + list(after.keys()))

    for key in all_keys:
        old_val = before.get(key)
        new_val = after.get(key)
        if old_val != new_val:
            diff[key] = {"old": old_val, "new": new_val}

    return diff if diff else None


def _get_client_ip(request):
    """Extract client IP from X-Forwarded-For or REMOTE_ADDR."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def log_audit(
    request,
    action,
    resource_type,
    resource_id="",
    resource_repr="",
    before=None,
    after=None,
):
    """Create an AuditLog entry."""
    tenant = getattr(request, "tenant", None)
    user = getattr(request, "user", None)
    if user and not user.is_authenticated:
        user = None

    actor_email = ""
    if user:
        actor_email = getattr(user, "email", "")

    before = _json_safe(before)
    after = _json_safe(after)
    diff = compute_diff(before, after)

    try:
        entry = AuditLog.objects.create(
            tenant=tenant,
            actor=user,
            actor_email=actor_email,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else "",
            resource_repr=str(resource_repr)[:255] if resource_repr else "",
            before=before,
            after=after,
            diff=diff,
            ip_address=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
            request_id=getattr(request, "request_id", ""),
            request_path=request.get_full_path()[:512],
        )
        logger.debug(
            "Audit log created id=%s action=%s resource=%s/%s",
            entry.pk, action, resource_type, resource_id,
        )
        return entry
    except Exception:
        logger.exception("Failed to write audit log action=%s resource=%s/%s", action, resource_type, resource_id)
        return None
