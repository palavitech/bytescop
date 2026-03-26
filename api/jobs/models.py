"""BackgroundJob model — PostgreSQL-backed background job tracking."""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class BackgroundJob(models.Model):
    """Tracks async background jobs (exports, purges, etc.)."""

    PENDING = 'PENDING'
    PROCESSING = 'PROCESSING'
    READY = 'READY'
    FAILED = 'FAILED'

    STATUS_CHOICES = [
        (PENDING, 'Pending'),
        (PROCESSING, 'Processing'),
        (READY, 'Ready'),
        (FAILED, 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.CASCADE,
        related_name='background_jobs',
    )
    job_type = models.CharField(max_length=50, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    params = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'job_type']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f'{self.job_type} ({self.status}) - {self.id}'
