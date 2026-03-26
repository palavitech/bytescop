"""Email sending via Django SMTP backend."""

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def send_email(recipient: str, subject: str, html_body: str) -> None:
    """Send an HTML email via SMTP.

    Args:
        recipient: Email address to send to.
        subject: Email subject line.
        html_body: Rendered HTML body.
    """
    from core.email import is_email_configured
    if not is_email_configured():
        logger.warning('Email not configured — email not sent to %s', recipient)
        return

    sender = getattr(settings, 'DEFAULT_FROM_EMAIL', '')

    send_mail(
        subject=subject,
        message='',
        html_message=html_body,
        from_email=sender,
        recipient_list=[recipient],
        fail_silently=False,
    )
    logger.info('Email sent via SMTP: to=%s subject="%s"', recipient, subject)
