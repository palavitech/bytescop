from django.db import models

from core.models import TimeStampedModel


class ClientStatus(models.TextChoices):
    ACTIVE = 'active', 'Active'
    INACTIVE = 'inactive', 'Inactive'


class Client(TimeStampedModel):
    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.CASCADE,
        related_name='clients',
    )
    name = models.CharField(max_length=200)
    website = models.URLField(blank=True, default='')
    notes = models.TextField(blank=True, default='')
    status = models.CharField(
        max_length=20,
        choices=ClientStatus.choices,
        default=ClientStatus.ACTIVE,
    )

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['tenant', 'name']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self) -> str:
        return self.name
