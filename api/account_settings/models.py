from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class AccountSetting(TimeStampedModel):
    """Tenant-scoped key-value setting override.

    Only stores overrides — defaults come from DEFINITION_MAP.
    """

    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.CASCADE,
        related_name='settings',
    )
    key = models.CharField(max_length=100)
    value = models.TextField(blank=True, default='')
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )

    class Meta:
        unique_together = [('tenant', 'key')]
        ordering = ['key']

    def __str__(self):
        return f'{self.key}={self.value}'
