from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class DashboardLayout(TimeStampedModel):
    """Persists a user's customized dashboard widget layout."""

    tenant = models.ForeignKey(
        'tenancy.Tenant', on_delete=models.CASCADE, related_name='dashboard_layouts',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='dashboard_layouts',
    )
    view = models.CharField(max_length=20, default='default')
    widgets = models.JSONField(default=list)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'user', 'view'],
                name='unique_dashboard_layout',
            ),
        ]
        indexes = [
            models.Index(fields=['tenant', 'user']),
        ]

    def __str__(self):
        return f'DashboardLayout({self.user}, {self.view})'
