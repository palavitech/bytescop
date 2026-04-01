import logging

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ClassificationEntry

logger = logging.getLogger("bytescop.findings")


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def classification_list(request):
    """Return classification reference data, optionally filtered by type.

    Query params:
        type — one of 'assessment_area', 'owasp', 'cwe'
    """
    entry_type = request.query_params.get('type', '')
    qs = ClassificationEntry.objects.all()
    if entry_type:
        qs = qs.filter(entry_type=entry_type)
    data = list(qs.values('entry_type', 'code', 'name', 'description'))
    logger.debug("classification_list: type=%s count=%d", entry_type or '*', len(data))
    return Response(data)
