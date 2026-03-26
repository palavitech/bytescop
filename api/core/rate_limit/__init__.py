from .service import RateLimitService
from .backends.db import DjangoDbBackend

_instance = None


def get_rate_limiter() -> RateLimitService:
    """Return a singleton RateLimitService with the configured backend."""
    global _instance
    if _instance is None:
        _instance = RateLimitService(DjangoDbBackend())
    return _instance
