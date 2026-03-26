"""Central email configuration check."""

from django.conf import settings


def is_email_configured() -> bool:
    """Return True if SMTP is configured and emails can be sent.

    Checks that both EMAIL_HOST (actual SMTP server, not localhost)
    and DEFAULT_FROM_EMAIL (sender address) are set.
    """
    host = getattr(settings, 'EMAIL_HOST', '')
    sender = getattr(settings, 'DEFAULT_FROM_EMAIL', '')
    return bool(host and host != 'localhost' and sender)
