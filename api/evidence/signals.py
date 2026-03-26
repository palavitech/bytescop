"""
post_delete signal for Attachment — safety net that deletes the physical
storage file whenever an Attachment record is removed (explicit delete,
CASCADE, queryset.delete(), etc.).
"""
import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from evidence.storage.factory import get_attachment_storage

logger = logging.getLogger("bytescop.evidence")


@receiver(post_delete, sender="evidence.Attachment")
def attachment_post_delete(sender, instance, **kwargs):
    """Delete the backing file from storage after the DB record is gone."""
    if not instance.storage_uri:
        return
    try:
        storage = get_attachment_storage()
        storage.delete(instance.storage_uri)
    except Exception:
        logger.warning(
            "Failed to delete file on post_delete for attachment %s: %s",
            instance.pk, instance.storage_uri, exc_info=True,
        )
