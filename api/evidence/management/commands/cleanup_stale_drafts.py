"""
Management command to delete stale draft attachments.

Draft attachments are created when a user uploads an image while editing a
finding but never saves the finding (or removes the image before saving).
This command removes drafts older than a configurable threshold that are
not linked to any finding.

Usage:
    python manage.py cleanup_stale_drafts               # default: 24 hours
    python manage.py cleanup_stale_drafts --hours=48
    python manage.py cleanup_stale_drafts --dry-run
"""
import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from evidence.models import Attachment
from evidence.storage.factory import get_attachment_storage

logger = logging.getLogger("bytescop.evidence")


class Command(BaseCommand):
    help = "Delete stale draft attachments older than --hours (default 24)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours", type=int, default=24,
            help="Age threshold in hours (default: 24)",
        )
        parser.add_argument(
            "--dry-run", action="store_true", default=False,
            help="Report stale drafts without deleting",
        )

    def handle(self, *args, **options):
        hours = options["hours"]
        dry_run = options["dry_run"]
        cutoff = timezone.now() - timedelta(hours=hours)

        stale_qs = Attachment.objects.filter(
            status="draft",
            finding__isnull=True,
            created_at__lt=cutoff,
        )

        count = stale_qs.count()

        if dry_run:
            self.stdout.write(f"DRY RUN: {count} stale draft(s) older than {hours}h")
            for att in stale_qs[:50]:
                self.stdout.write(f"  {att.id} — {att.filename} — {att.storage_uri}")
            return

        if count == 0:
            self.stdout.write("No stale drafts found.")
            return

        storage = get_attachment_storage()
        deleted = 0
        for att in stale_qs.iterator():
            if att.storage_uri:
                try:
                    storage.delete(att.storage_uri)
                except Exception:
                    logger.warning(
                        "Failed to delete file for stale draft %s: %s",
                        att.id, att.storage_uri, exc_info=True,
                    )
            att.delete()
            deleted += 1

        self.stdout.write(f"Deleted {deleted} stale draft(s) older than {hours}h.")
        logger.info("cleanup_stale_drafts: deleted %d drafts older than %dh", deleted, hours)
