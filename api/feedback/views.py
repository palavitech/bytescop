"""Feature request endpoint for authenticated users.

Validates input, saves to DB, rate-limits by user, and publishes
a notification event to SNS.
"""

import logging

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from authorization.permissions import check_permission
from core.rate_limit.helpers import (
    check_rate_limit,
    get_client_ip,
    rate_limit_429,
    record_rate_limit,
)
from core.validators import sanitize_text, validate_safe_text
from events.publisher import get_event_publisher

from .models import FeatureRequest, FeatureRequestCategory

logger = logging.getLogger('bytescop.api')


class FeatureRequestSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=FeatureRequestCategory.choices)
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(max_length=5000)

    def _clean(self, value, field_name):
        validate_safe_text(value, field_name)
        return sanitize_text(value)

    def validate_title(self, value):
        return self._clean(value, 'Title')

    def validate_description(self, value):
        return self._clean(value, 'Description')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_feature_request(request):
    _, err = check_permission(request, ['feature_request.create'])
    if err:
        return err

    ser = FeatureRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    ip = get_client_ip(request)
    user_id = str(request.user.id)

    rl = check_rate_limit('feature_request', user_id=user_id, ip=ip)
    if not rl.allowed:
        return rate_limit_429(rl)

    record_rate_limit('feature_request', user_id=user_id, ip=ip)

    fr = FeatureRequest.objects.create(
        tenant=request.tenant,
        user=request.user,
        category=ser.validated_data['category'],
        title=ser.validated_data['title'],
        description=ser.validated_data['description'],
    )

    publisher = get_event_publisher()
    publisher.publish({
        'routing': ['notification'],
        'event_area': 'feedback',
        'event_type': 'feature_request_created',
        'tenant_id': str(request.tenant.id),
        'user_id': user_id,
        'user_email': request.user.email,
        'user_name': request.user.get_full_name() or request.user.email,
        'tenant_name': request.tenant.name,
        'feature_request_id': str(fr.id),
        'category': fr.category,
        'title': fr.title,
        'description': fr.description,
        'contact_email': getattr(settings, 'BC_CONTACT_EMAIL', ''),
        'timestamp': timezone.now().isoformat(),
        'version': '1',
    })

    logger.info(
        'feature_request created: id=%s tenant=%s user=%s category=%s',
        fr.id, request.tenant.id, user_id, fr.category,
    )
    return Response(
        {'detail': 'Feature request submitted. Thank you!'},
        status=status.HTTP_201_CREATED,
    )
