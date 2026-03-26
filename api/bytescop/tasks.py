"""Celery tasks — entry points for async notification and job processing."""

import logging

from celery import shared_task

logger = logging.getLogger('bytescop.tasks')


@shared_task(
    bind=True,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    time_limit=600,
    soft_time_limit=540,
)
def process_notification(self, payload: dict) -> None:
    """Process a notification event (send email)."""
    area = payload.get('event_area', '')
    event_type = payload.get('event_type', '')

    logger.info('Processing notification: area=%s type=%s', area, event_type)

    from email_processor.handlers import get_handler

    handler = get_handler(area, event_type)
    if handler is None:
        logger.error('No email handler for: area=%s type=%s — event dropped', area, event_type)
        return

    try:
        handler.process(payload)
    except Exception as exc:
        logger.exception(
            'Notification failed (attempt %d/%d): area=%s type=%s',
            self.request.retries + 1, self.max_retries + 1, area, event_type,
        )
        raise self.retry(exc=exc)


@shared_task(
    bind=True,
    max_retries=3,
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    time_limit=1800,
    soft_time_limit=1740,
)
def process_job(self, payload: dict) -> None:
    """Process a background job event (export, purge, etc.)."""
    area = payload.get('event_area', '')
    event_type = payload.get('event_type', '')

    logger.info('Processing job: area=%s type=%s', area, event_type)

    from job_processor.handlers import get_handler

    handler = get_handler(area, event_type)
    if handler is None:
        logger.error('No job handler for: area=%s type=%s — event dropped', area, event_type)
        return

    try:
        handler.process(payload)
    except Exception as exc:
        logger.exception(
            'Job failed (attempt %d/%d): area=%s type=%s',
            self.request.retries + 1, self.max_retries + 1, area, event_type,
        )
        raise self.retry(exc=exc)


@shared_task(
    bind=True,
    max_retries=2,
    default_retry_delay=300,
)
def cleanup_expired_jobs(self) -> None:
    """Periodic task: delete expired background job records."""
    try:
        from jobs.service import JobService
        JobService.cleanup_expired()
    except Exception as exc:
        logger.exception('cleanup_expired_jobs failed')
        raise self.retry(exc=exc)
