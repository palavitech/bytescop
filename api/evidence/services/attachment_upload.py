import hashlib
import logging
import os

from django.conf import settings
from rest_framework import serializers

from core.validators import validate_image_file
from evidence.models import Attachment
from evidence.storage.factory import get_attachment_storage

logger = logging.getLogger("bytescop.evidence")


class AttachmentUploadService:

    def __init__(self):
        self.storage = get_attachment_storage()

    def upload_image(self, *, tenant, tenant_id: str, engagement, user, file_obj):
        if not file_obj:
            raise serializers.ValidationError({'file': 'Missing file.'})

        content_type = getattr(file_obj, 'content_type', '') or ''
        if not content_type.startswith('image/'):
            logger.warning("Upload rejected (bad content type) content_type=%s", content_type)
            raise serializers.ValidationError({'file': 'Only image uploads are allowed.'})

        max_bytes = getattr(settings, 'BC_MAX_UPLOAD_BYTES', 10 * 1024 * 1024)
        size = getattr(file_obj, 'size', 0) or 0
        if size and size > max_bytes:
            logger.warning("Upload rejected (size exceeded) size=%d max=%d", size, max_bytes)
            raise serializers.ValidationError(
                {'file': f'File exceeds max size ({max_bytes} bytes).'},
            )

        # Validate actual file content (magic bytes + Pillow decode)
        try:
            validate_image_file(file_obj)
        except ValueError as e:
            logger.warning("Upload rejected (invalid image) reason=%s", e)
            raise serializers.ValidationError({'file': str(e)})

        filename = getattr(file_obj, 'name', 'upload.bin') or 'upload.bin'
        # Sanitize: strip path components to prevent traversal (security H4)
        filename = os.path.basename(filename.replace('\\', '/'))
        if not filename or filename.startswith('.'):
            filename = 'upload.bin'

        att = Attachment.objects.create(
            tenant=tenant,
            engagement=engagement,
            filename=filename,
            content_type=content_type,
            size_bytes=size or 0,
            uploaded_by=user if user and getattr(user, 'is_authenticated', False) else None,
            status='draft',
        )

        try:
            h = hashlib.sha256()
            for chunk in file_obj.chunks():
                h.update(chunk)
            att.sha256 = h.hexdigest()
        except Exception:
            pass

        try:
            f = getattr(file_obj, 'file', None)
            if f and hasattr(f, 'seek'):
                f.seek(0)
        except Exception:
            pass

        storage_uri = self.storage.save(
            tenant_id=tenant_id,
            engagement_id=str(engagement.id),
            token=str(att.id),
            file_obj=file_obj,
            filename=filename,
            content_type=content_type,
        )
        att.storage_uri = storage_uri
        att.save(update_fields=['sha256', 'storage_uri'])

        logger.info("Upload succeeded id=%s filename=%s size=%d content_type=%s", att.pk, filename, att.size_bytes, content_type)
        return att
