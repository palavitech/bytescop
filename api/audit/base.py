"""AuditedModelViewSet — drop-in ModelViewSet replacement with automatic CUD audit logging."""

import logging

from rest_framework import status, viewsets
from rest_framework.response import Response

from .models import AuditAction
from .service import log_audit

logger = logging.getLogger("bytescop.audit")


class AuditedModelViewSet(viewsets.ModelViewSet):
    """ModelViewSet that automatically logs CREATE, UPDATE, DELETE audit entries.

    Subclasses set ``audit_resource_type`` and get full CUD auditing for free.
    ``perform_create/update/destroy`` remain available for pure business logic.
    Only logs on 2xx responses.

    Usage::

        class ClientViewSet(AuditedModelViewSet):
            audit_resource_type = "client"

            def perform_create(self, serializer):
                serializer.save(tenant=self.request.tenant)
    """

    audit_resource_type: str = ""

    # -- Object cache (scoped to the per-request ViewSet instance) -----------

    _cached_object = None

    def get_object(self):
        """Cache ``get_object()`` per-request to avoid double DB queries on update/destroy."""
        if self._cached_object is None:
            self._cached_object = super().get_object()
        return self._cached_object

    # -- Audit helpers -------------------------------------------------------

    def _audit_snapshot(self, instance):
        """Serialize an instance using the ViewSet's serializer."""
        serializer_class = self.get_serializer_class()
        return serializer_class(instance).data

    def get_audit_repr(self, data):
        """Return a human-readable label from serialized data.

        Checks ``name``, ``title``, ``email`` fields in order.
        Override for custom labels.
        """
        if isinstance(data, dict):
            for field in ("name", "title", "email"):
                val = data.get(field)
                if val:
                    return str(val)
        return ""

    # -- CUD overrides -------------------------------------------------------

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        if status.is_success(response.status_code):
            after = response.data
            log_audit(
                request=request,
                action=AuditAction.CREATE,
                resource_type=self.audit_resource_type,
                resource_id=after.get("id", ""),
                resource_repr=self.get_audit_repr(after),
                after=after,
            )
        return response

    def update(self, request, *args, **kwargs):
        before = self._audit_snapshot(self.get_object())
        response = super().update(request, *args, **kwargs)
        if status.is_success(response.status_code):
            after = response.data
            log_audit(
                request=request,
                action=AuditAction.UPDATE,
                resource_type=self.audit_resource_type,
                resource_id=after.get("id", before.get("id", "")),
                resource_repr=self.get_audit_repr(after),
                before=before,
                after=after,
            )
        return response

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        before = self._audit_snapshot(instance)
        resource_id = before.get("id", str(instance.pk))
        resource_repr = self.get_audit_repr(before)
        response = super().destroy(request, *args, **kwargs)
        if status.is_success(response.status_code):
            log_audit(
                request=request,
                action=AuditAction.DELETE,
                resource_type=self.audit_resource_type,
                resource_id=resource_id,
                resource_repr=resource_repr,
                before=before,
            )
        return response
