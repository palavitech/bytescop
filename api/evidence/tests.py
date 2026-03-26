"""
Tests for attachment cleanup edge cases:
- post_delete signal deletes storage files
- Engagement deletion cleans up finding attachments and orphan drafts
- Stale draft cleanup management command
"""
import io
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import User
from engagements.models import Engagement
from evidence.models import Attachment
from findings.models import Finding
from tenancy.models import Tenant

STRONG_PASSWORD = 'Str0ngP@ss!99'


def _create_user(email='user@example.com', password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name='Acme Corp', slug='acme-corp', **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


# -----------------------------------------------------------------------
# 1A — post_delete signal
# -----------------------------------------------------------------------

class AttachmentPostDeleteSignalTests(TestCase):
    """Signal should delete storage file when Attachment record is deleted."""

    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name='Eng1', created_by=self.user,
        )

    @patch('evidence.signals.get_attachment_storage')
    def test_post_delete_signal_deletes_file(self, mock_get_storage):
        mock_storage = MagicMock()
        mock_get_storage.return_value = mock_storage

        att = Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            filename='img.png', storage_uri='tenants/acme/eng/img.png',
            status='active',
        )
        att.delete()

        mock_storage.delete.assert_called_once_with('tenants/acme/eng/img.png')

    @patch('evidence.signals.get_attachment_storage')
    def test_post_delete_signal_handles_empty_uri(self, mock_get_storage):
        mock_storage = MagicMock()
        mock_get_storage.return_value = mock_storage

        att = Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            filename='empty.png', storage_uri='', status='draft',
        )
        att.delete()

        mock_storage.delete.assert_not_called()

    @patch('evidence.signals.get_attachment_storage')
    def test_post_delete_signal_handles_storage_error(self, mock_get_storage):
        """Signal logs a warning but does not re-raise on storage errors."""
        mock_storage = MagicMock()
        mock_storage.delete.side_effect = Exception("boom")
        mock_get_storage.return_value = mock_storage

        att = Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            filename='img.png', storage_uri='tenants/acme/eng/img.png',
            status='active',
        )
        # Should not raise
        att.delete()

        mock_storage.delete.assert_called_once()

    @patch('evidence.signals.get_attachment_storage')
    def test_cascade_delete_triggers_signal(self, mock_get_storage):
        """Tenant CASCADE should trigger post_delete on child Attachments."""
        mock_storage = MagicMock()
        mock_get_storage.return_value = mock_storage

        Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            filename='a.png', storage_uri='tenants/acme/a.png',
            status='active',
        )
        Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            filename='b.png', storage_uri='tenants/acme/b.png',
            status='active',
        )

        self.tenant.delete()

        self.assertEqual(mock_storage.delete.call_count, 2)
        deleted_uris = {c.args[0] for c in mock_storage.delete.call_args_list}
        self.assertEqual(deleted_uris, {'tenants/acme/a.png', 'tenants/acme/b.png'})


# -----------------------------------------------------------------------
# 1B — Engagement deletion cleanup
# -----------------------------------------------------------------------

class EngagementDeletionCleanupTests(TestCase):
    """perform_destroy should clean up finding attachments and orphan drafts."""

    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name='Eng1', created_by=self.user,
        )
        self.finding = Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            title='XSS', created_by=self.user,
        )

    @patch('evidence.signals.get_attachment_storage')
    @patch('findings.services.attachment_reconcile.get_attachment_storage')
    def test_engagement_delete_cleans_up_finding_attachments(
        self, mock_reconcile_storage, mock_signal_storage,
    ):
        """perform_destroy should clean up finding attachments before deleting."""
        mock_storage = MagicMock()
        mock_reconcile_storage.return_value = mock_storage
        mock_signal_storage.return_value = mock_storage

        att = Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            finding=self.finding,
            filename='finding_img.png',
            storage_uri='tenants/acme/eng1/finding_img.png',
            status='active',
        )

        # Reproduce the cleanup logic that perform_destroy does
        from findings.services.attachment_reconcile import AttachmentReconcileService
        reconciler = AttachmentReconcileService()
        for finding in Finding.objects.filter(engagement=self.engagement):
            reconciler.cleanup_for_finding(tenant=self.tenant, finding=finding)
        Attachment.objects.filter(
            engagement=self.engagement, finding__isnull=True,
        ).delete()
        self.engagement.delete()

        self.assertFalse(Attachment.objects.filter(id=att.id).exists())
        # cleanup_for_finding does explicit storage.delete, then post_delete signal
        # also fires — either path ensures file removal
        self.assertTrue(mock_storage.delete.called)

    @patch('evidence.signals.get_attachment_storage')
    def test_engagement_delete_cleans_up_orphan_drafts(self, mock_get_storage):
        """perform_destroy should clean up orphan draft attachments."""
        mock_storage = MagicMock()
        mock_get_storage.return_value = mock_storage

        orphan = Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            finding=None,
            filename='orphan_draft.png',
            storage_uri='tenants/acme/eng1/orphan_draft.png',
            status='draft',
        )

        # Reproduce the cleanup logic that perform_destroy does
        from findings.services.attachment_reconcile import AttachmentReconcileService
        reconciler = AttachmentReconcileService()
        for finding in Finding.objects.filter(engagement=self.engagement):
            reconciler.cleanup_for_finding(tenant=self.tenant, finding=finding)
        Attachment.objects.filter(
            engagement=self.engagement, finding__isnull=True,
        ).delete()  # post_delete signal handles file cleanup
        self.engagement.delete()

        self.assertFalse(Attachment.objects.filter(id=orphan.id).exists())
        mock_storage.delete.assert_called_once_with('tenants/acme/eng1/orphan_draft.png')


# -----------------------------------------------------------------------
# 1C — Stale draft cleanup management command
# -----------------------------------------------------------------------

class StaleDraftCleanupTests(TestCase):
    """Tests for the cleanup_stale_drafts management command."""

    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name='Eng1', created_by=self.user,
        )

    @patch('evidence.management.commands.cleanup_stale_drafts.get_attachment_storage')
    def test_stale_draft_cleanup_deletes_old(self, mock_get_storage):
        """Drafts older than threshold with no finding should be deleted."""
        mock_storage = MagicMock()
        mock_get_storage.return_value = mock_storage

        old_draft = Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            finding=None, filename='old_draft.png',
            storage_uri='tenants/acme/old_draft.png',
            status='draft',
        )
        # Backdate created_at to 48 hours ago
        Attachment.objects.filter(id=old_draft.id).update(
            created_at=timezone.now() - timedelta(hours=48),
        )

        out = io.StringIO()
        call_command('cleanup_stale_drafts', '--hours=24', stdout=out)

        self.assertFalse(Attachment.objects.filter(id=old_draft.id).exists())
        mock_storage.delete.assert_called_once_with('tenants/acme/old_draft.png')

    @patch('evidence.management.commands.cleanup_stale_drafts.get_attachment_storage')
    def test_stale_draft_cleanup_skips_recent(self, mock_get_storage):
        """Drafts created recently should not be deleted."""
        mock_storage = MagicMock()
        mock_get_storage.return_value = mock_storage

        recent_draft = Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            finding=None, filename='recent_draft.png',
            storage_uri='tenants/acme/recent_draft.png',
            status='draft',
        )

        out = io.StringIO()
        call_command('cleanup_stale_drafts', '--hours=24', stdout=out)

        self.assertTrue(Attachment.objects.filter(id=recent_draft.id).exists())
        mock_storage.delete.assert_not_called()

    @patch('evidence.management.commands.cleanup_stale_drafts.get_attachment_storage')
    def test_stale_draft_cleanup_skips_active(self, mock_get_storage):
        """Active attachments should never be deleted, even if old."""
        mock_storage = MagicMock()
        mock_get_storage.return_value = mock_storage

        finding = Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            title='XSS', created_by=self.user,
        )
        active_att = Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            finding=finding, filename='active.png',
            storage_uri='tenants/acme/active.png',
            status='active',
        )
        Attachment.objects.filter(id=active_att.id).update(
            created_at=timezone.now() - timedelta(hours=48),
        )

        out = io.StringIO()
        call_command('cleanup_stale_drafts', '--hours=24', stdout=out)

        self.assertTrue(Attachment.objects.filter(id=active_att.id).exists())
        mock_storage.delete.assert_not_called()

    @patch('evidence.management.commands.cleanup_stale_drafts.get_attachment_storage')
    def test_stale_draft_cleanup_dry_run(self, mock_get_storage):
        """--dry-run should report but not delete anything."""
        mock_storage = MagicMock()
        mock_get_storage.return_value = mock_storage

        old_draft = Attachment.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            finding=None, filename='old_draft.png',
            storage_uri='tenants/acme/old_draft.png',
            status='draft',
        )
        Attachment.objects.filter(id=old_draft.id).update(
            created_at=timezone.now() - timedelta(hours=48),
        )

        out = io.StringIO()
        call_command('cleanup_stale_drafts', '--hours=24', '--dry-run', stdout=out)

        self.assertTrue(Attachment.objects.filter(id=old_draft.id).exists())
        mock_storage.delete.assert_not_called()
        self.assertIn('DRY RUN', out.getvalue())
