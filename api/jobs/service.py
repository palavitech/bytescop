"""BackgroundJobService — PostgreSQL-backed service for tracking async background jobs.

Usage:
    from jobs.service import get_job_service

    svc = get_job_service()
    job = svc.create_job(
        tenant_id='tenant-abc',
        job_type='export_data',
        created_by=user,
        params={'password_hash': '...'},
    )
"""

import logging
from datetime import timedelta

from django.utils import timezone

from .models import BackgroundJob

logger = logging.getLogger('bytescop.jobs')

# Job statuses (re-exported for convenience)
PENDING = BackgroundJob.PENDING
PROCESSING = BackgroundJob.PROCESSING
READY = BackgroundJob.READY
FAILED = BackgroundJob.FAILED

VALID_STATUSES = {PENDING, PROCESSING, READY, FAILED}

# Stale threshold: 20 minutes
STALE_THRESHOLD_SECONDS = 20 * 60

# Default TTL: 7 days
DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60


class JobService:
    """PostgreSQL-backed service for background job CRUD."""

    def create_job(
        self,
        tenant_id: str,
        job_type: str,
        created_by=None,
        params: dict | None = None,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ) -> dict:
        """Create a new background job record with PENDING status."""
        expires_at = timezone.now() + timedelta(seconds=ttl_seconds)

        job = BackgroundJob.objects.create(
            tenant_id=tenant_id,
            job_type=job_type,
            created_by=created_by,
            params=params or {},
            expires_at=expires_at,
        )

        logger.info(
            'Created job: tenant=%s job=%s type=%s',
            tenant_id, job.id, job_type,
        )
        return self._to_dict(job)

    def get_job(self, tenant_id: str, job_id: str) -> dict | None:
        """Retrieve a single job by tenant + job ID."""
        try:
            job = BackgroundJob.objects.get(tenant_id=tenant_id, id=job_id)
            return self._to_dict(job)
        except BackgroundJob.DoesNotExist:
            return None

    def list_jobs(
        self,
        tenant_id: str,
        job_type: str | None = None,
        status: str | None = None,
        limit: int = 20,
    ) -> list[dict]:
        """List jobs for a tenant, optionally filtered by type and status."""
        qs = BackgroundJob.objects.filter(tenant_id=tenant_id)
        if job_type:
            qs = qs.filter(job_type=job_type)
        if status:
            qs = qs.filter(status=status)
        return [self._to_dict(j) for j in qs[:limit]]

    def update_status(
        self,
        tenant_id: str,
        job_id: str,
        status: str,
        result: dict | None = None,
        error: str | None = None,
    ) -> dict | None:
        """Update job status and optionally set result or error."""
        if status not in VALID_STATUSES:
            raise ValueError(f'Invalid status: {status}')

        try:
            job = BackgroundJob.objects.get(tenant_id=tenant_id, id=job_id)
        except BackgroundJob.DoesNotExist:
            return None

        job.status = status
        if result is not None:
            job.result = result
        if error is not None:
            job.error_message = error
        if status == PROCESSING:
            job.started_at = timezone.now()
        if status in (READY, FAILED):
            job.completed_at = timezone.now()

        job.save()
        logger.info('Updated job: tenant=%s job=%s status=%s', tenant_id, job_id, status)
        return self._to_dict(job)

    def mark_stale_jobs(self, tenant_id: str) -> list[str]:
        """Mark PROCESSING jobs older than threshold as FAILED."""
        cutoff = timezone.now() - timedelta(seconds=STALE_THRESHOLD_SECONDS)
        stale = BackgroundJob.objects.filter(
            tenant_id=tenant_id,
            status=PROCESSING,
            updated_at__lt=cutoff,
        )
        stale_ids = list(stale.values_list('id', flat=True))
        stale.update(
            status=FAILED,
            error_message='Job timed out (exceeded 20 minute processing limit)',
            completed_at=timezone.now(),
        )

        if stale_ids:
            logger.warning(
                'Marked %d stale jobs as FAILED for tenant=%s',
                len(stale_ids), tenant_id,
            )
        return [str(i) for i in stale_ids]

    def get_latest_job(self, tenant_id: str, job_type: str) -> dict | None:
        """Get the most recent job of a given type for a tenant."""
        job = (
            BackgroundJob.objects
            .filter(tenant_id=tenant_id, job_type=job_type)
            .order_by('-created_at')
            .first()
        )
        return self._to_dict(job) if job else None

    @staticmethod
    def cleanup_expired():
        """Delete jobs past their expiry time. Called by Celery Beat."""
        count, _ = BackgroundJob.objects.filter(
            expires_at__lt=timezone.now(),
        ).delete()
        if count:
            logger.info('Cleaned up %d expired jobs', count)

    @staticmethod
    def _to_dict(job: BackgroundJob) -> dict:
        """Convert model instance to dict for API responses."""
        return {
            'tenant_id': str(job.tenant_id),
            'job_id': str(job.id),
            'job_type': job.job_type,
            'status': job.status,
            'created_by': str(job.created_by_id) if job.created_by_id else None,
            'params': job.params,
            'result': job.result,
            'error_message': job.error_message,
            'created_at': job.created_at.isoformat() if job.created_at else None,
            'updated_at': job.updated_at.isoformat() if job.updated_at else None,
            'started_at': job.started_at.isoformat() if job.started_at else None,
            'completed_at': job.completed_at.isoformat() if job.completed_at else None,
            'expires_at': job.expires_at.isoformat() if job.expires_at else None,
        }


def get_job_service() -> JobService:
    """Factory — returns the job service."""
    return JobService()
