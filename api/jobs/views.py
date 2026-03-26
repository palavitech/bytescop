"""Background job API views — list and retrieve jobs for the current tenant."""

import logging

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from jobs.service import get_job_service

logger = logging.getLogger('bytescop.jobs')


def _serialize_job(job: dict) -> dict:
    """Prepare job dict for JSON response (strip internal fields)."""
    if not job:
        return {}
    result = {}
    for key, val in job.items():
        if key == 'params':
            # Don't expose params (may contain sensitive data like password hash)
            continue
        result[key] = val
    return result


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def job_list(request):
    """GET /api/jobs/ — list jobs for the current tenant.

    Query params:
        job_type — filter by job type (e.g. 'export_data')
        status   — filter by status (PENDING, PROCESSING, READY, FAILED)
        limit    — max results (default 20, max 100)
    """
    tenant = request.tenant
    if not tenant:
        return Response(
            {'detail': 'Tenant context required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    job_type = request.query_params.get('job_type')
    job_status = request.query_params.get('status')
    try:
        limit = min(int(request.query_params.get('limit', 20)), 100)
    except (ValueError, TypeError):
        limit = 20

    svc = get_job_service()
    jobs = svc.list_jobs(
        tenant_id=str(tenant.id),
        job_type=job_type,
        status=job_status,
        limit=limit,
    )

    # Also mark stale jobs while we're at it
    svc.mark_stale_jobs(str(tenant.id))

    return Response([_serialize_job(j) for j in jobs])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def job_detail(request, job_id):
    """GET /api/jobs/<job_id>/ — retrieve a single job."""
    tenant = request.tenant
    if not tenant:
        return Response(
            {'detail': 'Tenant context required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    svc = get_job_service()
    job = svc.get_job(
        tenant_id=str(tenant.id),
        job_id=str(job_id),
    )

    if not job:
        return Response(
            {'detail': 'Job not found.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(_serialize_job(job))
