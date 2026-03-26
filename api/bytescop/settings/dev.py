"""
Local development settings — PostgreSQL via Docker, relaxed security.

Used when running the API outside Docker (manage.py runserver).
NEVER used in production or Docker builds.

Imports directly from base.py — no dependency on production.py.
"""

import os

from .base import *  # noqa: F401, F403

DEBUG = True

ALLOWED_HOSTS = ["*"]

# ---------------------------------------------------------------------------
# PostgreSQL (Docker, exposed to localhost via docker-compose.dev.yml)
# ---------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "bytescop"),
        "USER": os.environ.get("POSTGRES_USER", "bytescop"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", ""),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

# ---------------------------------------------------------------------------
# HTTP-safe cookies (ng serve doesn't have SSL)
# ---------------------------------------------------------------------------

SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# ---------------------------------------------------------------------------
# CORS — allow Angular dev server
# ---------------------------------------------------------------------------

CORS_ALLOW_ALL_ORIGINS = True
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:4200",
]
