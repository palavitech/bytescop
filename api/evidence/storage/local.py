import logging
import os

from django.conf import settings

from .base import AttachmentStorage


def _is_writable_dir(path: str) -> bool:
    try:
        os.makedirs(path, exist_ok=True)
        test_file = os.path.join(path, '.bytescop_write_test')
        with open(test_file, 'w', encoding='utf-8') as f:
            f.write('ok')
        os.remove(test_file)
        return True
    except Exception as exc:
        logging.getLogger("bytescop.evidence").debug("Directory not writable: %s (%s)", path, exc)
        return False


def _safe_media_root() -> str:
    media_root = getattr(settings, 'MEDIA_ROOT', '') or ''
    if _is_writable_dir(media_root):
        return media_root
    if not getattr(settings, 'DEBUG', False):
        return media_root
    fallback = os.path.expanduser('~/bytescop-media')
    os.makedirs(fallback, exist_ok=True)
    return fallback


class LocalAttachmentStorage(AttachmentStorage):

    def save(
        self, *, tenant_id: str, engagement_id, token: str,
        file_obj, filename: str, content_type: str,
    ) -> str:
        rel_path = f'{tenant_id}/engagements/{engagement_id}/images/{token}/{filename}'
        media_root = _safe_media_root()
        abs_path = os.path.join(media_root, rel_path)
        # Path traversal guard: resolved path must stay under MEDIA_ROOT
        resolved = os.path.realpath(abs_path)
        if not resolved.startswith(os.path.realpath(media_root) + os.sep):
            raise ValueError("Path traversal detected")
        os.makedirs(os.path.dirname(resolved), exist_ok=True)
        abs_path = resolved
        with open(abs_path, 'wb') as f:
            for chunk in file_obj.chunks():
                f.write(chunk)
        return abs_path

    def open(self, storage_uri: str):
        return open(storage_uri, 'rb')

    def delete(self, storage_uri: str) -> None:
        try:
            os.remove(storage_uri)
        except FileNotFoundError:
            pass
