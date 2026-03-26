import logging

from django.conf import settings
from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger('bytescop')


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Comprehensive health check — verifies all backend dependencies."""
    checks = {}
    healthy = True

    # Database
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks['database'] = 'ok'
    except Exception as e:
        checks['database'] = f'error: {e}'
        healthy = False

    # Redis / Celery broker
    try:
        from bytescop.celery import app as celery_app
        conn = celery_app.connection()
        conn.connect()
        conn.release()
        checks['redis'] = 'ok'
    except Exception as e:
        checks['redis'] = f'error: {e}'
        healthy = False

    # SMTP (optional — only check if configured)
    from core.email import is_email_configured
    if is_email_configured():
        try:
            from django.core.mail import get_connection
            conn = get_connection(fail_silently=False)
            conn.open()
            conn.close()
            checks['smtp'] = 'ok'
        except Exception as e:
            checks['smtp'] = f'error: {e}'
            # SMTP failure is not fatal — product works without email
    else:
        checks['smtp'] = 'not configured'

    # Storage (media directory writable)
    try:
        import os
        import tempfile
        media_root = getattr(settings, 'MEDIA_ROOT', '/app/media')
        if os.path.isdir(media_root):
            fd, path = tempfile.mkstemp(dir=media_root)
            os.close(fd)
            os.unlink(path)
            checks['storage'] = 'ok'
        else:
            checks['storage'] = 'error: MEDIA_ROOT does not exist'
            healthy = False
    except Exception as e:
        checks['storage'] = f'error: {e}'
        healthy = False

    status_code = 200 if healthy else 503
    return Response(
        {
            'status': 'ok' if healthy else 'degraded',
            'version': settings.APP_VERSION,
            'checks': checks,
        },
        status=status_code,
    )
