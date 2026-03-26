from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


ATTACHMENT_STATUSES = [
    ('draft', 'Draft'),
    ('active', 'Active'),
    ('orphaned', 'Orphaned'),
]


class Attachment(TimeStampedModel):
    tenant = models.ForeignKey(
        'tenancy.Tenant', on_delete=models.CASCADE, related_name='attachments',
    )
    engagement = models.ForeignKey(
        'engagements.Engagement', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='attachments',
    )
    finding = models.ForeignKey(
        'findings.Finding', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='inline_attachments',
    )
    status = models.CharField(
        max_length=16, choices=ATTACHMENT_STATUSES, default='draft',
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='attachments_uploaded',
    )
    last_seen_at = models.DateTimeField(null=True, blank=True)

    filename = models.CharField(max_length=255, blank=True, default='')
    sha256 = models.CharField(max_length=64, blank=True, default='')
    storage_uri = models.TextField(blank=True, default='')
    content_type = models.CharField(max_length=120, blank=True, default='')
    size_bytes = models.BigIntegerField(default=0)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'sha256']),
            models.Index(fields=['tenant', '-created_at']),
        ]

    def __str__(self) -> str:
        return self.filename or self.sha256 or str(self.id)
