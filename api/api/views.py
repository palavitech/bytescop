from rest_framework import status as http_status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from authorization.permissions import get_tenant_member, get_user_permissions
from authorization.scoping import get_visible_engagement_ids
from engagements.models import EngagementStakeholder
from tenancy.models import TenantRole

from .dashboard import get_collaborator_alerts, get_dashboard_alerts, get_dashboard_widgets
from .models import DashboardLayout


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard(request):
    """Return permission-filtered dashboard widgets for the current user.

    Accepts optional ``?view=analyst|collaborator`` query parameter to force
    a specific dashboard persona for users who have full visibility but want
    to see a scoped view.
    """
    member = get_tenant_member(request)
    if member is None:
        return Response(
            {"detail": "Tenant membership required."},
            status=http_status.HTTP_403_FORBIDDEN,
        )

    if member.role == TenantRole.OWNER:
        user_perms = "__all__"
    else:
        user_perms = get_user_permissions(member)

    # None = see all, set() = scoped to those engagement IDs
    engagement_ids = get_visible_engagement_ids(request)

    # Allow full-visibility users to opt into a scoped view
    view_param = request.query_params.get("view", "").lower()
    if view_param in ("analyst", "collaborator") and engagement_ids is None:
        engagement_ids = set(
            EngagementStakeholder.objects.filter(member=member)
            .values_list("engagement_id", flat=True)
        )

    effective_view = view_param if view_param in ("analyst", "collaborator") else None

    # Check for saved layout
    layout_view_key = effective_view or 'default'
    saved_layout = None
    try:
        dl = DashboardLayout.objects.get(
            tenant=request.tenant, user=request.user, view=layout_view_key,
        )
        saved_layout = dl.widgets
    except DashboardLayout.DoesNotExist:
        pass

    widgets = get_dashboard_widgets(
        request.tenant, user_perms, engagement_ids,
        user=request.user, view=effective_view,
        layout=saved_layout,
    )

    if effective_view == "collaborator":
        alerts = get_collaborator_alerts(request.tenant, engagement_ids)
    else:
        alerts = get_dashboard_alerts(request.tenant, member)

    return Response({
        "widgets": widgets,
        "alerts": alerts,
        "layout": {"customized": saved_layout is not None},
    })
