# Changelog

All notable changes to BytesCop will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-03-26

### Added
- Multi-tenant workspace with role-based access (Owner, Admin, Analyst, Viewer)
- Client and asset management (HOST, WEBAPP, API, CLOUD, NETWORK_DEVICE, MOBILE_APP)
- Engagement lifecycle with Statement of Work and scope management
- Security findings with severity tracking (Critical, High, Medium, Low, Info)
- Evidence management with local and S3 storage backends
- Markdown editor for finding descriptions
- Image upload and attachment support
- Dashboard with KPIs, findings trends, and activity feed
- JWT authentication with token rotation and blacklisting
- MFA (TOTP) support
- Setup wizard for first-run configuration
- Email notifications via Celery workers
- Automated backup and restore scripts
- Self-signed SSL certificate generation
- Docker Compose orchestration (PostgreSQL, Redis, Django, Celery, Nginx)
- Version-aware update system with rollback support
