"""Tests for the event publisher module."""

from unittest.mock import patch

from django.test import TestCase

from events.publisher import (
    CeleryEventPublisher,
    FakeEventPublisher,
    _use_fake,
    get_event_publisher,
    reset_event_publisher,
    set_event_publisher,
)


class FakeEventPublisherTests(TestCase):
    """Tests for the FakeEventPublisher test double."""

    def test_captures_events(self):
        fake = FakeEventPublisher()
        event = {'eventType': 'member-created', 'email': 'a@b.example.com'}

        fake.publish(event)

        self.assertEqual(len(fake.events), 1)
        self.assertEqual(fake.events[0], event)

    def test_captures_multiple_events(self):
        fake = FakeEventPublisher()

        fake.publish({'eventType': 'first'})
        fake.publish({'eventType': 'second'})

        self.assertEqual(len(fake.events), 2)

    def test_starts_empty(self):
        fake = FakeEventPublisher()
        self.assertEqual(fake.events, [])


class CeleryEventPublisherTests(TestCase):
    """Tests for the Celery publisher (mocking celery_app.send_task)."""

    @patch('bytescop.celery.app')
    def test_publishes_notification_to_notifications_queue(self, mock_app):
        """CeleryEventPublisher routes notification events to notifications queue."""
        publisher = CeleryEventPublisher()
        event = {
            'routing': ['notification'],
            'event_area': 'membership',
            'event_type': 'member_created',
            'tenant_id': 'tenant-1',
            'user_id': 'user-1',
            'email': 'test@example.com',
            'version': '1',
        }

        publisher.publish(event)

        mock_app.send_task.assert_called_once_with(
            'bytescop.tasks.process_notification',
            args=[event],
            queue='notifications',
        )

    @patch('bytescop.celery.app')
    def test_publishes_job_to_jobs_queue(self, mock_app):
        publisher = CeleryEventPublisher()
        event = {
            'routing': ['job'],
            'event_area': 'tenant',
            'event_type': 'export_data',
            'tenant_id': 'tenant-1',
            'version': '1',
        }

        publisher.publish(event)

        mock_app.send_task.assert_called_once_with(
            'bytescop.tasks.process_job',
            args=[event],
            queue='jobs',
        )

    @patch('bytescop.celery.app')
    def test_publishes_to_both_queues(self, mock_app):
        publisher = CeleryEventPublisher()
        event = {
            'routing': ['job', 'notification'],
            'event_area': 'tenant',
            'event_type': 'export_data',
            'tenant_id': 'tenant-1',
            'version': '1',
        }

        publisher.publish(event)

        self.assertEqual(mock_app.send_task.call_count, 2)
        calls = mock_app.send_task.call_args_list
        queues = {c[1]['queue'] for c in calls}
        self.assertEqual(queues, {'notifications', 'jobs'})

    @patch('bytescop.celery.app')
    def test_no_routing_publishes_nothing(self, mock_app):
        publisher = CeleryEventPublisher()
        event = {'event_type': 'legacy_event', 'version': '1'}

        publisher.publish(event)

        mock_app.send_task.assert_not_called()


class FactoryTests(TestCase):
    """Tests for get/set/reset factory functions."""

    def setUp(self):
        reset_event_publisher()

    def tearDown(self):
        reset_event_publisher()

    def test_set_and_get(self):
        fake = FakeEventPublisher()
        set_event_publisher(fake)

        result = get_event_publisher()

        self.assertIs(result, fake)

    def test_get_creates_fake_publisher_when_events_backend_fake(self):
        """When EVENTS_BACKEND='fake', factory returns FakeEventPublisher."""
        publisher = get_event_publisher()
        self.assertIsInstance(publisher, FakeEventPublisher)

    @patch('events.publisher._use_fake', return_value=False)
    def test_get_creates_celery_publisher_when_not_fake(self, mock_fake):
        publisher = get_event_publisher()
        self.assertIsInstance(publisher, CeleryEventPublisher)

    def test_reset_clears_publisher(self):
        fake = FakeEventPublisher()
        set_event_publisher(fake)
        reset_event_publisher()

        # Next call in test mode should create a new FakeEventPublisher
        publisher = get_event_publisher()
        self.assertIsNotNone(publisher)
        self.assertIsNot(publisher, fake)
        self.assertIsInstance(publisher, FakeEventPublisher)

    def test_use_fake_true_in_test_mode(self):
        self.assertTrue(_use_fake())
