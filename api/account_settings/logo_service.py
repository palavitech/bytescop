"""
Tenant logo upload / delete / serve helpers.

Storage path: ``{tenant_id}/logo.png``
- Tenant-scoped via UUID.
- Fixed filename -- each upload overwrites the previous.
- Local filesystem only.
"""

import io
import os

from PIL import Image, UnidentifiedImageError
from django.conf import settings

from core.validators import check_image_magic
from evidence.storage.local import _safe_media_root

LOGO_MAX_BYTES = 1 * 1024 * 1024  # 1 MB

EXT_MAP = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


class LogoService:
    """Validate, resize, and persist tenant logos (local filesystem)."""

    def process_and_save(self, tenant, file_obj) -> str:
        """Validate, resize to max 512px wide, save, return storage_uri."""
        # 1) Size check
        size = getattr(file_obj, "size", None)
        if size is not None and size > LOGO_MAX_BYTES:
            raise ValueError("Logo must be under 1 MB.")

        # 2) Magic bytes check
        header = file_obj.read(16)
        if len(header) < 2 or not check_image_magic(header):
            raise ValueError("Unsupported image format.")
        file_obj.seek(0)

        # 3) Pillow full decode
        try:
            img = Image.open(file_obj)
            img.load()
        except (UnidentifiedImageError, Exception):
            raise ValueError("File is not a valid image.")

        # 4) Convert to RGB (drop alpha / palette issues)
        if img.mode not in ("RGB",):
            img = img.convert("RGB")

        # 5) Resize if wider than 512px (preserve aspect ratio)
        max_w = 512
        if img.width > max_w:
            ratio = max_w / img.width
            img = img.resize(
                (max_w, int(img.height * ratio)), Image.LANCZOS
            )

        # 6) Re-encode as PNG into buffer
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        # 7) Delete old logo if present
        old_uri = self._get_stored_uri(tenant)
        if old_uri:
            self.delete(old_uri)

        # 8) Write to storage
        storage_uri = self._save_to_storage(str(tenant.id), buf)
        return storage_uri

    def delete(self, storage_uri: str) -> None:
        """Remove a logo file from local storage."""
        if not storage_uri:
            return
        try:
            os.remove(storage_uri)
        except FileNotFoundError:
            pass

    def open(self, storage_uri: str):
        """Open the logo file for streaming."""
        if not storage_uri:
            return None
        media_root = _safe_media_root()
        resolved = os.path.realpath(storage_uri)
        if not resolved.startswith(os.path.realpath(media_root) + os.sep):
            return None
        try:
            return open(resolved, "rb")  # noqa: SIM115
        except FileNotFoundError:
            return None

    @staticmethod
    def _get_stored_uri(tenant) -> str | None:
        from .models import AccountSetting
        try:
            obj = AccountSetting.objects.get(tenant=tenant, key="logo")
            return obj.value or None
        except AccountSetting.DoesNotExist:
            return None

    @staticmethod
    def _save_to_storage(tenant_id: str, buf: io.BytesIO) -> str:
        rel_path = f"{tenant_id}/logo.png"

        media_root = _safe_media_root()
        abs_path = os.path.join(media_root, rel_path)
        # Path traversal guard
        resolved = os.path.realpath(abs_path)
        if not resolved.startswith(os.path.realpath(media_root) + os.sep):
            raise ValueError("Path traversal detected")
        os.makedirs(os.path.dirname(resolved), exist_ok=True)
        with open(resolved, "wb") as f:
            f.write(buf.read())
        return resolved
