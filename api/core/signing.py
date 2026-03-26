"""Shared signed-token and encryption utilities.

Signing: HMAC tokens with per-purpose salts (django.core.signing).
Encryption: Fernet symmetric encryption derived from SECRET_KEY.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core import signing

# ---------------------------------------------------------------------------
# Salt constants — MUST be unique per purpose
# ---------------------------------------------------------------------------
SALT_MFA_CHALLENGE = "mfa-challenge"
SALT_MFA_RE_ENROLL = "mfa-re-enroll"
SALT_INVITE_SESSION = "invite-session"
SALT_EMAIL_VERIFY = "email-verify"
SALT_PASSWORD_RESET = "password-reset"

# ---------------------------------------------------------------------------
# Max-age constants (seconds)
# ---------------------------------------------------------------------------
MAX_AGE_MFA_CHALLENGE = 300       # 5 minutes
MAX_AGE_MFA_RE_ENROLL = 300       # 5 minutes
MAX_AGE_INVITE_SESSION = 1800     # 30 minutes
MAX_AGE_EMAIL_VERIFY = 86400      # 24 hours
MAX_AGE_PASSWORD_RESET = 3600     # 1 hour


def create_signed_token(payload: dict, salt: str) -> str:
    """Create an HMAC-signed token embedding *payload* and a timestamp.

    The token is URL-safe and can be used in query parameters.
    """
    return signing.dumps(payload, salt=salt)


def verify_signed_token(token: str, salt: str, max_age: int) -> dict:
    """Verify and decode a signed token.

    Returns the original payload dict.

    Raises:
        django.core.signing.BadSignature  — invalid or tampered token
        django.core.signing.SignatureExpired — valid but past max_age
    """
    return signing.loads(token, salt=salt, max_age=max_age)


# ---------------------------------------------------------------------------
# Fernet encryption (symmetric, derived from SECRET_KEY)
# ---------------------------------------------------------------------------

def _get_fernet_key() -> bytes:
    """Derive a 32-byte Fernet key from Django's SECRET_KEY."""
    dk = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(dk)


def fernet_encrypt(plaintext: str) -> str:
    """Encrypt a string and return a URL-safe Fernet token."""
    f = Fernet(_get_fernet_key())
    return f.encrypt(plaintext.encode()).decode()


def fernet_decrypt(token: str) -> str:
    """Decrypt a Fernet token back to the original string.

    Returns empty string on invalid/tampered tokens.
    """
    try:
        f = Fernet(_get_fernet_key())
        return f.decrypt(token.encode()).decode()
    except (InvalidToken, Exception):
        return ''
