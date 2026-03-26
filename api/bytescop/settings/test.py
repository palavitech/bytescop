"""
Unit test settings — SQLite in-memory, no external dependencies.

Used with: python manage.py test --settings=bytescop.settings.test

No Docker, no PostgreSQL, no Redis, no Celery required.
Imports directly from base.py — no dependency on production.py or dev.py.
"""

from .base import *  # noqa: F401, F403

DEBUG = False

SECRET_KEY = "test-secret-key-not-for-production"

ALLOWED_HOSTS = ["*"]

# ---------------------------------------------------------------------------
# SQLite in-memory (fast, zero-setup)
# ---------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# ---------------------------------------------------------------------------
# Speed optimisations
# ---------------------------------------------------------------------------

# MD5 is insecure but fast — cuts test runtime significantly
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# ---------------------------------------------------------------------------
# Disable external services
# ---------------------------------------------------------------------------

# Fake event publisher — no Celery/Redis needed
EVENTS_BACKEND = "fake"

# In-memory email backend — no SMTP needed
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Custom test runner — bootstraps InstallState so SetupGateMiddleware doesn't block
TEST_RUNNER = "core.test_runner.BytesCopTestRunner"

# ---------------------------------------------------------------------------
# Quieter logging during test runs
# ---------------------------------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": "CRITICAL",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "CRITICAL",
    },
}
