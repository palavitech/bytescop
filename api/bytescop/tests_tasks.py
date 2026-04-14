"""Tests for bytescop/tasks.py — Celery task entry points.

These tests call task functions directly (not via Celery), mocking
external handler dependencies to validate routing and error handling.
"""

from unittest.mock import patch, MagicMock

from django.test import TestCase


class ProcessNotificationTaskTests(TestCase):
    """Tests for the process_notification Celery task."""

    @patch("email_processor.handlers.get_handler")
    def test_calls_handler_when_found(self, mock_get_handler):
        """When a handler exists, it should call handler.process(payload)."""
        from bytescop.tasks import process_notification

        mock_handler = MagicMock()
        mock_get_handler.return_value = mock_handler

        payload = {
            "event_area": "membership",
            "event_type": "member_created",
            "email": "test@example.com",
        }

        # Call the underlying function (not via .delay)
        process_notification(payload)

        mock_get_handler.assert_called_once_with("membership", "member_created")
        mock_handler.process.assert_called_once_with(payload)

    @patch("email_processor.handlers.get_handler")
    def test_returns_when_no_handler(self, mock_get_handler):
        """When no handler is found, should log and return without error."""
        from bytescop.tasks import process_notification

        mock_get_handler.return_value = None

        payload = {
            "event_area": "unknown",
            "event_type": "unknown_event",
        }

        # Should not raise
        result = process_notification(payload)
        self.assertIsNone(result)

    @patch("email_processor.handlers.get_handler")
    def test_retries_on_handler_exception(self, mock_get_handler):
        """When handler.process() raises, the task should retry."""
        from bytescop.tasks import process_notification

        mock_handler = MagicMock()
        mock_handler.process.side_effect = RuntimeError("SMTP failure")
        mock_get_handler.return_value = mock_handler

        payload = {
            "event_area": "membership",
            "event_type": "member_created",
        }

        # When called directly (not via .delay), retry raises Retry exception
        # We need to test the function logic. Since bind=True, the first arg
        # is self (the task instance). We mock self.retry to confirm it's called.
        from celery.exceptions import Retry

        with patch.object(process_notification, 'retry', side_effect=Retry()) as mock_retry:
            with self.assertRaises(Retry):
                process_notification(payload)
            mock_retry.assert_called_once()

    @patch("email_processor.handlers.get_handler")
    def test_empty_payload_uses_defaults(self, mock_get_handler):
        """Empty event_area and event_type should default to empty strings."""
        from bytescop.tasks import process_notification

        mock_get_handler.return_value = None

        # Should not raise even with empty payload
        process_notification({})
        mock_get_handler.assert_called_once_with("", "")


class ProcessJobTaskTests(TestCase):
    """Tests for the process_job Celery task."""

    @patch("job_processor.handlers.get_handler")
    def test_calls_handler_when_found(self, mock_get_handler):
        from bytescop.tasks import process_job

        mock_handler = MagicMock()
        mock_get_handler.return_value = mock_handler

        payload = {
            "event_area": "tenant",
            "event_type": "closure_execute",
            "tenant_id": "some-id",
        }

        process_job(payload)

        mock_get_handler.assert_called_once_with("tenant", "closure_execute")
        mock_handler.process.assert_called_once_with(payload)

    @patch("job_processor.handlers.get_handler")
    def test_returns_when_no_handler(self, mock_get_handler):
        from bytescop.tasks import process_job

        mock_get_handler.return_value = None

        payload = {
            "event_area": "unknown",
            "event_type": "unknown_event",
        }

        result = process_job(payload)
        self.assertIsNone(result)

    @patch("job_processor.handlers.get_handler")
    def test_retries_on_handler_exception(self, mock_get_handler):
        from bytescop.tasks import process_job

        mock_handler = MagicMock()
        mock_handler.process.side_effect = RuntimeError("DB timeout")
        mock_get_handler.return_value = mock_handler

        payload = {
            "event_area": "tenant",
            "event_type": "closure_execute",
        }

        from celery.exceptions import Retry

        with patch.object(process_job, 'retry', side_effect=Retry()) as mock_retry:
            with self.assertRaises(Retry):
                process_job(payload)
            mock_retry.assert_called_once()

    @patch("job_processor.handlers.get_handler")
    def test_empty_payload_uses_defaults(self, mock_get_handler):
        from bytescop.tasks import process_job

        mock_get_handler.return_value = None
        process_job({})
        mock_get_handler.assert_called_once_with("", "")


class CleanupExpiredJobsTaskTests(TestCase):
    """Tests for the cleanup_expired_jobs Celery task."""

    @patch("jobs.service.JobService.cleanup_expired")
    def test_calls_cleanup_expired(self, mock_cleanup):
        from bytescop.tasks import cleanup_expired_jobs

        cleanup_expired_jobs()
        mock_cleanup.assert_called_once()

    @patch("jobs.service.JobService.cleanup_expired")
    def test_retries_on_exception(self, mock_cleanup):
        from bytescop.tasks import cleanup_expired_jobs

        mock_cleanup.side_effect = RuntimeError("DB connection lost")

        from celery.exceptions import Retry

        with patch.object(cleanup_expired_jobs, 'retry', side_effect=Retry()) as mock_retry:
            with self.assertRaises(Retry):
                cleanup_expired_jobs()
            mock_retry.assert_called_once()
