"""Base job handler — template for all background job processors."""

import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class BaseJobHandler(ABC):
    """Abstract handler for a single job type.

    Subclasses implement run() with the actual job logic.
    The base class orchestrates:
        1. Update job → PROCESSING
        2. Run the job
        3. Update job → READY (or FAILED on error)
        4. Dispatch completion notification via Celery
    """

    @abstractmethod
    def run(self, payload: dict) -> dict:
        """Execute the job. Return a result dict for the notification payload."""

    def get_completion_event(self, payload: dict, result: dict) -> dict | None:
        """Return a notification event to publish on completion, or None to skip."""
        return None

    def get_failure_event(self, payload: dict) -> dict | None:
        """Return a notification event to publish on failure, or None to skip."""
        return None

    def process(self, payload: dict) -> None:
        """Orchestrate: update status → run job → update status → notify."""
        from jobs.models import BackgroundJob

        area = payload.get('event_area', '')
        event_type = payload.get('event_type', '')
        tenant_id = payload.get('tenant_id', '')
        job_id = payload.get('job_id', '')

        # Mark PROCESSING
        if tenant_id and job_id:
            BackgroundJob.objects.filter(
                tenant_id=tenant_id, id=job_id,
            ).update(status='PROCESSING')

        logger.info('Starting job: area=%s type=%s job=%s', area, event_type, job_id)

        try:
            result = self.run(payload)
            logger.info('Job completed: area=%s type=%s job=%s', area, event_type, job_id)

            # Mark READY
            if tenant_id and job_id:
                BackgroundJob.objects.filter(
                    tenant_id=tenant_id, id=job_id,
                ).update(status='READY', result=result or {})

            # Dispatch completion notification
            completion_event = self.get_completion_event(payload, result)
            if completion_event:
                self._dispatch_notification(completion_event)

        except Exception:
            logger.exception('Job failed: area=%s type=%s job=%s', area, event_type, job_id)
            if tenant_id and job_id:
                BackgroundJob.objects.filter(
                    tenant_id=tenant_id, id=job_id,
                ).update(
                    status='FAILED',
                    error_message='Job processing failed — see logs for details',
                )
            # Dispatch failure notification
            failure_event = self.get_failure_event(payload)
            if failure_event:
                self._dispatch_notification(failure_event)
            # Don't re-raise — job is already marked FAILED in DB.
            # Re-raising would cause Celery to retry, creating duplicate
            # FAILED entries and redundant failure notifications.

    def _dispatch_notification(self, event: dict) -> None:
        """Send a notification event to the notifications Celery queue."""
        try:
            from bytescop.celery import app as celery_app
            celery_app.send_task(
                'bytescop.tasks.process_notification',
                args=[event],
                queue='notifications',
            )
            logger.info(
                'Dispatched completion notification: area=%s type=%s',
                event.get('event_area'), event.get('event_type'),
            )
        except Exception:
            logger.exception('Failed to dispatch completion notification: %s', event)
