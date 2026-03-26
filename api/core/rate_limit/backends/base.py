from abc import ABC, abstractmethod


class AbstractRateLimitBackend(ABC):
    """Interface for rate limit storage backends.

    Implementations must provide three operations: read, record, and reset.
    Return dicts (not ORM objects) to stay backend-agnostic.
    """

    @abstractmethod
    def get_entry(self, scope: str, key: str) -> dict | None:
        """Return current state for (scope, key), or None if no entry.

        Returns: {attempt_count: int, first_attempt_at: datetime, last_attempt_at: datetime}
        """

    @abstractmethod
    def record_attempt(self, scope: str, key: str) -> dict:
        """Increment attempt_count and update last_attempt_at. Create if missing.

        Returns: {attempt_count: int, first_attempt_at: datetime, last_attempt_at: datetime}
        """

    @abstractmethod
    def reset(self, scope: str, key: str) -> None:
        """Clear the entry for this scope+key."""
