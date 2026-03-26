"""Base event handler — template for all email event processors."""

import logging
from abc import ABC, abstractmethod

from email_processor.sender import send_email
from email_processor.templates import render_template

logger = logging.getLogger(__name__)


class BaseEventHandler(ABC):
    """Abstract handler for a single event type.

    Subclasses provide event-specific logic (recipient, subject, template
    data).  The base class orchestrates: load template → render → send.
    """

    @abstractmethod
    def get_recipient(self, payload: dict) -> str:
        """Return the email address to send to."""

    @abstractmethod
    def get_subject(self, payload: dict) -> str:
        """Return the email subject line."""

    @abstractmethod
    def get_template_data(self, payload: dict) -> dict:
        """Return a dict of values to resolve in the template."""

    def get_template_path(self, payload: dict) -> str:
        """Return the path for the template.

        Convention: <area>/<event_type>.html
        """
        area = payload.get('event_area', 'unknown')
        event_type = payload.get('event_type', 'unknown')
        return f'{area}/{event_type}.html'

    def process(self, payload: dict) -> None:
        """Orchestrate template load, render, and send."""
        recipient = self.get_recipient(payload)
        subject = self.get_subject(payload)
        template_path = self.get_template_path(payload)
        template_data = self.get_template_data(payload)

        rendered_html = render_template(template_path, template_data)

        logger.info(
            'Sending email: to=%s subject="%s" template=%s',
            recipient, subject, template_path,
        )

        send_email(recipient, subject, rendered_html)
