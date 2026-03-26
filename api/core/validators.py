"""
Shared validation utilities.

Provides magic-byte and Pillow-based validation for image uploads,
email format + TLD validation, email domain format checks,
and text content sanitization for user-submitted free-text fields.

To extend for new file types (PDF, CSV, etc.), add a new validate_*
function with appropriate magic signatures.
"""
import html
import re

from django.core.exceptions import ValidationError
from PIL import Image, UnidentifiedImageError

from core.tlds import VALID_TLDS

# ---- Email domain format validation ----------------------------------------

# Valid domain: labels separated by dots, each label alphanumeric or hyphens,
# must not start/end with a hyphen, and must have at least two labels.
_DOMAIN_RE = re.compile(
    r'^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?'
    r'(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$'
)


def validate_email_domain(email: str) -> None:
    """Raise ValidationError if the email domain is malformed."""
    parts = email.rsplit('@', 1)
    if len(parts) != 2 or not parts[1]:
        raise ValidationError("Enter a valid email address.")
    domain = parts[1].lower()
    if not _DOMAIN_RE.match(domain):
        raise ValidationError(
            f"'{domain}' is not a valid email domain."
        )


# ---- Email format + TLD validation ------------------------------------------

# RFC 5321 compliant-ish: local@domain.tld
_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
)


def validate_email_address(email: str) -> None:
    """Validate email format and TLD against the IANA registry.

    Raises ValidationError if:
    - The email doesn't match basic format rules
    - The TLD is not in the IANA registry
    """
    if not _EMAIL_RE.match(email):
        raise ValidationError("Enter a valid email address.")

    domain = email.rsplit('@', 1)[-1].lower()
    tld = domain.rsplit('.', 1)[-1]
    if tld not in VALID_TLDS:
        raise ValidationError(
            f"'{tld}' is not a recognized top-level domain."
        )


# Magic byte signatures for allowed raster image types.
_IMAGE_MAGIC = [
    (b"\x89PNG", "PNG"),
    (b"\xff\xd8\xff", "JPEG"),
    (b"GIF87a", "GIF"),
    (b"GIF89a", "GIF"),
    (b"BM", "BMP"),
    # WebP: bytes 0-3 == RIFF, bytes 8-11 == WEBP (checked separately)
]


def check_image_magic(header: bytes) -> bool:
    """Return True if *header* matches a known raster image signature."""
    if len(header) < 2:
        return False
    for sig, _ in _IMAGE_MAGIC:
        if header[:len(sig)] == sig:
            return True
    # WebP: RIFF....WEBP
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return True
    return False


def validate_image_file(file_obj) -> None:
    """Validate that file_obj is a real raster image.

    Two-layer check:
    1. Magic bytes — reject files that don't start with a known image signature.
    2. Pillow decode — reject files that have valid magic bytes but corrupt/malicious content.

    Raises ValueError if validation fails. Seeks file back to 0 on success.
    """
    # 1) Magic bytes
    pos = file_obj.tell() if hasattr(file_obj, 'tell') else 0
    header = file_obj.read(16)
    if not check_image_magic(header):
        raise ValueError("File is not a valid image (bad magic bytes).")
    file_obj.seek(pos)

    # 2) Pillow decode — forces full decompression to catch corrupt payloads
    try:
        img = Image.open(file_obj)
        img.load()
    except (UnidentifiedImageError, Exception):
        raise ValueError("File is not a valid image (decode failed).")
    finally:
        file_obj.seek(pos)


# ---- Text content sanitization -----------------------------------------------
# Detects and blocks common attack payloads in user-submitted free-text fields
# (contact forms, feedback, etc.).  Defence-in-depth — template autoescape is
# the primary XSS barrier; these checks stop obviously malicious input early.

# HTML tags (including self-closing and malformed)
_HTML_TAG_RE = re.compile(r'<[^>]+>', re.IGNORECASE)

# Patterns that indicate XSS / script injection
_XSS_PATTERNS = [
    re.compile(r'<\s*script', re.IGNORECASE),
    re.compile(r'javascript\s*:', re.IGNORECASE),
    re.compile(r'vbscript\s*:', re.IGNORECASE),
    re.compile(r'\bon\w+\s*=', re.IGNORECASE),           # on*= event handlers
    re.compile(r'<\s*iframe', re.IGNORECASE),
    re.compile(r'<\s*object', re.IGNORECASE),
    re.compile(r'<\s*embed', re.IGNORECASE),
    re.compile(r'<\s*form', re.IGNORECASE),
    re.compile(r'<\s*img[^>]+onerror', re.IGNORECASE),
    re.compile(r'data\s*:\s*text/html', re.IGNORECASE),  # data URI XSS
    re.compile(r'expression\s*\(', re.IGNORECASE),        # CSS expression()
    re.compile(r'url\s*\(\s*["\']?javascript:', re.IGNORECASE),
]

# Patterns that indicate SQL injection attempts
_SQLI_PATTERNS = [
    re.compile(r"('\s*(OR|AND)\s+['\d])", re.IGNORECASE),        # ' OR '1
    re.compile(r'(UNION\s+(ALL\s+)?SELECT)', re.IGNORECASE),
    re.compile(r'(DROP\s+TABLE)', re.IGNORECASE),
    re.compile(r'(INSERT\s+INTO)', re.IGNORECASE),
    re.compile(r'(DELETE\s+FROM)', re.IGNORECASE),
    re.compile(r'(UPDATE\s+\w+\s+SET)', re.IGNORECASE),
    re.compile(r'(;\s*(DROP|DELETE|INSERT|UPDATE|ALTER))', re.IGNORECASE),
    re.compile(r'(/\*.*?\*/)', re.IGNORECASE),                   # SQL comments
    re.compile(r'(--\s)', re.IGNORECASE),                        # SQL line comment
    re.compile(r'(EXEC(\s+|\())', re.IGNORECASE),
    re.compile(r'(xp_cmdshell)', re.IGNORECASE),
]


def strip_html_tags(text: str) -> str:
    """Remove all HTML tags and unescape HTML entities.

    Returns clean plain text suitable for safe rendering.
    """
    cleaned = _HTML_TAG_RE.sub('', text)
    return html.unescape(cleaned)


def check_xss(text: str) -> str | None:
    """Return the matched pattern description if XSS is detected, else None."""
    for pattern in _XSS_PATTERNS:
        if pattern.search(text):
            return pattern.pattern
    return None


def check_sqli(text: str) -> str | None:
    """Return the matched pattern description if SQLi is detected, else None."""
    for pattern in _SQLI_PATTERNS:
        if pattern.search(text):
            return pattern.pattern
    return None


def sanitize_text(text: str) -> str:
    """Sanitize free-text input: strip HTML tags and unescape entities.

    Use this for fields where HTML is never expected (names, subjects, messages).
    Returns the cleaned string.
    """
    return strip_html_tags(text).strip()


def validate_safe_text(text: str, field_name: str = 'input') -> None:
    """Validate that text does not contain malicious payloads.

    Checks for XSS vectors and SQL injection patterns.
    Raises ValidationError if suspicious content is detected.
    """
    if check_xss(text):
        raise ValidationError(
            f"{field_name} contains content that is not allowed."
        )
    if check_sqli(text):
        raise ValidationError(
            f"{field_name} contains content that is not allowed."
        )
