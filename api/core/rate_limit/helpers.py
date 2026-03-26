"""DRF response helpers for rate-limited endpoints.

Views call these with keyword arguments matching the profile's key_type:
    check_rate_limit("login", email=email, ip=ip)
    check_rate_limit("forgot_password", email=email)
    check_rate_limit("mfa_verify", user_id=uid, ip=ip)
    check_rate_limit("verify_email", token=tok)

The key is constructed automatically from the profile's key_type config.
"""

from rest_framework import status
from rest_framework.response import Response

from . import get_rate_limiter
from .profiles import BACKOFF_PROFILES
from .service import RateLimitResult


def _build_key(scope: str, **kwargs) -> str:
    """Build the rate limit key from profile key_type and provided kwargs."""
    profile = BACKOFF_PROFILES[scope]
    key_type = profile.get("key_type", "email")

    if key_type == "email":
        return kwargs["email"]
    elif key_type == "ip_email":
        return f"{kwargs['ip']}:{kwargs['email']}"
    elif key_type == "ip_user_id":
        return f"{kwargs['ip']}:{kwargs['user_id']}"
    elif key_type == "token":
        return kwargs["token"][:32]
    else:
        raise ValueError(f"Unknown key_type '{key_type}' for scope '{scope}'")


def get_client_ip(request) -> str:
    """Extract client IP from X-Forwarded-For or REMOTE_ADDR."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def check_rate_limit(scope: str, **kwargs) -> RateLimitResult:
    """Check rate limit for the given scope and key components."""
    key = _build_key(scope, **kwargs)
    return get_rate_limiter().check(scope, key)


def record_rate_limit(scope: str, **kwargs) -> None:
    """Record an attempt for the given scope and key components."""
    key = _build_key(scope, **kwargs)
    get_rate_limiter().record(scope, key)


def reset_rate_limit(scope: str, reason: str = "", **kwargs) -> None:
    """Reset rate limit state for the given scope and key components."""
    key = _build_key(scope, **kwargs)
    get_rate_limiter().reset(scope, key, reason=reason)


def rate_limit_429(result: RateLimitResult) -> Response:
    """Return a 429 response with Retry-After header."""
    resp = Response(
        {"detail": "Too many attempts. Please try again later."},
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )
    resp["Retry-After"] = str(result.retry_after_seconds)
    return resp
