"""
Avatar upload / delete / serve helpers.

Storage path: ``{tenant_id}/users/{user_id}/avatar.png``
- Tenant-scoped via UUID, user-scoped via UUID.
- Fixed filename -- each upload overwrites the previous.
- Local filesystem only.
"""

import io
import os

from PIL import Image, UnidentifiedImageError
from django.conf import settings

from core.validators import check_image_magic
from evidence.storage.local import _safe_media_root

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BC_MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_avatar_url(user) -> str | None:
    """Build the public URL for a user's avatar, or *None*."""
    if not user.avatar_uri:
        return None
    return f"/api/users/{user.id}/avatar/"


# ---------------------------------------------------------------------------
# AvatarService
# ---------------------------------------------------------------------------

class AvatarService:
    """Validate, resize, and persist user avatars (local filesystem)."""

    def process_and_save(self, user, file_obj, tenant_id: str) -> str:
        """Validate, resize to 256x256, save, return storage_uri."""
        # 1) Size check
        size = getattr(file_obj, "size", None)
        if size is not None and size > BC_MAX_AVATAR_BYTES:
            raise ValueError("Image must be under 2 MB.")

        # 2) Magic bytes check
        header = file_obj.read(16)
        if len(header) < 2 or not check_image_magic(header):
            raise ValueError("Unsupported image format.")
        file_obj.seek(0)

        # 3) Pillow decode
        try:
            img = Image.open(file_obj)
            img.load()  # force full decode
        except (UnidentifiedImageError, Exception):
            raise ValueError("File is not a valid image.")

        # 4) Convert to RGB (drop alpha / palette issues)
        if img.mode not in ("RGB",):
            img = img.convert("RGB")

        # 5) Center-crop to square then resize 256x256
        img = self._center_crop_square(img)
        img = img.resize((256, 256), Image.LANCZOS)

        # 6) Re-encode as PNG into buffer
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)

        # 7) Delete old avatar if present
        if user.avatar_uri:
            self.delete(user.avatar_uri)

        # 8) Write to storage
        storage_uri = self._save_to_storage(user, buf, tenant_id)
        return storage_uri

    # -- delete ----------------------------------------------------------------

    def delete(self, storage_uri: str) -> None:
        """Remove an avatar file from local storage."""
        if not storage_uri:
            return
        try:
            os.remove(storage_uri)
        except FileNotFoundError:
            pass

    # -- read / serve ----------------------------------------------------------

    def open(self, storage_uri: str):
        """Open the avatar file for streaming."""
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

    # -- internal --------------------------------------------------------------

    @staticmethod
    def _center_crop_square(img: Image.Image) -> Image.Image:
        w, h = img.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        return img.crop((left, top, left + side, top + side))

    @staticmethod
    def _save_to_storage(user, buf: io.BytesIO, tenant_id: str) -> str:
        rel_path = f"{tenant_id}/users/{user.id}/avatar.png"

        media_root = _safe_media_root()
        abs_path = os.path.join(media_root, rel_path)
        resolved = os.path.realpath(abs_path)
        if not resolved.startswith(os.path.realpath(media_root) + os.sep):
            raise ValueError("Path traversal detected")
        os.makedirs(os.path.dirname(resolved), exist_ok=True)
        with open(resolved, "wb") as f:
            f.write(buf.read())
        return resolved
