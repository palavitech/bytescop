"""
End-to-end test settings — PostgreSQL + Celery, full stack.

Used with: python manage.py test --settings=bytescop.settings.e2e

Requires Docker infra running (PostgreSQL, Redis, Celery workers, Beat).
Imports from dev.py — same database and infrastructure.
"""

from .dev import *  # noqa: F401, F403

# ---------------------------------------------------------------------------
# Speed optimisations
# ---------------------------------------------------------------------------

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

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
