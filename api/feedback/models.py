from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class FeatureRequestCategory(models.TextChoices):
    ENGAGEMENTS = 'engagements', 'Engagements'
    FINDINGS = 'findings', 'Findings'
    REPORTING = 'reporting', 'Reporting'
    ASSETS = 'assets', 'Assets'
    INTEGRATIONS = 'integrations', 'Integrations'
    OTHER = 'other', 'Other'


class FeatureRequest(TimeStampedModel):
    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.CASCADE,
        related_name='feature_requests',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='feature_requests',
    )
    category = models.CharField(max_length=20, choices=FeatureRequestCategory.choices)
    title = models.CharField(max_length=200)
    description = models.TextField(max_length=5000)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'created_at']),
        ]

    def __str__(self):
        return f'{self.category}: {self.title}'
