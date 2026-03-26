from django.db import models

from core.models import TimeStampedModel


class AssetType(models.TextChoices):
    HOST = 'host', 'Host'
    WEBAPP = 'webapp', 'WebApp'
    API = 'api', 'API'
    CLOUD = 'cloud', 'Cloud'
    NETWORK_DEVICE = 'network_device', 'Network Device'
    MOBILE_APP = 'mobile_app', 'Mobile App'
    OTHER = 'other', 'Other'


class AssetEnvironment(models.TextChoices):
    PROD = 'prod', 'Prod'
    STAGING = 'staging', 'Staging'
    DEV = 'dev', 'Dev'
    LAB = 'lab', 'Lab'


class AssetCriticality(models.TextChoices):
    LOW = 'low', 'Low'
    MEDIUM = 'medium', 'Medium'
    HIGH = 'high', 'High'


class Asset(TimeStampedModel):
    tenant = models.ForeignKey(
        'tenancy.Tenant',
        on_delete=models.CASCADE,
        related_name='assets',
    )
    client = models.ForeignKey(
        'clients.Client',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assets',
    )
    name = models.CharField(max_length=200)
    asset_type = models.CharField(
        max_length=32,
        choices=AssetType.choices,
        default=AssetType.HOST,
    )
    environment = models.CharField(
        max_length=20,
        choices=AssetEnvironment.choices,
        default=AssetEnvironment.PROD,
    )
    criticality = models.CharField(
        max_length=20,
        choices=AssetCriticality.choices,
        default=AssetCriticality.MEDIUM,
    )
    target = models.CharField(max_length=220, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    attributes = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'asset_type']),
            models.Index(fields=['tenant', 'client']),
            models.Index(fields=['tenant', '-created_at']),
        ]

    def __str__(self) -> str:
        return self.name
