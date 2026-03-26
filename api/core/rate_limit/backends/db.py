from django.db.models import F
from django.utils import timezone

from .base import AbstractRateLimitBackend
from ..models import RateLimitEntry


class DjangoDbBackend(AbstractRateLimitBackend):
    """Rate limit backend using Django ORM (PostgreSQL/SQLite)."""

    def get_entry(self, scope: str, key: str) -> dict | None:
        try:
            e = RateLimitEntry.objects.get(scope=scope, key=key)
            return {
                "attempt_count": e.attempt_count,
                "first_attempt_at": e.first_attempt_at,
                "last_attempt_at": e.last_attempt_at,
            }
        except RateLimitEntry.DoesNotExist:
            return None

    def record_attempt(self, scope: str, key: str) -> dict:
        now = timezone.now()
        entry, created = RateLimitEntry.objects.get_or_create(
            scope=scope,
            key=key,
            defaults={
                "attempt_count": 1,
                "first_attempt_at": now,
                "last_attempt_at": now,
            },
        )
        if not created:
            RateLimitEntry.objects.filter(pk=entry.pk).update(
                attempt_count=F("attempt_count") + 1,
                last_attempt_at=now,
            )
            entry.refresh_from_db()

        return {
            "attempt_count": entry.attempt_count,
            "first_attempt_at": entry.first_attempt_at,
            "last_attempt_at": entry.last_attempt_at,
        }

    def reset(self, scope: str, key: str) -> None:
        RateLimitEntry.objects.filter(scope=scope, key=key).delete()
