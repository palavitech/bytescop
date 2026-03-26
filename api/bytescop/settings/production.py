"""
Production settings — PostgreSQL, hardened security.

Used inside Docker containers via DJANGO_SETTINGS_MODULE=bytescop.settings.production.
"""

import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401, F403
from .base import env_required

DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() in ("true", "1", "yes")

SECRET_KEY = env_required("DJANGO_SECRET_KEY")

if not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be set")

# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "bytescop"),
        "USER": os.environ.get("POSTGRES_USER", "bytescop"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
        "HOST": os.environ.get("POSTGRES_HOST", "db"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": int(os.environ.get("POSTGRES_CONN_MAX_AGE", "60")),
    }
}

# ---------------------------------------------------------------------------
# HTTPS security (nginx terminates SSL with self-signed cert by default)
# ---------------------------------------------------------------------------

SECURE_SSL_REDIRECT = False  # nginx handles HTTP→HTTPS redirect
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# Session cookies: Strict SameSite (same origin via nginx)
SESSION_COOKIE_SAMESITE = "Strict"
CSRF_COOKIE_SAMESITE = "Strict"

# ---------------------------------------------------------------------------
# CORS — require explicit origins in production (no localhost fallback)
# ---------------------------------------------------------------------------

_cors = [
    o.strip()
    for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]
if _cors:
    CORS_ALLOWED_ORIGINS = _cors
else:
    # On-prem: same-origin via nginx, no CORS needed
    CORS_ALLOWED_ORIGINS = []
    CORS_ALLOW_ALL_ORIGINS = False
