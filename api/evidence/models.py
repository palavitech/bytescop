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
    """A digital forensics evidence source (disk image, memory dump, etc.).

    Evidence files are typically too large to upload through the app
    (50 GB+ disk images, memory dumps, etc.). Instead the user stages
    them on a shared mount or storage bucket and registers the path here.
    """

    EVIDENCE_TYPES = [
        ('disk_image', 'Disk Image'),
        ('memory_dump', 'Memory Dump'),
        ('network_capture', 'Network Capture'),
        ('log_file', 'Log File'),
        ('mobile_extraction', 'Mobile Extraction'),
        ('other', 'Other'),
    ]

    ACQUISITION_METHODS = [
        ('live', 'Live Acquisition'),
        ('dead', 'Dead / Offline'),
        ('network_tap', 'Network Tap'),
        ('manual_export', 'Manual Export'),
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
    source_path = models.CharField(
        max_length=1024, blank=True, default='',
        help_text='File path or URI where the evidence is stored.',
    )
    description = models.TextField(blank=True, default='')
    acquisition_date = models.DateField(null=True, blank=True)
    acquisition_method = models.CharField(
        max_length=24, choices=ACQUISITION_METHODS, blank=True, default='',
    )
    acquisition_tool = models.CharField(
        max_length=255, blank=True, default='',
        help_text='Tool used for acquisition (e.g. FTK Imager, Volatility).',
    )
    source_device = models.CharField(
        max_length=255, blank=True, default='',
        help_text='Source device identifier (hostname, serial, asset tag).',
    )
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
