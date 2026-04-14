"""
Tests for evidence service modules:
- SampleUploadService (sample_upload.py)
- AttachmentUploadService error paths (attachment_upload.py)
"""
import os
from unittest.mock import patch, MagicMock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework import serializers

from accounts.models import User
from clients.models import Client
from engagements.models import Engagement
from evidence.models import MalwareSample, Attachment
from evidence.services.sample_upload import (
    MalwareSampleUploadService,
    _neutralize_filename,
    SAFE_SUFFIX,
)
from evidence.services.attachment_upload import AttachmentUploadService
from tenancy.models import Tenant

# Valid 1x1 red PNG (for image upload tests)
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01"
    b"\x01\x00\xc9\xfe\x92\xef\x00\x00\x00\x00IEND\xaeB`\x82"
)


# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------

def _setup_tenant_and_engagement():
    tenant = Tenant.objects.create(name="TestTenant", slug="test-tenant", status="ACTIVE")
    user = User.objects.create_user(email="svc@test.example.com", password="Pass1234!")
    client_obj = Client.objects.create(tenant=tenant, name="Client", status="ACTIVE")
    eng = Engagement.objects.create(
        tenant=tenant, name="Eng", client=client_obj,
        created_by=user, status="ACTIVE",
    )
    return tenant, user, eng


# -----------------------------------------------------------------------
# _neutralize_filename
# -----------------------------------------------------------------------

class NeutralizeFilenameTests(TestCase):
    """Tests for the _neutralize_filename helper."""

    def test_normal_filename(self):
        self.assertEqual(_neutralize_filename("malware.exe"), "malware.exe.sample")

    def test_empty_filename(self):
        self.assertEqual(_neutralize_filename(""), f"unknown{SAFE_SUFFIX}")

    def test_none_filename(self):
        # None is falsy so treated like empty
        self.assertEqual(_neutralize_filename(None), f"unknown{SAFE_SUFFIX}")

    def test_filename_with_dot(self):
        self.assertEqual(_neutralize_filename("test.tar.gz"), "test.tar.gz.sample")

    def test_filename_no_extension(self):
        self.assertEqual(_neutralize_filename("malware"), "malware.sample")


# -----------------------------------------------------------------------
# SampleUploadService
# -----------------------------------------------------------------------

@override_settings(BC_STORAGE_BACKEND="local", BC_MAX_SAMPLE_BYTES=1024 * 1024)
class SampleUploadServiceTests(TestCase):
    """Tests for MalwareSampleUploadService.upload_sample()."""

    def setUp(self):
        self.tenant, self.user, self.eng = _setup_tenant_and_engagement()

    @patch.object(MalwareSampleUploadService, '_set_readonly')
    @patch.object(MalwareSampleUploadService, '_save_sample', return_value='/tmp/fake/path')
    def test_upload_valid_file(self, mock_save, mock_readonly):
        """A valid file upload creates a MalwareSample record."""
        file_obj = SimpleUploadedFile("trojan.exe", b"\x00" * 100, content_type="application/x-msdownload")
        svc = MalwareSampleUploadService()
        sample = svc.upload_sample(
            tenant=self.tenant,
            tenant_id=str(self.tenant.id),
            engagement=self.eng,
            user=self.user,
            file_obj=file_obj,
            notes="Test sample",
        )
        self.assertIsInstance(sample, MalwareSample)
        self.assertEqual(sample.original_filename, "trojan.exe")
        self.assertEqual(sample.safe_filename, "trojan.exe.sample")
        self.assertEqual(sample.content_type, "application/x-msdownload")
        self.assertEqual(sample.notes, "Test sample")
        self.assertEqual(sample.uploaded_by, self.user)
        self.assertEqual(sample.tenant, self.tenant)
        self.assertEqual(sample.engagement, self.eng)
        self.assertTrue(sample.sha256)  # should have computed a hash
        self.assertEqual(sample.storage_uri, '/tmp/fake/path')
        mock_save.assert_called_once()
        mock_readonly.assert_called_once_with('/tmp/fake/path')

    def test_upload_missing_file_raises(self):
        svc = MalwareSampleUploadService()
        with self.assertRaises(serializers.ValidationError) as ctx:
            svc.upload_sample(
                tenant=self.tenant,
                tenant_id=str(self.tenant.id),
                engagement=self.eng,
                user=self.user,
                file_obj=None,
            )
        self.assertIn('file', str(ctx.exception.detail))

    @override_settings(BC_MAX_SAMPLE_BYTES=50)
    @patch.object(MalwareSampleUploadService, '_save_sample')
    def test_upload_oversized_file_raises(self, mock_save):
        file_obj = SimpleUploadedFile("big.bin", b"\x00" * 100, content_type="application/octet-stream")
        svc = MalwareSampleUploadService()
        with self.assertRaises(serializers.ValidationError) as ctx:
            svc.upload_sample(
                tenant=self.tenant,
                tenant_id=str(self.tenant.id),
                engagement=self.eng,
                user=self.user,
                file_obj=file_obj,
            )
        self.assertIn('file', str(ctx.exception.detail))
        mock_save.assert_not_called()

    @patch.object(MalwareSampleUploadService, '_set_readonly')
    @patch.object(MalwareSampleUploadService, '_save_sample', return_value='/tmp/fake/path')
    def test_upload_sanitizes_path_components(self, mock_save, mock_readonly):
        """Backslash/path separators in filenames are stripped."""
        file_obj = SimpleUploadedFile(
            "C:\\Users\\hacker\\malware.exe", b"\x00" * 10,
            content_type="application/octet-stream",
        )
        svc = MalwareSampleUploadService()
        sample = svc.upload_sample(
            tenant=self.tenant,
            tenant_id=str(self.tenant.id),
            engagement=self.eng,
            user=self.user,
            file_obj=file_obj,
        )
        self.assertEqual(sample.original_filename, "malware.exe")
        self.assertEqual(sample.safe_filename, "malware.exe.sample")

    @patch.object(MalwareSampleUploadService, '_set_readonly')
    @patch.object(MalwareSampleUploadService, '_save_sample', return_value='/tmp/fake/path')
    def test_upload_dotfile_sanitized(self, mock_save, mock_readonly):
        """Filenames starting with a dot are replaced with upload.bin."""
        file_obj = SimpleUploadedFile(".hidden", b"\x00" * 10, content_type="application/octet-stream")
        svc = MalwareSampleUploadService()
        sample = svc.upload_sample(
            tenant=self.tenant,
            tenant_id=str(self.tenant.id),
            engagement=self.eng,
            user=self.user,
            file_obj=file_obj,
        )
        self.assertEqual(sample.original_filename, "upload.bin")

    @patch.object(MalwareSampleUploadService, '_set_readonly')
    @patch.object(MalwareSampleUploadService, '_save_sample', return_value='/tmp/fake/path')
    def test_upload_unauthenticated_user(self, mock_save, mock_readonly):
        """Anonymous user should set uploaded_by to None."""
        anon_user = MagicMock()
        anon_user.is_authenticated = False
        file_obj = SimpleUploadedFile("test.bin", b"\x00" * 10, content_type="application/octet-stream")
        svc = MalwareSampleUploadService()
        sample = svc.upload_sample(
            tenant=self.tenant,
            tenant_id=str(self.tenant.id),
            engagement=self.eng,
            user=anon_user,
            file_obj=file_obj,
        )
        self.assertIsNone(sample.uploaded_by)

    @patch.object(MalwareSampleUploadService, '_set_readonly')
    @patch.object(MalwareSampleUploadService, '_save_sample', return_value='/tmp/fake/path')
    def test_upload_sha256_failure_handled(self, mock_save, mock_readonly):
        """If SHA256 computation fails, upload still succeeds with empty hash."""
        file_obj = MagicMock()
        file_obj.size = 10
        file_obj.content_type = 'application/octet-stream'
        file_obj.name = 'test.bin'
        file_obj.chunks.side_effect = Exception("chunk error")

        svc = MalwareSampleUploadService()
        sample = svc.upload_sample(
            tenant=self.tenant,
            tenant_id=str(self.tenant.id),
            engagement=self.eng,
            user=self.user,
            file_obj=file_obj,
        )
        # SHA256 should remain at default empty since chunks() raised
        self.assertEqual(sample.sha256, '')

    @patch.object(MalwareSampleUploadService, '_set_readonly')
    @patch.object(MalwareSampleUploadService, '_save_sample', return_value='/tmp/fake/path')
    def test_upload_seek_failure_handled(self, mock_save, mock_readonly):
        """If seek fails after hashing, upload still succeeds."""
        file_obj = SimpleUploadedFile("test.bin", b"\x00" * 10, content_type="application/octet-stream")
        # Make the internal file's seek raise
        inner_file = MagicMock()
        inner_file.seek.side_effect = Exception("seek error")
        file_obj.file = inner_file
        # But chunks must work for hashing
        original_chunks = SimpleUploadedFile("x", b"\x00" * 10).chunks
        file_obj.chunks = lambda chunk_size=None: iter([b"\x00" * 10])

        svc = MalwareSampleUploadService()
        sample = svc.upload_sample(
            tenant=self.tenant,
            tenant_id=str(self.tenant.id),
            engagement=self.eng,
            user=self.user,
            file_obj=file_obj,
        )
        self.assertIsNotNone(sample.id)


@override_settings(BC_STORAGE_BACKEND="local")
class SampleSaveAndReadonlyTests(TestCase):
    """Tests for _save_sample and _set_readonly methods."""

    def setUp(self):
        self.tenant, self.user, self.eng = _setup_tenant_and_engagement()

    @override_settings(MEDIA_ROOT='/tmp/bytescop_test_media')
    def test_save_sample_creates_file(self):
        """_save_sample should write the file to disk."""
        import shutil
        media_root = '/tmp/bytescop_test_media'
        try:
            file_obj = SimpleUploadedFile("test.bin", b"malware_content", content_type="application/octet-stream")
            svc = MalwareSampleUploadService()
            path = svc._save_sample(
                tenant_id=str(self.tenant.id),
                engagement_id=str(self.eng.id),
                token="test-token",
                file_obj=file_obj,
                safe_filename="test.bin.sample",
            )
            self.assertTrue(os.path.isfile(path))
            with open(path, 'rb') as f:
                self.assertEqual(f.read(), b"malware_content")
        finally:
            shutil.rmtree(media_root, ignore_errors=True)

    @override_settings(MEDIA_ROOT='/tmp/bytescop_test_media')
    def test_set_readonly_sets_permissions(self):
        """_set_readonly should set the file to 0o444 (read-only)."""
        import shutil
        import stat
        media_root = '/tmp/bytescop_test_media'
        try:
            os.makedirs(media_root, exist_ok=True)
            test_file = os.path.join(media_root, 'readonly_test.bin')
            with open(test_file, 'wb') as f:
                f.write(b"content")

            MalwareSampleUploadService._set_readonly(test_file)

            mode = os.stat(test_file).st_mode
            expected = stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH  # 0o444
            self.assertEqual(mode & 0o777, expected)
        finally:
            # Need write perms to clean up
            if os.path.exists(test_file):
                os.chmod(test_file, 0o644)
            shutil.rmtree(media_root, ignore_errors=True)

    def test_set_readonly_handles_oserror(self):
        """_set_readonly on a non-existent path should not raise."""
        # Should not raise - just logs a warning
        MalwareSampleUploadService._set_readonly('/tmp/nonexistent_file_that_does_not_exist')


# -----------------------------------------------------------------------
# AttachmentUploadService error paths
# -----------------------------------------------------------------------

@override_settings(BC_STORAGE_BACKEND="local")
class AttachmentUploadServiceErrorTests(TestCase):
    """Tests for error paths in AttachmentUploadService.upload_image()."""

    def setUp(self):
        self.tenant, self.user, self.eng = _setup_tenant_and_engagement()

    def test_missing_file_raises(self):
        svc = AttachmentUploadService()
        with self.assertRaises(serializers.ValidationError) as ctx:
            svc.upload_image(
                tenant=self.tenant,
                tenant_id=str(self.tenant.id),
                engagement=self.eng,
                user=self.user,
                file_obj=None,
            )
        self.assertIn('file', str(ctx.exception.detail))

    def test_non_image_content_type_raises(self):
        """Files with non-image content types should be rejected."""
        file_obj = SimpleUploadedFile("doc.pdf", b"%PDF-1.4...", content_type="application/pdf")
        svc = AttachmentUploadService()
        with self.assertRaises(serializers.ValidationError) as ctx:
            svc.upload_image(
                tenant=self.tenant,
                tenant_id=str(self.tenant.id),
                engagement=self.eng,
                user=self.user,
                file_obj=file_obj,
            )
        self.assertIn('Only image uploads', str(ctx.exception.detail))

    @override_settings(BC_MAX_UPLOAD_BYTES=10)
    def test_oversized_image_raises(self):
        """Images exceeding BC_MAX_UPLOAD_BYTES should be rejected."""
        file_obj = SimpleUploadedFile("big.png", TINY_PNG, content_type="image/png")
        svc = AttachmentUploadService()
        with self.assertRaises(serializers.ValidationError) as ctx:
            svc.upload_image(
                tenant=self.tenant,
                tenant_id=str(self.tenant.id),
                engagement=self.eng,
                user=self.user,
                file_obj=file_obj,
            )
        self.assertIn('max size', str(ctx.exception.detail))

    def test_invalid_image_content_raises(self):
        """A file claiming to be an image but with bad content should be rejected."""
        file_obj = SimpleUploadedFile("fake.png", b"not an image at all", content_type="image/png")
        svc = AttachmentUploadService()
        with self.assertRaises(serializers.ValidationError) as ctx:
            svc.upload_image(
                tenant=self.tenant,
                tenant_id=str(self.tenant.id),
                engagement=self.eng,
                user=self.user,
                file_obj=file_obj,
            )
        # Should fail magic byte or Pillow validation
        self.assertIn('file', str(ctx.exception.detail))

    @override_settings(BC_STORAGE_BACKEND="local", MEDIA_ROOT='/tmp/bytescop_test_att_media')
    def test_upload_unauthenticated_user(self):
        """Anonymous user should set uploaded_by to None."""
        import shutil
        try:
            anon_user = MagicMock()
            anon_user.is_authenticated = False
            file_obj = SimpleUploadedFile("img.png", TINY_PNG, content_type="image/png")
            svc = AttachmentUploadService()
            att = svc.upload_image(
                tenant=self.tenant,
                tenant_id=str(self.tenant.id),
                engagement=self.eng,
                user=anon_user,
                file_obj=file_obj,
            )
            self.assertIsNone(att.uploaded_by)
            self.assertEqual(att.status, 'draft')
        finally:
            shutil.rmtree('/tmp/bytescop_test_att_media', ignore_errors=True)

    @override_settings(BC_STORAGE_BACKEND="local", MEDIA_ROOT='/tmp/bytescop_test_att_media2')
    def test_sha256_failure_handled(self):
        """If SHA256 computation fails, upload should still succeed."""
        import shutil
        try:
            file_obj = MagicMock()
            file_obj.size = 10
            file_obj.content_type = 'image/png'
            file_obj.name = 'img.png'
            # First call to chunks for sha256 - raise
            # Need to simulate: validate_image_file passes, then chunks fails
            # We'll patch validate_image_file to skip it
            with patch('evidence.services.attachment_upload.validate_image_file'):
                file_obj.chunks.side_effect = Exception("chunk error")
                file_obj.read = MagicMock(return_value=TINY_PNG[:16])
                file_obj.tell = MagicMock(return_value=0)
                file_obj.seek = MagicMock()

                svc = AttachmentUploadService()
                # This should handle the chunks() error gracefully for sha256
                # but will then fail on storage.save() which also calls chunks()
                # So we mock storage as well
                with patch.object(svc, 'storage') as mock_storage:
                    mock_storage.save.return_value = '/tmp/fake/path'
                    att = svc.upload_image(
                        tenant=self.tenant,
                        tenant_id=str(self.tenant.id),
                        engagement=self.eng,
                        user=self.user,
                        file_obj=file_obj,
                    )
                    self.assertEqual(att.sha256, '')
        finally:
            shutil.rmtree('/tmp/bytescop_test_att_media2', ignore_errors=True)

    @override_settings(BC_STORAGE_BACKEND="local", MEDIA_ROOT='/tmp/bytescop_test_att_media3')
    def test_seek_failure_handled(self):
        """If seek fails after hashing, upload should still succeed."""
        import shutil
        try:
            with patch('evidence.services.attachment_upload.validate_image_file'):
                file_obj = SimpleUploadedFile("img.png", TINY_PNG, content_type="image/png")
                # Replace the inner file with one whose seek raises
                inner = MagicMock()
                inner.seek.side_effect = Exception("seek error")
                file_obj.file = inner
                # But ensure chunks still work
                file_obj.chunks = lambda chunk_size=None: iter([TINY_PNG])

                svc = AttachmentUploadService()
                with patch.object(svc, 'storage') as mock_storage:
                    mock_storage.save.return_value = '/tmp/fake/path'
                    att = svc.upload_image(
                        tenant=self.tenant,
                        tenant_id=str(self.tenant.id),
                        engagement=self.eng,
                        user=self.user,
                        file_obj=file_obj,
                    )
                    self.assertIsNotNone(att.id)
        finally:
            shutil.rmtree('/tmp/bytescop_test_att_media3', ignore_errors=True)
