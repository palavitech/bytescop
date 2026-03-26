from django.db import models


class RateLimitEntry(models.Model):
    """Tracks rate limit state per (scope, key) pair.

    One row per unique combination, updated in place. No cleanup needed —
    stale entries auto-reset on next check() when inactive > reset_after.
    """

    scope = models.CharField(max_length=64)
    key = models.CharField(max_length=255)
    attempt_count = models.PositiveIntegerField(default=0)
    first_attempt_at = models.DateTimeField()
    last_attempt_at = models.DateTimeField()

    class Meta:
        app_label = "core"
        unique_together = [("scope", "key")]
        indexes = [
            models.Index(fields=["scope", "key"]),
        ]

    def __str__(self):
        return f"{self.scope}:{self.key} (attempts={self.attempt_count})"
