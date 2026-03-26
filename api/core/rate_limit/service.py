import logging
from dataclasses import dataclass

from django.utils import timezone

from .backends.base import AbstractRateLimitBackend
from .profiles import BACKOFF_PROFILES

logger = logging.getLogger("bytescop.rate_limit")


@dataclass
class RateLimitResult:
    allowed: bool
    retry_after_seconds: int = 0
    attempt_count: int = 0


class RateLimitService:
    """Exponential backoff rate limiter with pluggable storage backend."""

    def __init__(self, backend: AbstractRateLimitBackend):
        self._backend = backend

    def _safe_key(self, scope: str, key: str) -> str:
        """Return key safe for logging — truncate sensitive keys."""
        profile = BACKOFF_PROFILES.get(scope, {})
        if profile.get("sensitive_key"):
            return key[:8] + "..." if len(key) > 8 else key
        return key

    def check(self, scope: str, key: str) -> RateLimitResult:
        """Check if a request is allowed. Does NOT record an attempt."""
        profile = BACKOFF_PROFILES[scope]
        entry = self._backend.get_entry(scope, key)
        log_key = self._safe_key(scope, key)

        if entry is None:
            logger.info(
                "rate_limit.check scope=%s key=%s allowed=true attempt=0",
                scope, log_key,
            )
            return RateLimitResult(allowed=True, attempt_count=0)

        now = timezone.now()
        elapsed = (now - entry["last_attempt_at"]).total_seconds()
        reset_after_seconds = profile["reset_after"] * 60

        # Auto-reset if inactive longer than reset_after
        if elapsed >= reset_after_seconds:
            self._backend.reset(scope, key)
            logger.info(
                "rate_limit.stale_reset scope=%s key=%s inactive_hours=%d",
                scope, log_key, int(elapsed / 3600),
            )
            return RateLimitResult(allowed=True, attempt_count=0)

        # Determine required delay for next attempt
        schedule = profile["schedule"]
        idx = min(entry["attempt_count"], len(schedule) - 1)
        required_delay_seconds = schedule[idx] * 60

        if elapsed >= required_delay_seconds:
            logger.info(
                "rate_limit.check scope=%s key=%s allowed=true attempt=%d",
                scope, log_key, entry["attempt_count"],
            )
            return RateLimitResult(
                allowed=True, attempt_count=entry["attempt_count"],
            )

        remaining = int(required_delay_seconds - elapsed)
        logger.warning(
            "rate_limit.check scope=%s key=%s allowed=false attempt=%d retry_after=%ds",
            scope, log_key, entry["attempt_count"], remaining,
        )
        return RateLimitResult(
            allowed=False,
            retry_after_seconds=remaining,
            attempt_count=entry["attempt_count"],
        )

    def record(self, scope: str, key: str) -> None:
        """Record an attempt. Call AFTER the action succeeds."""
        result = self._backend.record_attempt(scope, key)
        log_key = self._safe_key(scope, key)
        attempt = result["attempt_count"]

        # Check for escalation
        schedule = BACKOFF_PROFILES[scope]["schedule"]
        idx = min(attempt, len(schedule) - 1)
        cooldown_min = schedule[idx]

        if attempt >= len(schedule):
            logger.warning(
                "rate_limit.max_reached scope=%s key=%s attempt=%d cooldown=%dm (cap)",
                scope, log_key, attempt, cooldown_min,
            )
        elif cooldown_min > 0:
            prev_idx = min(attempt - 1, len(schedule) - 1)
            prev_cooldown = schedule[prev_idx]
            if cooldown_min > prev_cooldown:
                logger.warning(
                    "rate_limit.escalated scope=%s key=%s attempt=%d new_cooldown=%dm previous_cooldown=%dm",
                    scope, log_key, attempt, cooldown_min, prev_cooldown,
                )

        logger.info(
            "rate_limit.record scope=%s key=%s attempt=%d next_cooldown=%dm",
            scope, log_key, attempt, cooldown_min,
        )

    def reset(self, scope: str, key: str, reason: str = "") -> None:
        """Reset backoff state. Call after successful action (e.g., password changed)."""
        entry = self._backend.get_entry(scope, key)
        attempts_before = entry["attempt_count"] if entry else 0
        self._backend.reset(scope, key)
        log_key = self._safe_key(scope, key)
        logger.info(
            "rate_limit.reset scope=%s key=%s reason=%s attempts_before_reset=%d",
            scope, log_key, reason or "explicit", attempts_before,
        )
