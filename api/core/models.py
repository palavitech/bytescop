import uuid
from django.db import models


class TimeStampedModel(models.Model):
    """Abstract base with UUID primary key and timestamps."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-created_at"]


from .rate_limit.models import RateLimitEntry  # noqa: E402, F401


class InstallState(models.Model):
    """Singleton row (id=1) tracking whether first-run setup is complete."""

    id = models.IntegerField(primary_key=True, default=1)
    installed = models.BooleanField(default=False)
    installed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Install State'

    def __str__(self):
        return f'InstallState(installed={self.installed})'

    def mark_installed(self):
        from django.utils import timezone
        self.installed = True
        self.installed_at = timezone.now()
        self.save()
