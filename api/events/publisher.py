"""Event publisher — dispatches domain events to Celery task queues.

Usage in views:
    from events.publisher import get_event_publisher
    publisher = get_event_publisher()
    publisher.publish({
        'routing': ['notification'],
        'event_area': 'membership',
        'event_type': 'member_created',
        'tenant_id': str(tenant.id),
        'user_id': str(user.id),
        'email': user.email,
        'version': '1',
    })

'routing' controls which Celery queue receives the event:
  - ['notification'] → notifications queue only
  - ['job']          → jobs queue only
  - ['job', 'notification'] → both queues
"""

import json
import logging
from abc import ABC, abstractmethod

from django.conf import settings

logger = logging.getLogger('bytescop.events')


class EventPublisher(ABC):
    """Abstract base for event publishing — enables dependency injection."""

    @abstractmethod
    def publish(self, event: dict) -> None:
        """Publish a domain event."""


class CeleryEventPublisher(EventPublisher):
    """Publishes events to Celery task queues via Redis broker."""

    def publish(self, event: dict) -> None:
        from bytescop.celery import app as celery_app

        routing = event.get('routing', [])
        if isinstance(routing, str):
            routing = [routing]

        if 'notification' in routing:
            celery_app.send_task(
                'bytescop.tasks.process_notification',
                args=[event],
                queue='notifications',
            )

        if 'job' in routing:
            celery_app.send_task(
                'bytescop.tasks.process_job',
                args=[event],
                queue='jobs',
            )

        queues = []
        if 'notification' in routing:
            queues.append('notifications')
        if 'job' in routing:
            queues.append('jobs')

        logger.info(
            'Published event: area=%s type=%s queues=%s tenant=%s',
            event.get('event_area'), event.get('event_type'),
            queues, event.get('tenant_id'),
        )


class FakeEventPublisher(EventPublisher):
    """Test double — captures published events in a list and logs them."""

    def __init__(self):
        self.events: list[dict] = []

    def publish(self, event: dict) -> None:
        self.events.append(event)
        routing = event.get('routing', [])
        queues = []
        if 'notification' in routing:
            queues.append('notifications')
        if 'job' in routing:
            queues.append('jobs')
        logger.info(
            '[FAKE] Event → %s | area=%s type=%s tenant=%s',
            ', '.join(queues) or 'no queue',
            event.get('event_area'), event.get('event_type'),
            event.get('tenant_id'),
        )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_publisher: EventPublisher | None = None


def _use_fake() -> bool:
    """Return True when EVENTS_BACKEND setting is 'fake' (unit tests)."""
    return getattr(settings, 'EVENTS_BACKEND', 'celery') == 'fake'


def get_event_publisher() -> EventPublisher:
    """Return the singleton event publisher instance.

    Returns FakeEventPublisher when EVENTS_BACKEND='fake' (unit tests).
    Otherwise returns CeleryEventPublisher (dev, production, e2e tests).
    """
    global _publisher
    if _publisher is None:
        if _use_fake():
            _publisher = FakeEventPublisher()
        else:
            _publisher = CeleryEventPublisher()
    return _publisher


def set_event_publisher(publisher: EventPublisher) -> None:
    """Override the publisher (for testing)."""
    global _publisher
    _publisher = publisher


def reset_event_publisher() -> None:
    """Reset to default (re-creates on next call)."""
    global _publisher
    _publisher = None
