"""Fernet encrypt/decrypt helpers for TOTP secret storage.

Derives a stable Fernet key from ``settings.SECRET_KEY`` so that
encrypted values survive process restarts but stay unreadable at rest.
"""

import base64
import hashlib

from cryptography.fernet import Fernet
from django.conf import settings


def _derive_key() -> bytes:
    """Derive a 32-byte Fernet key from the Django SECRET_KEY."""
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a plaintext TOTP secret and return a URL-safe string."""
    f = Fernet(_derive_key())
    return f.encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted TOTP secret back to plaintext."""
    f = Fernet(_derive_key())
    return f.decrypt(ciphertext.encode()).decode()
