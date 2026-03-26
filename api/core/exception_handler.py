"""Custom DRF exception handler with structured logging.

Register in settings:
    REST_FRAMEWORK = {
        'EXCEPTION_HANDLER': 'core.exception_handler.api_exception_handler',
    }
"""

import logging
import traceback

from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import (
    APIException,
    AuthenticationFailed,
    NotAuthenticated,
    PermissionDenied,
    ValidationError,
)
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from core.logging import request_id_var

logger = logging.getLogger("bytescop.api")

SENSITIVE_FIELDS = frozenset({"password", "token", "refresh", "access", "secret"})


def _sanitize(data):
    """Replace values of sensitive keys with '***'."""
    if isinstance(data, dict):
        return {
            k: "***" if k.lower() in SENSITIVE_FIELDS else _sanitize(v)
            for k, v in data.items()
        }
    if isinstance(data, (list, tuple)):
        return [_sanitize(item) for item in data]
    return data


def _log_context(request, response, exc):
    """Build common context dict for log messages."""
    return {
        "method": request.method,
        "path": request.get_full_path(),
        "status": getattr(response, "status_code", 500),
        "user": str(getattr(request.user, "email", "anonymous")),
        "tenant": getattr(getattr(request, "tenant", None), "slug", "-"),
        "exc": type(exc).__name__,
    }


def _extract_validation_message(errors):
    """Build a human-readable message from DRF validation errors.

    Prefers a single non_field_errors entry, then the first field-level
    error, falling back to a generic message.
    """
    if isinstance(errors, list):
        return str(errors[0]) if errors else "Validation error."

    if not isinstance(errors, dict):
        return "Validation error."

    # Single non-field error → use it directly
    nfe = errors.get("non_field_errors", [])
    if isinstance(nfe, list) and len(nfe) == 1 and len(errors) == 1:
        return str(nfe[0])

    # Field-level errors → use the first one, prefixed with the field name
    for field, msgs in errors.items():
        if field == "non_field_errors":
            continue
        if isinstance(msgs, list) and msgs:
            return f"{field}: {msgs[0]}"
        if isinstance(msgs, str):
            return f"{field}: {msgs}"

    return "Validation error."


def api_exception_handler(exc, context):
    """Handle all DRF exceptions with logging and a consistent envelope."""
    request = context.get("request")
    rid = request_id_var.get() if request is None else getattr(request, "request_id", request_id_var.get())

    # Let DRF handle known exceptions first
    response = drf_exception_handler(exc, context)

    if response is None:
        # Unhandled exception — DRF returned None
        if isinstance(exc, Http404):
            response = Response(
                {"message": "Not found.", "request_id": rid},
                status=status.HTTP_404_NOT_FOUND,
            )
        else:
            logger.error(
                "Unhandled exception: %s path=%s user=%s tenant=%s\n%s",
                type(exc).__name__,
                request.get_full_path() if request else "-",
                str(getattr(request.user, "email", "anonymous")) if request else "-",
                getattr(getattr(request, "tenant", None), "slug", "-") if request else "-",
                traceback.format_exc(),
            )
            response = Response(
                {"message": "Internal server error.", "request_id": rid},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return response

    # --- Log at appropriate level based on status code ---
    if request:
        ctx = _log_context(request, response, exc)
        safe_data = _sanitize(request.data) if hasattr(request, "data") else {}

        if response.status_code >= 500:
            logger.error(
                "Server error: %(method)s %(path)s %(status)s exc=%(exc)s user=%(user)s tenant=%(tenant)s",
                ctx,
            )
        elif response.status_code in (401, 403):
            logger.warning(
                "Auth/permission error: %(method)s %(path)s %(status)s exc=%(exc)s user=%(user)s tenant=%(tenant)s",
                ctx,
            )
        elif response.status_code == 400:
            logger.info(
                "Validation error: %s %s %s exc=%s user=%s tenant=%s body=%s",
                ctx["method"], ctx["path"], ctx["status"],
                ctx["exc"], ctx["user"], ctx["tenant"],
                safe_data,
            )

    # --- Build consistent response envelope ---
    if isinstance(exc, ValidationError):
        errors = response.data
        message = _extract_validation_message(errors)
        body = {
            "message": message,
            "errors": errors,
            "request_id": rid,
        }
    else:
        detail = response.data.get("detail", str(exc)) if isinstance(response.data, dict) else str(exc)
        body = {
            "message": detail,
            "request_id": rid,
        }

    response.data = body
    return response
