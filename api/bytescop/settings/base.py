"""
Django settings for bytescop project — shared base.

Leaf modules (dev.py, production.py) import * from here and override
what they need.
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# BASE_DIR = bytescop-saas-api/ (two levels up from settings/base.py)
BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env_required(name):
    """Return env var or raise ImproperlyConfigured."""
    value = os.environ.get(name, "").strip()
    if not value:
        raise ImproperlyConfigured(f"Environment variable {name} is required")
    return value


# ---------------------------------------------------------------------------
# Version
# ---------------------------------------------------------------------------

APP_VERSION = os.environ.get("APP_VERSION", "dev")

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY", "django-insecure-dev-only-key"
)

DEBUG = False

# Event publisher backend: 'celery' (default) or 'fake' (unit tests)
EVENTS_BACKEND = 'celery'

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",")
    if h.strip()
]

# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'core',
    'accounts',
    'authorization',
    'tenancy',
    'clients',
    'assets',
    'projects',
    'engagements',
    'findings',
    'evidence',
    'audit',
    'account_settings',
    'subscriptions',
    'comments',
    'events',
    'jobs',
    'licensing',
    'api',
]

AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'bytescop.middleware.VersionHeaderMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'core.request_id_middleware.RequestIdMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'core.setup_middleware.SetupGateMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'tenancy.middleware.TenantMiddleware',
    'accounts.mfa_enforcement_middleware.MfaEnforcementMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'bytescop.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'bytescop.wsgi.application'

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'core.authentication.SessionAuthWith401',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'EXCEPTION_HANDLER': 'core.exception_handler.api_exception_handler',
}

# Number of upstream proxies (nginx, ALB) for correct client-IP detection.
# SimpleRateThrottle uses this to pick the right X-Forwarded-For entry.
NUM_PROXIES = int(os.environ.get('NUM_PROXIES', '1'))

# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

SESSION_COOKIE_NAME = 'bc_session'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_PATH = '/'
SESSION_COOKIE_AGE = 14 * 24 * 60 * 60  # 14 days (default, overridden per-session by remember-me)
SESSION_SAVE_EVERY_REQUEST = True  # slide expiry on activity
SESSION_ENGINE = 'django.contrib.sessions.backends.db'

# ---------------------------------------------------------------------------
# CSRF
# ---------------------------------------------------------------------------

CSRF_COOKIE_NAME = 'bc_csrf'
CSRF_COOKIE_HTTPONLY = False  # frontend must read it
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_HEADER_NAME = 'HTTP_X_CSRFTOKEN'

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
] or [
    'http://localhost:4200',
]

CORS_ALLOW_HEADERS = [
    'accept',
    'content-type',
    'origin',
    'x-csrftoken',
    'x-request-id',
]

CORS_EXPOSE_HEADERS = [
    'x-request-id',
    'x-api-version',
]

CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Uploads / Storage
# ---------------------------------------------------------------------------

MEDIA_URL = os.environ.get('DJANGO_MEDIA_URL', '/media/')
MEDIA_ROOT = os.environ.get('DJANGO_MEDIA_ROOT', str(BASE_DIR / 'media'))

BC_MAX_UPLOAD_BYTES = int(os.environ.get('BC_MAX_UPLOAD_BYTES', str(10 * 1024 * 1024)))
BC_MAX_SAMPLE_BYTES = int(os.environ.get('BC_MAX_SAMPLE_BYTES', str(200 * 1024 * 1024)))

# Django streams uploads larger than this to a temp file instead of RAM.
# Set to match BC_MAX_SAMPLE_BYTES so the full request body is accepted.
DATA_UPLOAD_MAX_MEMORY_SIZE = BC_MAX_SAMPLE_BYTES
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # 5 MB — files above this go to disk

# Contact-us recipient — where anonymous inquiries are forwarded
BC_CONTACT_EMAIL = os.environ.get('BC_CONTACT_EMAIL', 'team@bytescop.com')

# ---------------------------------------------------------------------------
# Celery (async task processing via Redis)
# ---------------------------------------------------------------------------

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Broker resilience — retry connection on startup and after drops
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_BROKER_CONNECTION_RETRY = True
CELERY_BROKER_CONNECTION_MAX_RETRIES = 10

# Task reliability — acknowledge after execution, re-queue on worker crash
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True

# Result TTL — don't accumulate stale results in Redis
CELERY_RESULT_EXPIRES = 3600  # 1 hour

# Celery Beat schedule — periodic tasks
CELERY_BEAT_SCHEDULE = {
    'cleanup-expired-jobs': {
        'task': 'bytescop.tasks.cleanup_expired_jobs',
        'schedule': 86400.0,  # daily
    },
}

# ---------------------------------------------------------------------------
# Email (SMTP)
# ---------------------------------------------------------------------------

EMAIL_BACKEND = 'django.core.mail.backends.smtp.SMTPBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'localhost')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'true').lower() in ('true', '1', 'yes')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@bytescop.local')

# ---------------------------------------------------------------------------
# Email templates (filesystem path)
# ---------------------------------------------------------------------------

EMAIL_TEMPLATES_DIR = os.environ.get(
    'EMAIL_TEMPLATES_DIR',
    str(BASE_DIR.parent / 'email_templates'),
)

# ---------------------------------------------------------------------------
# License key (Enterprise features)
# ---------------------------------------------------------------------------

BC_LICENSE_KEY = os.environ.get('BC_LICENSE_KEY', '')

# ---------------------------------------------------------------------------
# Invite tokens
# ---------------------------------------------------------------------------

BC_INVITE_EXPIRY_HOURS = int(os.environ.get('BC_INVITE_EXPIRY_HOURS', '72'))
BC_INVITE_COOLDOWN_MINUTES = int(os.environ.get('BC_INVITE_COOLDOWN_MINUTES', '15'))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_DIR = os.environ.get("BYTESCOP_LOG_DIR", str(BASE_DIR / "logs"))
os.makedirs(LOG_DIR, exist_ok=True)

BYTESCOP_LOG_LEVEL = os.environ.get('BYTESCOP_LOG_LEVEL', 'INFO').upper()
DJANGO_LOG_LEVEL = os.environ.get('DJANGO_LOG_LEVEL', 'WARNING').upper()
BYTESCOP_SQL_LOG = os.environ.get('BYTESCOP_SQL_LOG', '').strip()
BYTESCOP_LOG_MAX_BYTES = int(os.environ.get('BYTESCOP_LOG_MAX_BYTES', str(30 * 1024 * 1024)))
BYTESCOP_LOG_BACKUP_COUNT = int(os.environ.get('BYTESCOP_LOG_BACKUP_COUNT', '10'))

# Console log format: 'json' for structured CloudWatch logging, 'text' for plain (default)
BYTESCOP_LOG_FORMAT = os.environ.get('BYTESCOP_LOG_FORMAT', 'text').strip().lower()

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'request_id': {
            '()': 'core.logging.RequestIdFilter',
        },
    },
    'formatters': {
        'standard': {
            'format': '%(asctime)s %(levelname)-8s [%(request_id)s] %(name)s %(message)s',
        },
        'json': {
            '()': 'core.logging.JsonFormatter',
        },
        'json_access': {
            '()': 'core.logging.JsonAccessLogFormatter',
        },
        'text_access': {
            'format': '%(asctime)s %(levelname)-8s %(name)s %(message)s',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'json' if BYTESCOP_LOG_FORMAT == 'json' else 'standard',
            'filters': ['request_id'],
        },
        'console_access': {
            'class': 'logging.StreamHandler',
            'formatter': 'json_access' if BYTESCOP_LOG_FORMAT == 'json' else 'text_access',
        },
        'file': {
            'class': 'concurrent_log_handler.ConcurrentRotatingFileHandler',
            'filename': os.path.join(LOG_DIR, 'bytescop.log'),
            'maxBytes': BYTESCOP_LOG_MAX_BYTES,  # default 30 MB
            'backupCount': BYTESCOP_LOG_BACKUP_COUNT,  # default 10
            'formatter': 'standard',
            'filters': ['request_id'],
        },
    },
    'loggers': {
        'bytescop': {
            'handlers': ['console', 'file'],
            'level': BYTESCOP_LOG_LEVEL,
            'propagate': False,
        },
        'bytescop.api': {
            'handlers': ['console', 'file'],
            'level': BYTESCOP_LOG_LEVEL,
            'propagate': False,
        },
        'django': {
            'handlers': ['console', 'file'],
            'level': DJANGO_LOG_LEVEL,
            'propagate': False,
        },
        'django.db.backends': {
            'handlers': ['console', 'file'],
            'level': 'DEBUG' if BYTESCOP_SQL_LOG == '1' else 'WARNING',
            'propagate': False,
        },
        'gunicorn.access': {
            'handlers': ['console_access'],
            'level': 'INFO',
            'propagate': False,
        },
        'gunicorn.error': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# ---------------------------------------------------------------------------
# CSRF trusted origins (populated from CORS_ALLOWED_ORIGINS)
# ---------------------------------------------------------------------------

CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS[:]
