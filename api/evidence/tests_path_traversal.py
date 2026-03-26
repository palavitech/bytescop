"""
Tests for path traversal protection in attachment uploads (security H4).

Tests cover:
- Filename sanitization in AttachmentUploadService
- realpath guard in LocalAttachmentStorage.save()
"""
import os
import tempfile
from unittest.mock import MagicMock, patch

from django.test import TestCase

from accounts.models import User
from engagements.models import Engagement
from evidence.services.attachment_upload import AttachmentUploadService
from evidence.storage.local import LocalAttachmentStorage
from tenancy.models import Tenant

STRONG_PASSWORD = 'Str0ngP@ss!99'


def _make_upload(name='test.png', content=b'\x89PNG\r\n\x1a\n' + b'\x00' * 100,
                 content_type='image/png'):
    """Create a mock uploaded file."""
    mock = MagicMock()
    mock.name = name
    mock.content_type = content_type
    mock.size = len(content)
    mock.chunks.return_value = [content]
    mock.file = MagicMock()
    mock.file.seek = MagicMock()
    return mock


@patch('evidence.services.attachment_upload.validate_image_file')
class FilenameTraversalUploadTests(TestCase):
    """AttachmentUploadService must sanitize filenames to prevent path traversal."""

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Acme', slug='acme')
        self.user = User.objects.create_user(email='u@example.com', password=STRONG_PASSWORD)
        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name='Eng1', created_by=self.user,
        )
        self.service = AttachmentUploadService()
        # Replace storage with a mock to isolate filename testing
        self.mock_storage = MagicMock()
        self.mock_storage.save.return_value = '/fake/path'
        self.service.storage = self.mock_storage

    def test_traversal_filename_stripped(self, _mock_validate):
        """Filename like '../../../etc/passwd' must be reduced to 'passwd'."""
        upload = _make_upload(name='../../../etc/passwd')
        att = self.service.upload_image(
            tenant=self.tenant, tenant_id='acme',
            engagement=self.engagement, user=self.user, file_obj=upload,
        )
        call_kwargs = self.mock_storage.save.call_args[1]
        self.assertEqual(call_kwargs['filename'], 'passwd')
        self.assertEqual(att.filename, 'passwd')

    def test_backslash_traversal_stripped(self, _mock_validate):
        """Windows-style path separators must also be sanitized."""
        upload = _make_upload(name='..\\..\\..\\windows\\system32\\evil.png')
        self.service.upload_image(
            tenant=self.tenant, tenant_id='acme',
            engagement=self.engagement, user=self.user, file_obj=upload,
        )
        call_kwargs = self.mock_storage.save.call_args[1]
        self.assertNotIn('..', call_kwargs['filename'])
        self.assertNotIn('/', call_kwargs['filename'])
        self.assertNotIn('\\', call_kwargs['filename'])

    def test_dotfile_filename_rejected(self, _mock_validate):
        """Filenames starting with '.' should be replaced with a safe default."""
        upload = _make_upload(name='.htaccess')
        self.service.upload_image(
            tenant=self.tenant, tenant_id='acme',
            engagement=self.engagement, user=self.user, file_obj=upload,
        )
        call_kwargs = self.mock_storage.save.call_args[1]
        self.assertFalse(call_kwargs['filename'].startswith('.'))

    def test_empty_after_sanitization_gets_default(self, _mock_validate):
        """Filename that resolves to empty after sanitization gets safe default."""
        upload = _make_upload(name='../../..')
        self.service.upload_image(
            tenant=self.tenant, tenant_id='acme',
            engagement=self.engagement, user=self.user, file_obj=upload,
        )
        call_kwargs = self.mock_storage.save.call_args[1]
        self.assertTrue(len(call_kwargs['filename']) > 0)
        self.assertNotIn('..', call_kwargs['filename'])

    def test_normal_filename_unchanged(self, _mock_validate):
        """Normal filenames like 'screenshot.png' should pass through unchanged."""
        upload = _make_upload(name='screenshot.png')
        self.service.upload_image(
            tenant=self.tenant, tenant_id='acme',
            engagement=self.engagement, user=self.user, file_obj=upload,
        )
        call_kwargs = self.mock_storage.save.call_args[1]
        self.assertEqual(call_kwargs['filename'], 'screenshot.png')


class LocalStorageRealpathGuardTests(TestCase):
    """LocalAttachmentStorage.save() must reject paths that escape MEDIA_ROOT."""

    def test_deep_traversal_blocked(self):
        """A filename with enough ../ to escape MEDIA_ROOT must be blocked."""
        with tempfile.TemporaryDirectory() as tmpdir:
            with self.settings(MEDIA_ROOT=tmpdir, DEBUG=True):
                storage = LocalAttachmentStorage()
                # 8 levels of ../ to guarantee escaping the 6-level deep path
                malicious = '../../../../../../../../tmp/evil.txt'
                upload = _make_upload(name=malicious)

                # After fix: should either sanitize the filename or raise an error
                # Before fix: the file would be written outside MEDIA_ROOT
                try:
                    saved_path = storage.save(
                        tenant_id='acme',
                        engagement_id='eng-123',
                        token='tok-456',
                        file_obj=upload,
                        filename=malicious,
                        content_type='image/png',
                    )
                    # If save() succeeded, the file must be under MEDIA_ROOT
                    resolved = os.path.realpath(saved_path)
                    media_resolved = os.path.realpath(tmpdir)
                    self.assertTrue(
                        resolved.startswith(media_resolved + os.sep),
                        f"File saved outside MEDIA_ROOT: {resolved}",
                    )
                except (ValueError, PermissionError):
                    # Also acceptable — raising on traversal attempt
                    pass

    def test_normal_filename_works(self):
        """Normal filenames should save successfully under MEDIA_ROOT."""
        with tempfile.TemporaryDirectory() as tmpdir:
            with self.settings(MEDIA_ROOT=tmpdir, DEBUG=True):
                storage = LocalAttachmentStorage()
                upload = _make_upload(name='screenshot.png')

                saved_path = storage.save(
                    tenant_id='acme',
                    engagement_id='eng-123',
                    token='tok-456',
                    file_obj=upload,
                    filename='screenshot.png',
                    content_type='image/png',
                )
                self.assertTrue(os.path.exists(saved_path))
                resolved = os.path.realpath(saved_path)
                media_resolved = os.path.realpath(tmpdir)
                self.assertTrue(resolved.startswith(media_resolved + os.sep))
