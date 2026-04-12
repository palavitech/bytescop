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


class MalwareSample(TimeStampedModel):
    """A malware sample uploaded for analysis.

    Files are stored with neutralized extensions (.sample suffix) and
    read-only permissions. They must NEVER be executed by the server.
    """

    tenant = models.ForeignKey(
        'tenancy.Tenant', on_delete=models.CASCADE, related_name='malware_samples',
    )
    engagement = models.ForeignKey(
        'engagements.Engagement', on_delete=models.CASCADE, related_name='malware_samples',
    )
    original_filename = models.CharField(max_length=255)
    safe_filename = models.CharField(max_length=260)
    sha256 = models.CharField(max_length=64, blank=True, default='')
    storage_uri = models.TextField(blank=True, default='')
    content_type = models.CharField(max_length=120, blank=True, default='')
    size_bytes = models.BigIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='samples_uploaded',
    )
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'engagement']),
            models.Index(fields=['tenant', 'sha256']),
        ]

    def __str__(self) -> str:
        return self.original_filename or str(self.id)


class EvidenceSource(TimeStampedModel):
    """A digital forensics evidence source (disk image, memory dump, etc.)."""

    EVIDENCE_TYPES = [
        ('disk_image', 'Disk Image'),
        ('memory_dump', 'Memory Dump'),
        ('network_capture', 'Network Capture'),
        ('log_file', 'Log File'),
        ('mobile_extraction', 'Mobile Extraction'),
        ('other', 'Other'),
    ]

    tenant = models.ForeignKey(
        'tenancy.Tenant', on_delete=models.CASCADE, related_name='evidence_sources',
    )
    engagement = models.ForeignKey(
        'engagements.Engagement', on_delete=models.CASCADE, related_name='evidence_sources',
    )
    name = models.CharField(max_length=255)
    evidence_type = models.CharField(
        max_length=24, choices=EVIDENCE_TYPES, default='other',
    )
    description = models.TextField(blank=True, default='')
    acquisition_date = models.DateField(null=True, blank=True)
    sha256 = models.CharField(max_length=64, blank=True, default='')
    size_bytes = models.BigIntegerField(default=0)
    chain_of_custody = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='evidence_sources_created',
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'engagement']),
        ]

    def __str__(self) -> str:
        return self.name or str(self.id)
