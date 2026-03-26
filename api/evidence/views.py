import logging

from django.http import FileResponse, Http404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditAction
from audit.service import log_audit
from .models import Attachment
from .signing import verify_attachment_sig
from .storage.factory import get_attachment_storage

logger = logging.getLogger("bytescop.evidence")


class AttachmentContentView(APIView):
    """Serve attachment content via HMAC-signed URLs.

    ``<img src>`` tags cannot send Authorization headers, so we use a
    query-string signature instead:  ``/api/attachments/<uuid>/content/?sig=<hmac>&tid=<tenant_id>``

    The signature is generated at upload time and embedded in markdown URLs.
    It includes the tenant_id to prevent cross-tenant access.
    """
    permission_classes = [AllowAny]

    def get(self, request, pk):
        sig = request.query_params.get("sig", "")
        tid = request.query_params.get("tid", "")
        if not verify_attachment_sig(pk, sig, tenant_id=tid):
            logger.warning("Attachment access denied (bad sig) id=%s", pk)
            return Response({"detail": "Not found."}, status=404)

        try:
            qs = Attachment.objects.all()
            if tid:
                qs = qs.filter(tenant_id=tid)
            att = qs.get(pk=pk)
        except Attachment.DoesNotExist:
            logger.warning("Attachment not found id=%s", pk)
            raise Http404()

        log_audit(
            request=request, action=AuditAction.READ,
            resource_type="attachment", resource_id=pk,
            resource_repr=f"Attachment: {att.filename}",
        )

        storage = get_attachment_storage()

        try:
            f = storage.open(att.storage_uri)
        except FileNotFoundError:
            logger.warning("Attachment file missing id=%s uri=%s", pk, att.storage_uri)
            raise Http404()

        ct = att.content_type or 'application/octet-stream'
        logger.debug("Attachment served (stream) id=%s", pk)
        resp = FileResponse(f, content_type=ct)
        resp["Content-Disposition"] = f'inline; filename="{att.filename}"'
        resp["X-Content-Type-Options"] = "nosniff"
        resp["Cache-Control"] = "private, no-cache"
        return resp
