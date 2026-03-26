import logging

from django.db.models import Count
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.models import AuditAction
from audit.service import log_audit
from authorization.models import Permission, TenantGroup
from authorization.permissions import (
    TenantPermission,
    check_permission,
    get_tenant_member,
    get_user_permissions,
)
from authorization.serializers import (
    GroupMemberAddSerializer,
    PermissionSerializer,
    TenantGroupCreateSerializer,
    TenantGroupDetailSerializer,
    TenantGroupListSerializer,
    TenantGroupUpdateSerializer,
)
from tenancy.models import TenantMember, TenantRole

logger = logging.getLogger("bytescop.admin")


def _check_group_permission(request, required_codenames):
    """Check if user has the required permissions or is root. Returns (member, error_response)."""
    return check_permission(request, required_codenames)


# ---------------------------------------------------------------------------
# Permissions listing
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def permission_list(request):
    """List all available permissions. Any authenticated user can see these."""
    perms = Permission.objects.all()
    serializer = PermissionSerializer(perms, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_permissions(request):
    """Return the current user's effective permissions and groups."""
    member = get_tenant_member(request)
    if member is None:
        return Response(
            {"is_root": False, "permissions": [], "groups": []},
        )

    is_root = member.role == TenantRole.OWNER

    if is_root:
        perms = list(Permission.objects.values_list("codename", flat=True))
    else:
        perms = sorted(get_user_permissions(member))

    groups = [
        {"id": str(g.id), "name": g.name, "is_default": g.is_default}
        for g in member.groups.all()
    ]

    return Response({
        "is_root": is_root,
        "permissions": perms,
        "groups": groups,
    })


# ---------------------------------------------------------------------------
# Group CRUD
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def group_list_create(request):
    """List or create tenant groups."""
    if request.method == "GET":
        member, err = _check_group_permission(request, ["group.view"])
        if err:
            return err

        groups = (
            TenantGroup.objects
            .filter(tenant=request.tenant)
            .annotate(member_count=Count("members"))
        )
        serializer = TenantGroupListSerializer(groups, many=True)
        return Response(serializer.data)

    # POST
    member, err = _check_group_permission(request, ["group.create"])
    if err:
        return err

    serializer = TenantGroupCreateSerializer(
        data=request.data, context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    group = serializer.save()
    log_audit(
        request=request, action=AuditAction.CREATE,
        resource_type="group", resource_id=group.pk,
        resource_repr=f"Group: {group.name}",
        after=TenantGroupDetailSerializer(group).data,
    )
    logger.info("Group created id=%s name=%s user=%s tenant=%s", group.pk, group.name, request.user.pk, request.tenant.slug)
    detail = TenantGroupDetailSerializer(group)
    return Response(detail.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def group_detail(request, group_id):
    """Retrieve, update, or delete a tenant group."""
    try:
        group = TenantGroup.objects.get(pk=group_id, tenant=request.tenant)
    except TenantGroup.DoesNotExist:
        return Response(
            {"detail": "Group not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        member, err = _check_group_permission(request, ["group.view"])
        if err:
            return err
        serializer = TenantGroupDetailSerializer(group)
        return Response(serializer.data)

    if request.method == "PATCH":
        member, err = _check_group_permission(request, ["group.update"])
        if err:
            return err

        if group.is_default:
            return Response(
                {"detail": "Default groups cannot be modified."},
                status=status.HTTP_403_FORBIDDEN,
            )

        before = TenantGroupDetailSerializer(group).data
        serializer = TenantGroupUpdateSerializer(
            group, data=request.data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit(
            request=request, action=AuditAction.UPDATE,
            resource_type="group", resource_id=group.pk,
            resource_repr=f"Group: {group.name}",
            before=before, after=TenantGroupDetailSerializer(group).data,
        )
        logger.info("Group updated id=%s name=%s user=%s tenant=%s", group.pk, group.name, request.user.pk, request.tenant.slug)
        detail = TenantGroupDetailSerializer(group)
        return Response(detail.data)

    # DELETE
    member, err = _check_group_permission(request, ["group.delete"])
    if err:
        return err

    if group.is_default:
        return Response(
            {"detail": "Default groups cannot be deleted."},
            status=status.HTTP_403_FORBIDDEN,
        )

    before = TenantGroupDetailSerializer(group).data
    gid, gname = group.pk, group.name
    group.delete()
    log_audit(
        request=request, action=AuditAction.DELETE,
        resource_type="group", resource_id=gid,
        resource_repr=f"Group: {gname}",
        before=before,
    )
    logger.info("Group deleted id=%s name=%s user=%s tenant=%s", gid, gname, request.user.pk, request.tenant.slug)
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Group members
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def group_member_add(request, group_id):
    """Add a tenant member to a group."""
    member, err = _check_group_permission(request, ["group.update"])
    if err:
        return err

    try:
        group = TenantGroup.objects.get(pk=group_id, tenant=request.tenant)
    except TenantGroup.DoesNotExist:
        return Response(
            {"detail": "Group not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = GroupMemberAddSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        target_member = TenantMember.objects.get(
            pk=serializer.validated_data["member_id"],
            tenant=request.tenant,
            is_active=True,
        )
    except TenantMember.DoesNotExist:
        return Response(
            {"detail": "Member not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    target_member.groups.add(group)
    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="group", resource_id=group.pk,
        resource_repr=f"Added member {target_member.user.email} to group {group.name}",
    )
    logger.info("Member added to group group=%s member=%s user=%s tenant=%s", group.pk, target_member.pk, request.user.pk, request.tenant.slug)
    return Response({"detail": "Member added to group."}, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def group_member_remove(request, group_id, member_id):
    """Remove a tenant member from a group."""
    member, err = _check_group_permission(request, ["group.update"])
    if err:
        return err

    try:
        group = TenantGroup.objects.get(pk=group_id, tenant=request.tenant)
    except TenantGroup.DoesNotExist:
        return Response(
            {"detail": "Group not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        target_member = TenantMember.objects.get(
            pk=member_id, tenant=request.tenant,
        )
    except TenantMember.DoesNotExist:
        return Response(
            {"detail": "Member not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    target_member.groups.remove(group)
    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="group", resource_id=group.pk,
        resource_repr=f"Removed member {target_member.user.email} from group {group.name}",
    )
    logger.info("Member removed from group group=%s member=%s user=%s tenant=%s", group.pk, target_member.pk, request.user.pk, request.tenant.slug)
    return Response(status=status.HTTP_204_NO_CONTENT)
