import hashlib
import logging
import os
import stat

from django.conf import settings
from rest_framework import serializers

from evidence.models import MalwareSample
from evidence.storage.factory import get_attachment_storage

logger = logging.getLogger("bytescop.evidence")

# Extensions that are dangerous on any OS.  We append '.sample' to ALL files
# regardless, but this list is kept for future reference / extra auditing.
DANGEROUS_EXTENSIONS = frozenset({
    '.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
    '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.ps1', '.psm1',
    '.sh', '.bash', '.elf', '.bin', '.app', '.action', '.command',
    '.cpl', '.inf', '.reg', '.rgs', '.sct', '.hta', '.apk', '.dex',
    '.so', '.dylib',
})

SAFE_SUFFIX = '.sample'


def _neutralize_filename(filename: str) -> str:
    """Append .sample to any filename so the OS never auto-executes it."""
    if not filename:
        return f'unknown{SAFE_SUFFIX}'
    return f'{filename}{SAFE_SUFFIX}'


class MalwareSampleUploadService:

    def __init__(self):
        self.storage = get_attachment_storage()

    def upload_sample(self, *, tenant, tenant_id: str, engagement, user, file_obj, notes: str = ''):
        if not file_obj:
            raise serializers.ValidationError({'file': 'Missing file.'})

        max_bytes = getattr(settings, 'BC_MAX_SAMPLE_BYTES', 200 * 1024 * 1024)
        size = getattr(file_obj, 'size', 0) or 0
        if size and size > max_bytes:
            logger.warning("Sample upload rejected (size exceeded) size=%d max=%d", size, max_bytes)
            raise serializers.ValidationError(
                {'file': f'File exceeds max size ({max_bytes} bytes).'},
            )

        content_type = getattr(file_obj, 'content_type', '') or 'application/octet-stream'

        # Sanitize original filename
        original_filename = getattr(file_obj, 'name', 'upload.bin') or 'upload.bin'
        original_filename = os.path.basename(original_filename.replace('\\', '/'))
        if not original_filename or original_filename.startswith('.'):
            original_filename = 'upload.bin'

        safe_filename = _neutralize_filename(original_filename)

        # Create DB record first
        sample = MalwareSample.objects.create(
            tenant=tenant,
            engagement=engagement,
            original_filename=original_filename,
            safe_filename=safe_filename,
            content_type=content_type,
            size_bytes=size or 0,
            uploaded_by=user if user and getattr(user, 'is_authenticated', False) else None,
            notes=notes,
        )

        # Compute SHA256
        try:
            h = hashlib.sha256()
            for chunk in file_obj.chunks():
                h.update(chunk)
            sample.sha256 = h.hexdigest()
        except Exception:
            logger.warning("Failed to compute SHA256 for sample=%s", sample.id)

        # Seek back to start for storage
        try:
            f = getattr(file_obj, 'file', None)
            if f and hasattr(f, 'seek'):
                f.seek(0)
        except Exception:
            logger.warning("Failed to seek file back to start for sample=%s", sample.id)

        # Store under samples/ path (not images/)
        storage_uri = self._save_sample(
            tenant_id=tenant_id,
            engagement_id=str(engagement.id),
            token=str(sample.id),
            file_obj=file_obj,
            safe_filename=safe_filename,
        )
        sample.storage_uri = storage_uri
        sample.save(update_fields=['sha256', 'storage_uri'])

        # Set read-only permissions so no process can execute the file
        self._set_readonly(storage_uri)

        logger.info(
            "Sample uploaded id=%s original=%s safe=%s size=%d sha256=%s",
            sample.pk, original_filename, safe_filename, sample.size_bytes, sample.sha256,
        )
        return sample

    def _save_sample(self, *, tenant_id, engagement_id, token, file_obj, safe_filename):
        """Save file using the storage backend with samples/ path prefix."""
        from evidence.storage.local import _safe_media_root
        rel_path = f'{tenant_id}/engagements/{engagement_id}/samples/{token}/{safe_filename}'
        media_root = _safe_media_root()
        abs_path = os.path.join(media_root, rel_path)

        # Path traversal guard
        resolved = os.path.realpath(abs_path)
        if not resolved.startswith(os.path.realpath(media_root) + os.sep):
            raise ValueError("Path traversal detected")

        os.makedirs(os.path.dirname(resolved), exist_ok=True)
        with open(resolved, 'wb') as f:
            for chunk in file_obj.chunks():
                f.write(chunk)
        return resolved

    @staticmethod
    def _set_readonly(path: str) -> None:
        """Remove all execute and write bits — file becomes read-only."""
        try:
            os.chmod(path, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)  # 0o444
        except OSError as e:
            logger.warning("Could not set read-only on %s: %s", path, e)
