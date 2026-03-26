"""
Tests for shared file validation utility (security H5).

Tests cover:
- Magic byte detection for valid image formats
- Rejection of non-image files (HTML, SVG, executables, text)
- Pillow decode validation (corrupted images)
"""
import io
from unittest.mock import MagicMock

from django.core.exceptions import ValidationError
from django.test import TestCase

from core.validators import validate_email_address, validate_email_domain, validate_image_file


# ---------------------------------------------------------------------------
# Real image headers (minimal valid bytes)
# ---------------------------------------------------------------------------

PNG_HEADER = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
JPEG_HEADER = b"\xff\xd8\xff\xe0" + b"\x00" * 100
GIF_HEADER = b"GIF89a" + b"\x00" * 100
BMP_HEADER = b"BM" + b"\x00" * 100
WEBP_HEADER = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 100


def _make_file(content, name="test.bin"):
    """Create an in-memory file-like object."""
    buf = io.BytesIO(content)
    buf.name = name
    buf.seek(0)
    return buf


class MagicByteDetectionTests(TestCase):
    """validate_image_file must reject files that aren't real images."""

    def test_html_file_rejected(self):
        """HTML file with image/png content-type must be rejected."""
        html = b"<html><body><script>alert('xss')</script></body></html>"
        f = _make_file(html, "evil.html")
        with self.assertRaises(ValueError) as ctx:
            validate_image_file(f)
        self.assertIn("not a valid image", str(ctx.exception).lower())

    def test_svg_file_rejected(self):
        """SVG with embedded JS must be rejected (not a raster image)."""
        svg = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        f = _make_file(svg, "evil.svg")
        with self.assertRaises(ValueError):
            validate_image_file(f)

    def test_executable_rejected(self):
        """ELF binary must be rejected."""
        elf = b"\x7fELF" + b"\x00" * 200
        f = _make_file(elf, "malware.png")
        with self.assertRaises(ValueError):
            validate_image_file(f)

    def test_plain_text_rejected(self):
        """Plain text file must be rejected."""
        f = _make_file(b"just some text content", "notes.txt")
        with self.assertRaises(ValueError):
            validate_image_file(f)

    def test_empty_file_rejected(self):
        """Empty file must be rejected."""
        f = _make_file(b"", "empty.png")
        with self.assertRaises(ValueError):
            validate_image_file(f)

    def test_pdf_rejected(self):
        """PDF file must be rejected (not an image)."""
        pdf = b"%PDF-1.4" + b"\x00" * 100
        f = _make_file(pdf, "report.pdf")
        with self.assertRaises(ValueError):
            validate_image_file(f)


class ValidImageTests(TestCase):
    """validate_image_file must accept valid image formats."""

    def test_png_accepted(self):
        """Valid PNG header must pass magic byte check."""
        # Use a minimal valid 1x1 PNG
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (1, 1), "red").save(buf, format="PNG")
        buf.seek(0)
        # Should not raise
        validate_image_file(buf)

    def test_jpeg_accepted(self):
        """Valid JPEG must pass."""
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (1, 1), "blue").save(buf, format="JPEG")
        buf.seek(0)
        validate_image_file(buf)

    def test_gif_accepted(self):
        """Valid GIF must pass."""
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (1, 1), "green").save(buf, format="GIF")
        buf.seek(0)
        validate_image_file(buf)

    def test_webp_accepted(self):
        """Valid WebP must pass."""
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (1, 1), "white").save(buf, format="WEBP")
        buf.seek(0)
        validate_image_file(buf)

    def test_bmp_accepted(self):
        """Valid BMP must pass."""
        from PIL import Image
        buf = io.BytesIO()
        Image.new("RGB", (1, 1), "black").save(buf, format="BMP")
        buf.seek(0)
        validate_image_file(buf)


class CorruptImageTests(TestCase):
    """validate_image_file must reject files with valid magic but corrupt data."""

    def test_truncated_png_rejected(self):
        """PNG header followed by garbage must be rejected by Pillow decode."""
        corrupt = b"\x89PNG\r\n\x1a\n" + b"\xff" * 50
        f = _make_file(corrupt, "corrupt.png")
        with self.assertRaises(ValueError):
            validate_image_file(f)

    def test_truncated_jpeg_rejected(self):
        """JPEG header followed by garbage must be rejected."""
        corrupt = b"\xff\xd8\xff\xe0" + b"\x00" * 20
        f = _make_file(corrupt, "corrupt.jpg")
        with self.assertRaises(ValueError):
            validate_image_file(f)


# ---------------------------------------------------------------------------
# Email domain format validation
# ---------------------------------------------------------------------------


class EmailDomainFormatTests(TestCase):
    """validate_email_domain must reject malformed domains."""

    def test_valid_domain_accepted(self):
        validate_email_domain("user@example.com")

    def test_subdomain_accepted(self):
        validate_email_domain("user@mail.example.com")

    def test_nested_subdomain_accepted(self):
        validate_email_domain("user@a.b.c.example.com")

    def test_hyphenated_domain_accepted(self):
        validate_email_domain("user@my-company.com")

    def test_any_domain_accepted(self):
        """On-prem: no domain restrictions — any valid domain is allowed."""
        for domain in ["bytescop.com", "palavi.tech", "customer.org"]:
            validate_email_domain(f"user@{domain}")

    def test_missing_at_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_domain("userexample.com")

    def test_missing_domain_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_domain("user@")

    def test_single_label_rejected(self):
        """Domain with no dot (e.g. 'localhost') is rejected."""
        with self.assertRaises(ValidationError):
            validate_email_domain("user@localhost")

    def test_domain_starting_with_hyphen_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_domain("user@-example.com")

    def test_domain_ending_with_hyphen_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_domain("user@example-.com")

    def test_domain_with_spaces_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_domain("user@exam ple.com")

    def test_empty_email_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_domain("")


# ---------------------------------------------------------------------------
# Email address format + TLD validation
# ---------------------------------------------------------------------------


class EmailAddressValidationTests(TestCase):
    """validate_email_address must check format and TLD."""

    def test_valid_email_accepted(self):
        validate_email_address("user@example.com")

    def test_valid_email_with_plus(self):
        validate_email_address("user+tag@gmail.com")

    def test_valid_email_subdomain(self):
        validate_email_address("user@mail.example.org")

    def test_fake_tld_rejected(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_email_address("user@example.notreal")
        self.assertIn("notreal", str(ctx.exception))

    def test_another_fake_tld_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_address("user@company.zzzzz")

    def test_missing_at_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_address("userexample.com")

    def test_missing_domain_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_address("user@")

    def test_missing_local_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_address("@example.com")

    def test_spaces_rejected(self):
        with self.assertRaises(ValidationError):
            validate_email_address("user @example.com")

    def test_case_insensitive_tld(self):
        """TLD check should be case-insensitive."""
        validate_email_address("user@example.COM")

    def test_io_tld_accepted(self):
        validate_email_address("admin@myapp.io")

    def test_dev_tld_accepted(self):
        validate_email_address("hello@mysite.dev")

    def test_xn_idn_tld_accepted(self):
        """Internationalized TLD (punycode) should be accepted."""
        validate_email_address("user@example.xn--p1ai")
