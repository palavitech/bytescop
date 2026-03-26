"""Dashboard layout & catalog API views."""

from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.service import log_audit
from authorization.permissions import get_tenant_member, get_user_permissions
from authorization.scoping import get_visible_engagement_ids
from engagements.models import EngagementStakeholder
from tenancy.models import TenantRole

from .dashboard import (
    COL_SPAN_BY_TYPE,
    GRID_COLS,
    REGISTRY_MAP,
    SIZE_PRESETS,
    _is_legacy_layout,
    get_widget_catalog,
    migrate_legacy_layout,
)
from .models import DashboardLayout


def _resolve_view(request, member):
    """Resolve the effective view string and engagement_ids from the request."""
    engagement_ids = get_visible_engagement_ids(request)
    view_param = request.query_params.get('view', '').lower()

    if view_param in ('analyst', 'collaborator') and engagement_ids is None:
        engagement_ids = set(
            EngagementStakeholder.objects.filter(member=member)
            .values_list('engagement_id', flat=True)
        )

    effective_view = view_param if view_param in ('analyst', 'collaborator') else None
    return effective_view, engagement_ids


def _get_perms(member):
    if member.role == TenantRole.OWNER:
        return '__all__'
    return get_user_permissions(member)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_catalog(request):
    """GET /api/dashboard/catalog/ — widget catalog (metadata only)."""
    member = get_tenant_member(request)
    if member is None:
        return Response(
            {'detail': 'Tenant membership required.'},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    user_perms = _get_perms(member)
    effective_view, _ = _resolve_view(request, member)

    # Map effective_view to registry key
    view_key = effective_view or 'default'
    catalog = get_widget_catalog(user_perms, view=view_key)

    return Response({'widgets': catalog})


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def dashboard_layout(request):
    """GET/PUT/DELETE /api/dashboard/layout/ — user's saved layout."""
    member = get_tenant_member(request)
    if member is None:
        return Response(
            {'detail': 'Tenant membership required.'},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    user_perms = _get_perms(member)
    effective_view, _ = _resolve_view(request, member)
    view_key = effective_view or 'default'

    if request.method == 'GET':
        return _get_layout(request, view_key)
    elif request.method == 'PUT':
        return _put_layout(request, member, user_perms, view_key)
    else:
        return _delete_layout(request, view_key)


def _get_layout(request, view_key):
    """Return the user's saved layout, or null if none."""
    try:
        layout = DashboardLayout.objects.get(
            tenant=request.tenant, user=request.user, view=view_key,
        )
        widgets = layout.widgets

        # Lazy migration: convert legacy position-based layouts to coordinate-based
        if widgets and _is_legacy_layout(widgets):
            registry = REGISTRY_MAP.get(view_key, REGISTRY_MAP['default'])
            widgets = migrate_legacy_layout(widgets, registry)
            layout.widgets = widgets
            layout.save(update_fields=['widgets'])

        return Response({
            'view': layout.view,
            'widgets': widgets,
            'customized': True,
        })
    except DashboardLayout.DoesNotExist:
        return Response({
            'view': view_key,
            'widgets': None,
            'customized': False,
        })


def _put_layout(request, member, user_perms, view_key):
    """Save a layout — validates widget_ids, permissions, coordinates."""
    widgets = request.data.get('widgets')
    if not isinstance(widgets, list):
        return Response(
            {'detail': 'widgets must be a list.'},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    registry = REGISTRY_MAP.get(view_key, REGISTRY_MAP['default'])
    reg_by_id = {wd.id: wd for wd in registry}

    validated = []
    seen_ids = set()
    occupancy = set()  # set of (col, row) cells occupied
    for i, item in enumerate(widgets):
        widget_id = item.get('widget_id', '')
        col = item.get('col')
        row = item.get('row')

        if not widget_id:
            return Response(
                {'detail': f'Item {i}: widget_id is required.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        if widget_id in seen_ids:
            return Response(
                {'detail': f'Item {i}: duplicate widget_id "{widget_id}".'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        seen_ids.add(widget_id)

        wd = reg_by_id.get(widget_id)
        if wd is None:
            return Response(
                {'detail': f'Item {i}: unknown widget_id "{widget_id}".'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        # Permission check
        if user_perms != '__all__':
            if not all(p in user_perms for p in wd.required_permissions):
                return Response(
                    {'detail': f'Item {i}: no permission for widget "{widget_id}".'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )

        # Coordinate validation
        if not isinstance(col, int) or col < 0 or col > 5:
            return Response(
                {'detail': f'Item {i}: col must be an integer 0..5.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(row, int) or row < 0:
            return Response(
                {'detail': f'Item {i}: row must be a non-negative integer.'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        col_span = COL_SPAN_BY_TYPE.get(wd.widget_type, 1)

        # Overflow check
        if col + col_span > GRID_COLS:
            return Response(
                {'detail': f'Item {i}: widget "{widget_id}" overflows grid (col={col}, col_span={col_span}).'},
                status=http_status.HTTP_400_BAD_REQUEST,
            )

        # Overlap check — mark cells occupied by this widget
        widget_cells = set()
        for c in range(col, col + col_span):
            cell = (c, row)
            if cell in occupancy:
                return Response(
                    {'detail': f'Item {i}: widget "{widget_id}" overlaps another widget at col={c}, row={row}.'},
                    status=http_status.HTTP_400_BAD_REQUEST,
                )
            widget_cells.add(cell)
        occupancy.update(widget_cells)

        validated.append({
            'widget_id': widget_id,
            'col': col,
            'row': row,
        })

    layout, created = DashboardLayout.objects.update_or_create(
        tenant=request.tenant, user=request.user, view=view_key,
        defaults={'widgets': validated},
    )

    log_audit(
        request,
        action='update',
        resource_type='dashboard_layout',
        resource_id=str(layout.pk),
        resource_repr=f'Dashboard layout ({view_key})',
        after={'view': view_key, 'widgets': validated},
    )

    return Response({
        'view': layout.view,
        'widgets': layout.widgets,
        'customized': True,
    })


def _delete_layout(request, view_key):
    """Reset to default (delete saved layout)."""
    deleted, _ = DashboardLayout.objects.filter(
        tenant=request.tenant, user=request.user, view=view_key,
    ).delete()

    if deleted:
        log_audit(
            request,
            action='delete',
            resource_type='dashboard_layout',
            resource_repr=f'Dashboard layout ({view_key})',
        )

    return Response(status=http_status.HTTP_204_NO_CONTENT)
