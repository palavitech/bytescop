"""@audited decorator for ViewSet @action methods and internal dispatch methods."""

import functools
import logging

from rest_framework import status

from .models import AuditAction
from .service import log_audit

logger = logging.getLogger("bytescop.audit")

# Map HTTP methods → audit actions (defaults, caller can override via ``action`` param).
_METHOD_ACTION_MAP = {
    "POST": AuditAction.CREATE,
    "PUT": AuditAction.UPDATE,
    "PATCH": AuditAction.UPDATE,
    "DELETE": AuditAction.DELETE,
}


def audited(
    resource_type,
    *,
    action=None,
    id_field="id",
    id_kwarg=None,
    repr_fmt=None,
):
    """Decorator that logs an audit entry after a successful ViewSet method.

    Args:
        resource_type: The audit resource type string (e.g. "sow", "scope", "finding").
        action: Explicit ``AuditAction`` value. If ``None``, derived from ``request.method``.
        id_field: Key in ``response.data`` to extract the resource ID (default ``"id"``).
        id_kwarg: URL kwarg name to use as resource ID when ``response.data`` is empty
                  (e.g. ``"asset_id"`` for scope remove).
        repr_fmt: Optional format string for ``resource_repr``. Receives the response data
                  dict as keyword args (e.g. ``"SoW: {title}"``). Falls back to
                  ``request._audit_repr`` if set by the view, then empty string.

    The view can optionally set:
        - ``request._audit_before``: before-snapshot dict (one line in the view)
        - ``request._audit_repr``: explicit repr string (useful for DELETE with no body)
        - ``request._audit_resource_id``: explicit resource ID override
    """

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(self, request, *args, **kwargs):
            response = fn(self, request, *args, **kwargs)

            if not status.is_success(response.status_code):
                return response

            audit_action = action or _METHOD_ACTION_MAP.get(request.method)
            if audit_action is None:
                return response

            data = response.data if response.data else {}

            # Resource ID: explicit override > response data > URL kwarg
            resource_id = getattr(request, "_audit_resource_id", None)
            if resource_id is None:
                resource_id = data.get(id_field, "")
            if not resource_id and id_kwarg:
                resource_id = kwargs.get(id_kwarg, "")

            # Resource repr
            resource_repr = getattr(request, "_audit_repr", None)
            if resource_repr is None and repr_fmt and data:
                try:
                    resource_repr = repr_fmt.format(**data)
                except (KeyError, IndexError, TypeError):
                    resource_repr = ""
            resource_repr = resource_repr or ""

            # Before/after snapshots
            before = getattr(request, "_audit_before", None)
            after = data if audit_action in (AuditAction.CREATE, AuditAction.UPDATE) else None

            log_audit(
                request=request,
                action=audit_action,
                resource_type=resource_type,
                resource_id=resource_id,
                resource_repr=resource_repr,
                before=before,
                after=after,
            )
            return response

        return wrapper
    return decorator
