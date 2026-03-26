import logging
import math
import re
from collections import defaultdict

from django.db.models import Count
from django.db.models.functions import TruncDate
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from authorization.permissions import check_permission
from engagements.models import Engagement
from .models import AuditLog
from .serializers import AuditLogDetailSerializer, AuditLogListSerializer

logger = logging.getLogger("bytescop.audit")

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100

_ENG_RE = re.compile(
    r'/api/engagements/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/',
    re.I,
)


def _extract_engagement_id(request_path):
    """Extract engagement UUID from a request path, or None."""
    m = _ENG_RE.search(request_path or '')
    return m.group(1) if m else None


def _collect_engagement_ids(qs):
    """Scan request_path values and return a set of engagement UUID strings."""
    ids = set()
    for path in qs.values_list('request_path', flat=True):
        eid = _extract_engagement_id(path)
        if eid:
            ids.add(eid)
    return ids


def _build_actor_engagement_chart(qs, eng_names):
    """Build {actors, engagements, matrix} from a queryset, grouping by actor × engagement."""
    actor_eng = defaultdict(lambda: defaultdict(int))
    for email, path in qs.values_list('actor_email', 'request_path'):
        eid = _extract_engagement_id(path)
        if not eid:
            continue
        label = eng_names.get(eid, eid[:8])
        actor_eng[email][label] += 1

    actors = sorted(actor_eng.keys())
    eng_set = set()
    for counts in actor_eng.values():
        eng_set.update(counts.keys())
    engagements = sorted(eng_set)

    matrix = []
    for eng in engagements:
        matrix.append([actor_eng[a][eng] for a in actors])

    return {'actors': actors, 'engagements': engagements, 'matrix': matrix}


def _build_actor_action_chart(qs):
    """Build {actors, actions, matrix} via ORM aggregation of actor × action."""
    rows = qs.values('actor_email', 'action').annotate(count=Count('id'))
    actor_action = defaultdict(lambda: defaultdict(int))
    for row in rows:
        actor_action[row['actor_email']][row['action']] = row['count']

    actors = sorted(actor_action.keys())
    action_set = set()
    for counts in actor_action.values():
        action_set.update(counts.keys())
    actions = sorted(action_set)

    matrix = []
    for action in actions:
        matrix.append([actor_action[a][action] for a in actors])

    return {'actors': actors, 'actions': actions, 'matrix': matrix}


def _apply_audit_filters(qs, params):
    """Apply shared audit log filters to a queryset."""
    actor = params.get("actor")
    if actor:
        qs = qs.filter(actor_id=actor)

    action = params.get("action")
    if action:
        qs = qs.filter(action=action)

    resource_type = params.get("resource_type")
    if resource_type:
        qs = qs.filter(resource_type=resource_type)

    resource_id = params.get("resource_id")
    if resource_id:
        qs = qs.filter(resource_id=resource_id)

    date_from = params.get("date_from")
    if date_from:
        qs = qs.filter(timestamp__date__gte=date_from)

    date_to = params.get("date_to")
    if date_to:
        qs = qs.filter(timestamp__date__lte=date_to)

    engagement = params.get("engagement")
    if engagement:
        qs = qs.filter(request_path__contains=f'/api/engagements/{engagement}/')

    ip_address = params.get("ip_address")
    if ip_address:
        qs = qs.filter(ip_address=ip_address)

    return qs


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def audit_list(request):
    """List audit log entries with page-based pagination and filtering."""
    _, err = check_permission(request, ["audit.view"])
    if err:
        return err

    qs = _apply_audit_filters(
        AuditLog.objects.filter(tenant=request.tenant),
        request.query_params,
    )

    # Page-based pagination
    page_size = min(
        max(int(request.query_params.get("page_size", DEFAULT_PAGE_SIZE)), 1),
        MAX_PAGE_SIZE,
    )
    count = qs.count()
    num_pages = max(math.ceil(count / page_size), 1)
    page = max(int(request.query_params.get("page", 1)), 1)
    page = min(page, num_pages)

    offset = (page - 1) * page_size
    entries = list(qs.order_by("-id")[offset:offset + page_size])

    serializer = AuditLogListSerializer(entries, many=True)
    return Response({
        "results": serializer.data,
        "count": count,
        "page": page,
        "page_size": page_size,
        "num_pages": num_pages,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def audit_detail(request, audit_id):
    """Retrieve a single audit log entry."""
    _, err = check_permission(request, ["audit.view"])
    if err:
        return err

    try:
        entry = AuditLog.objects.get(pk=audit_id, tenant=request.tenant)
    except AuditLog.DoesNotExist:
        return Response(
            {"detail": "Audit log entry not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = AuditLogDetailSerializer(entry)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def audit_summary(request):
    """Aggregate summary of audit log entries (respects the same filters as list)."""
    _, err = check_permission(request, ["audit.view"])
    if err:
        return err

    qs = _apply_audit_filters(
        AuditLog.objects.filter(tenant=request.tenant),
        request.query_params,
    )

    total = qs.count()

    by_action = {
        row["action"]: row["count"]
        for row in qs.values("action").annotate(count=Count("id"))
    }

    by_resource_type = {
        row["resource_type"]: row["count"]
        for row in qs.values("resource_type").annotate(count=Count("id"))
    }

    by_actor = list(
        qs.exclude(actor_email="")
        .values("actor_email")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )

    # Pivot by_date: [{date, create, update, ...}]
    date_rows = (
        qs.annotate(date=TruncDate("timestamp"))
        .values("date", "action")
        .annotate(count=Count("id"))
        .order_by("date")
    )
    date_map = defaultdict(lambda: defaultdict(int))
    for row in date_rows:
        date_map[str(row["date"])][row["action"]] = row["count"]

    by_date = [
        {"date": d, **counts}
        for d, counts in sorted(date_map.items())
    ]

    # -- Chart 1: Findings created, grouped by user & engagement --
    findings_created_qs = qs.filter(resource_type='finding', action='create')

    # -- Chart 2: Disruptive deletes, grouped by user & engagement --
    disruptive_qs = qs.filter(action='delete', resource_type__in=['finding', 'scope', 'sow'])

    # Batch-lookup engagement names for charts 1 & 2
    eng_ids = _collect_engagement_ids(findings_created_qs) | _collect_engagement_ids(disruptive_qs)
    eng_names = {
        str(pk): name
        for pk, name in Engagement.objects.filter(
            tenant=request.tenant, pk__in=eng_ids,
        ).values_list('pk', 'name')
    } if eng_ids else {}

    eng_id_map = {name: str(pk) for pk, name in eng_names.items()}

    findings_by_user_eng = _build_actor_engagement_chart(findings_created_qs, eng_names)
    disruptive_by_user_eng = _build_actor_engagement_chart(disruptive_qs, eng_names)

    # -- Chart 3: Actions on engagements by user --
    engagement_actions_qs = qs.filter(resource_type='engagement')
    engagement_actions_by_user = _build_actor_action_chart(engagement_actions_qs)

    # -- Chart 4: Actions on findings by user --
    finding_actions_qs = qs.filter(resource_type='finding')
    finding_actions_by_user = _build_actor_action_chart(finding_actions_qs)

    # -- Chart 5: Actions by IP address (top 15) --
    ip_rows = list(
        qs.filter(ip_address__isnull=False)
        .values('ip_address')
        .annotate(count=Count('id'))
        .order_by('-count')[:15]
    )
    actions_by_ip = {
        'ips': [r['ip_address'] for r in ip_rows],
        'counts': [r['count'] for r in ip_rows],
    }

    return Response({
        "total": total,
        "by_action": by_action,
        "by_resource_type": by_resource_type,
        "by_actor": by_actor,
        "by_date": by_date,
        "findings_by_user_eng": findings_by_user_eng,
        "disruptive_by_user_eng": disruptive_by_user_eng,
        "engagement_actions_by_user": engagement_actions_by_user,
        "finding_actions_by_user": finding_actions_by_user,
        "actions_by_ip": actions_by_ip,
        "eng_id_map": eng_id_map,
    })
