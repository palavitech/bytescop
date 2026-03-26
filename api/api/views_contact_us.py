"""Public contact-us endpoint — accepts inquiries from anonymous visitors.

Validates input, rate-limits by email (silent — returns 200 even when
throttled to avoid leaking rate-limit state), and publishes a notification
event to SNS so the Lambda email handler can forward the message.
"""

import logging

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.rate_limit.helpers import check_rate_limit, get_client_ip, record_rate_limit
from core.validators import sanitize_text, validate_safe_text
from events.publisher import get_event_publisher

logger = logging.getLogger('bytescop.api')

GENERIC_RESPONSE = 'Thank you for reaching out. We will get back to you shortly.'


class ContactUsSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    organization = serializers.CharField(max_length=200, required=False, default='')
    subject = serializers.CharField(max_length=200, required=False, default='')
    message = serializers.CharField(max_length=5000)

    def _clean(self, value, field_name):
        """Reject malicious payloads, then strip HTML tags."""
        # Check raw input first — detect attacks before stripping evidence
        validate_safe_text(value, field_name)
        return sanitize_text(value)

    def validate_name(self, value):
        return self._clean(value, 'Name')

    def validate_organization(self, value):
        return self._clean(value, 'Organization') if value else value

    def validate_subject(self, value):
        return self._clean(value, 'Subject') if value else value

    def validate_message(self, value):
        return self._clean(value, 'Message')


@api_view(['POST'])
@permission_classes([AllowAny])
def contact_us(request):
    ser = ContactUsSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    email = ser.validated_data['email'].strip().lower()
    ip = get_client_ip(request)

    # Silent rate limit — always return 200 so attackers can't probe state
    rl = check_rate_limit('contact_us', email=email)
    if not rl.allowed:
        logger.info('contact_us rate-limited: email=%s ip=%s', email, ip)
        return Response({'detail': GENERIC_RESPONSE}, status=status.HTTP_200_OK)

    record_rate_limit('contact_us', email=email)

    # Publish notification event
    publisher = get_event_publisher()
    publisher.publish({
        'routing': ['notification'],
        'event_area': 'support',
        'event_type': 'contact_inquiry',
        'tenant_id': '',
        'user_id': '',
        'visitor_name': ser.validated_data['name'].strip(),
        'visitor_email': email,
        'organization': ser.validated_data.get('organization', '').strip(),
        'subject': ser.validated_data.get('subject', '').strip(),
        'message': ser.validated_data['message'].strip(),
        'ip_address': ip,
        'contact_email': getattr(settings, 'BC_CONTACT_EMAIL', ''),
        'timestamp': timezone.now().isoformat(),
        'version': '1',
    })

    logger.info('contact_us inquiry published: email=%s ip=%s', email, ip)
    return Response({'detail': GENERIC_RESPONSE}, status=status.HTTP_200_OK)
