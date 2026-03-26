import logging
import re

from django.utils import timezone

from evidence.models import Attachment
from evidence.storage.factory import get_attachment_storage

logger = logging.getLogger(__name__)

ATTACHMENT_TOKEN_RE = re.compile(r'/api/attachments/([0-9a-fA-F-]{36})/content/?')


def extract_attachment_tokens(description_md: str):
    if not description_md:
        return set()
    return {m.group(1).lower() for m in ATTACHMENT_TOKEN_RE.finditer(description_md)}


class AttachmentReconcileService:

    def reconcile_for_finding(self, *, tenant, engagement, finding,
                              description_md: str, recommendation_md: str = ''):
        now = timezone.now()
        tokens_in_md = (
            extract_attachment_tokens(description_md)
            | extract_attachment_tokens(recommendation_md)
        )

        current_qs = Attachment.objects.filter(tenant=tenant, finding=finding)
        current_tokens = {str(a.id).lower() for a in current_qs}

        to_add = tokens_in_md - current_tokens
        to_remove = current_tokens - tokens_in_md

        if to_add:
            add_qs = Attachment.objects.filter(tenant=tenant, id__in=list(to_add))
            for att in add_qs:
                if att.engagement_id and att.engagement_id != engagement.id:
                    continue
                if att.finding_id and att.finding_id != finding.id:
                    continue
                att.engagement = engagement
                att.finding = finding
                att.status = 'active'
                att.last_seen_at = now
                att.save(update_fields=[
                    'engagement', 'finding', 'status', 'last_seen_at', 'updated_at',
                ])

        if to_remove:
            storage = get_attachment_storage()
            rem_qs = Attachment.objects.filter(
                tenant=tenant, finding=finding, id__in=list(to_remove),
            )
            for att in rem_qs:
                if att.storage_uri:
                    try:
                        storage.delete(att.storage_uri)
                    except Exception:
                        logger.warning(
                            'Failed to delete file for attachment %s: %s',
                            att.id, att.storage_uri, exc_info=True,
                        )
            rem_qs.delete()

        if tokens_in_md:
            Attachment.objects.filter(
                tenant=tenant, id__in=list(tokens_in_md), engagement=engagement,
            ).update(last_seen_at=now)

    def cleanup_for_finding(self, *, tenant, finding):
        attachments = Attachment.objects.filter(tenant=tenant, finding=finding)
        if not attachments.exists():
            return

        storage = get_attachment_storage()
        for att in attachments:
            if att.storage_uri:
                try:
                    storage.delete(att.storage_uri)
                except Exception:
                    logger.warning(
                        'Failed to delete file for attachment %s: %s',
                        att.id, att.storage_uri, exc_info=True,
                    )
        attachments.delete()
