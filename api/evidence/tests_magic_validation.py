"""
Tests for magic-byte validation in evidence upload service (security H5).

Verifies that AttachmentUploadService rejects non-image files
even when Content-Type header claims image/*.
"""
from unittest.mock import MagicMock

from django.test import TestCase

from accounts.models import User
from engagements.models import Engagement
from evidence.services.attachment_upload import AttachmentUploadService
from rest_framework import serializers
from tenancy.models import Tenant

STRONG_PASSWORD = 'Str0ngP@ss!99'


def _make_upload(name='test.png', content=b'\x89PNG\r\n\x1a\n' + b'\x00' * 100,
                 content_type='image/png'):
    mock = MagicMock()
    mock.name = name
    mock.content_type = content_type
    mock.size = len(content)
    mock.chunks.return_value = [content]
    mock.read.return_value = content
    mock.file = MagicMock()
    mock.file.seek = MagicMock()
    mock.seek = MagicMock()
    return mock


class EvidenceUploadMagicValidationTests(TestCase):
    """AttachmentUploadService must validate file content, not just Content-Type."""

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', slug='acme')
        self.user = User.objects.create_user(email='u@example.com', password=STRONG_PASSWORD)
        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name='Eng1', created_by=self.user,
        )
        self.service = AttachmentUploadService()
        self.mock_storage = MagicMock()
        self.mock_storage.save.return_value = '/fake/path'
        self.service.storage = self.mock_storage

    def test_html_with_image_content_type_rejected(self):
        """HTML file claiming to be image/png must be rejected."""
        html = b"<html><script>alert('xss')</script></html>"
        upload = _make_upload(name='evil.png', content=html, content_type='image/png')
        with self.assertRaises(serializers.ValidationError) as ctx:
            self.service.upload_image(
                tenant=self.tenant, tenant_id='acme',
                engagement=self.engagement, user=self.user, file_obj=upload,
            )
        self.assertIn('image', str(ctx.exception.detail).lower())

    def test_svg_with_image_content_type_rejected(self):
        """SVG file claiming to be image/svg+xml must be rejected."""
        svg = b'<?xml version="1.0"?><svg><script>alert(1)</script></svg>'
        upload = _make_upload(name='evil.svg', content=svg, content_type='image/svg+xml')
        with self.assertRaises(serializers.ValidationError):
            self.service.upload_image(
                tenant=self.tenant, tenant_id='acme',
                engagement=self.engagement, user=self.user, file_obj=upload,
            )

    def test_executable_with_image_content_type_rejected(self):
        """ELF binary claiming to be image/png must be rejected."""
        elf = b"\x7fELF" + b"\x00" * 200
        upload = _make_upload(name='malware.png', content=elf, content_type='image/png')
        with self.assertRaises(serializers.ValidationError):
            self.service.upload_image(
                tenant=self.tenant, tenant_id='acme',
                engagement=self.engagement, user=self.user, file_obj=upload,
            )
