# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

BytesCop is a self-hosted security findings management platform. It consolidates pen tests, vulnerability scans, and manual assessments into a single multi-tenant workspace. The repo contains a Django REST API (`api/`), an Angular frontend (`ui/`), Docker orchestration, and operational shell scripts.

## Commands

### Development (hybrid: Docker infra + local code)

```bash
# Start everything (two terminals):
./api-devrun.sh    # Docker infra → migrations → Django dev server at :8000
./ui-devrun.sh     # npm install → Angular dev server at :4200 (proxies /api to :8000)
./stop-devrun.sh   # Stop all (Docker + local servers)

# Or manually start just Docker infra:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

### API (Django)

```bash
cd api
DJANGO_SETTINGS_MODULE=bytescop.settings.dev POSTGRES_PASSWORD=<from .env> \
  .venv/bin/python manage.py runserver 0.0.0.0:8000

# Tests (no Docker needed — uses SQLite in-memory):
.venv/bin/python manage.py test engagements accounts -v 2 --settings=bytescop.settings.test

# Single test class:
.venv/bin/python manage.py test engagements.tests.TestEngagementCreate --settings=bytescop.settings.test

# E2E tests (requires Docker infra running):
.venv/bin/python manage.py test -v 2 --settings=bytescop.settings.e2e

# Coverage:
.venv/bin/coverage run --source='.' manage.py test --settings=bytescop.settings.test
.venv/bin/coverage report --skip-empty
```

### UI (Angular 21)

```bash
cd ui
npm install
npx ng serve --host 0.0.0.0 -c local    # dev server with API proxy
npx ng test --watch=false                # unit tests (Karma/Jasmine)
npx ng test --include='**/some.spec.ts'  # single test file
```

### Reset & Maintenance

```bash
./flush_dev.sh     # Drop DB, flush Redis, clear media, re-migrate (prompts "FLUSH")
./backup.sh        # Timestamped backup of DB + media → ./backups/
```

## Architecture

### Docker Services (production: 7 containers)

PostgreSQL 16, Redis 7, Django API (gunicorn), 2 Celery workers (notifications + jobs), Celery Beat, Nginx. Dev mode disables api/ui/nginx containers and exposes DB (5432) and Redis (6379) ports to host.

### API (`api/`)

**Stack:** Python 3.13+, Django 6, DRF, SimpleJWT, Celery, PostgreSQL (prod) / SQLite (test)

**Django Apps:**

| App | Purpose |
|---|---|
| `accounts` | Email-based User model (`USERNAME_FIELD = 'email'`) |
| `account_settings` | Tenant-scoped key-value settings + logo upload |
| `api` | Main router, auth views, profile, dashboard |
| `assets` | Asset CRUD (HOST, WEBAPP, API, CLOUD, NETWORK_DEVICE, MOBILE_APP) |
| `audit` | Audit trail |
| `authorization` | Permissions and RBAC |
| `clients` | Customer/client management |
| `comments` | Comments on entities |
| `core` | InstallState singleton, SetupGateMiddleware, setup wizard |
| `email_processor` | Email processing/sending |
| `engagements` | Assessment projects, SoW, scope management |
| `events` | Event system / publisher |
| `evidence` | Finding evidence items + attachment storage (local/S3) |
| `feedback` | User feedback |
| `findings` | Security findings with severity/status tracking |
| `job_processor` | Background job execution |
| `jobs` | Job definitions (exports, purges) |
| `licensing` | License key validation |
| `subscriptions` | Community/Enterprise plan limits |
| `tenancy` | Tenant model, TenantMember roles, TenantMiddleware |

**Settings modules** (`api/bytescop/settings/`): `base.py` (shared) → `dev.py` (local PG, relaxed CORS) | `test.py` (SQLite in-memory, no Docker) | `e2e.py` (extends dev, fast hasher) | `production.py` (Docker PG, full stack). Always set `DJANGO_SETTINGS_MODULE`.

**Key patterns:**
- All models inherit `TimeStampedModel` (UUID pk, created_at, updated_at)
- All querysets are tenant-scoped via FK + `get_queryset()` filtering on `request.tenant`
- `perform_create()` injects `tenant=request.tenant`, `created_by=request.user`
- `X-Tenant-Slug` header identifies tenant; resolved by TenantMiddleware
- JWT auth: access=10min, refresh=14d, rotation + blacklist enabled
- Middleware chain: CORS → SetupGate → Tenant → CSRF-exempt for `/api/*`

### UI (`ui/`)

**Stack:** Angular 21.1.0 (standalone components), TypeScript 5.9, Bootstrap 5.3, RxJS 7.8

```
src/app/
├── components/    # Reusable: breadcrumb, toast, pipes, directives, tenant-menu, mfa-setup-card
├── features/      # Domain features: admin, assets, comments, engagements, organizations, profile
├── pages/         # Route pages: login, setup, dashboard, forgot-password, reset-password, etc.
└── services/core/ # Singleton services (auth, loading, notify, etc.)
```

**Key patterns:**
- Standalone components only (no NgModules), OnPush change detection
- `inject()` for dependency injection, signals for reactive state
- Bootstrap 5 first — custom CSS only for cyber theme (dark bg `#070a0f`, accent green `#00ffb3`, accent blue `#00b7ff`)
- CSS variables prefixed `--bc-*` in `src/styles.css`
- Fonts: IBM Plex Mono (body), Orbitron (headings)
- Functional HTTP interceptors chained in `app.config.ts` via `withInterceptors([...])`
- Route data for breadcrumbs: `data: { breadcrumb: 'Label' }`, `hideBreadcrumb: true` to suppress
- Proxy config (`src/proxy.conf.json`) routes `/api/*` to localhost:8000 in dev
- Coding standards: single quotes, 2-space indent, `const` by default, no `any`

### Domain Model (simplified)

```
Tenant (name, slug, status)
├── TenantMember → User (role: OWNER|ADMIN|ANALYST|VIEWER)
├── Client (name, website, status)
│   └── Asset (name, type, environment, criticality, target)
├── Engagement (client, status, dates)
│   ├── Sow (1:1, auto-created, status)
│   │   └── SowAsset (asset, in_scope)
│   └── Finding (asset, title, severity, category, status, description_md)
│       ├── EvidenceItem (type, text, data, attachment)
│       └── Attachment (token=UUID, filename, sha256, storage_uri)
├── AccountSetting (key, value, setting_type)
└── Subscription / License (plan limits enforcement)
```

### Storage System

Abstract `AttachmentStorage` with local and S3 backends (set via `BC_STORAGE_BACKEND`). Upload validates content type, enforces `BC_MAX_UPLOAD_BYTES`, computes SHA256. Markdown attachment reconciliation syncs DRAFT→ACTIVE and cleans orphans.

## Environment Variables

Key variables in `.env` (see `.env.example` for full list):

```
POSTGRES_PASSWORD, DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS
BYTESCOP_JWT_ACCESS_MINUTES (10), BYTESCOP_JWT_REFRESH_DAYS (14)
BC_STORAGE_BACKEND (local|s3), BC_MAX_UPLOAD_BYTES
BC_PORT (443), BC_LICENSE_KEY
EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD
BYTESCOP_LOG_LEVEL (INFO), BYTESCOP_SQL_LOG (0|1)
```
