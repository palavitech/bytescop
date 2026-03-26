from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class TargetType(models.TextChoices):
    ENGAGEMENT = "engagement", "Engagement"
    FINDING = "finding", "Finding"


class Comment(TimeStampedModel):
    """Threaded comment attached to any target entity via target_type + target_id."""

    tenant = models.ForeignKey(
        "tenancy.Tenant",
        on_delete=models.CASCADE,
        related_name="comments",
    )
    target_type = models.CharField(max_length=20, choices=TargetType.choices)
    target_id = models.UUIDField()
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
    )
    body_md = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(
                fields=["tenant", "target_type", "target_id"],
                name="comment_tenant_target",
            ),
            models.Index(fields=["parent"], name="comment_parent"),
        ]

    def __str__(self):
        return f"Comment by {self.created_by_id} on {self.target_type}:{self.target_id}"
