"""Views for tenant member (user) management."""

import logging

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.mfa_service import disable_mfa, publish_mfa_event, verify_mfa
from accounts.models import User
from audit.models import AuditAction
from audit.service import log_audit
from authorization.models import TenantGroup
from events.publisher import get_event_publisher
from tenancy.invite_service import check_reinvite_cooldown, generate_invite_token
from tenancy.models import InviteStatus
from authorization.permissions import check_permission, get_tenant_member
from subscriptions.guard import SubscriptionLimitExceeded
from subscriptions.services import check_limit
from authorization.serializers_users import (
    TenantMemberCreateSerializer,
    TenantMemberDetailSerializer,
    TenantMemberListSerializer,
    TenantMemberUpdateSerializer,
)
from engagements.models import Engagement, EngagementStakeholder, StakeholderRole
from tenancy.models import TenantMember, TenantRole

logger = logging.getLogger("bytescop.admin")


def _get_member_or_404(request, member_id):
    """Fetch a TenantMember in the current tenant or return 404 response."""
    try:
        return TenantMember.objects.select_related("user").prefetch_related(
            "groups",
        ).get(pk=member_id, tenant=request.tenant), None
    except TenantMember.DoesNotExist:
        return None, Response(
            {"detail": "Member not found."},
            status=status.HTTP_404_NOT_FOUND,
        )


def _is_owner(member):
    """Check if the member is the tenant owner."""
    return member.role == TenantRole.OWNER


def _owner_count(tenant):
    """Count active owners in the tenant."""
    return TenantMember.objects.filter(
        tenant=tenant, role=TenantRole.OWNER, is_active=True,
    ).count()


def _serialize_member(member):
    """Serialize a single member for response."""
    return TenantMemberDetailSerializer(member).data


# ---------------------------------------------------------------------------
# Member list / create
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def member_list_create(request):
    """List or create tenant members."""
    if request.method == "GET":
        _, err = check_permission(request, ["user.view"])
        if err:
            return err

        members = (
            TenantMember.objects
            .filter(tenant=request.tenant)
            .select_related("user")
            .prefetch_related("groups")
            .order_by("-created_at")
        )
        serializer = TenantMemberListSerializer(members, many=True)
        return Response(serializer.data)

    # POST — create
    _, err = check_permission(request, ["user.create"])
    if err:
        return err

    # Subscription limit check
    result = check_limit('members_per_tenant', request.tenant)
    if not result.allowed:
        raise SubscriptionLimitExceeded(detail=result.message)

    serializer = TenantMemberCreateSerializer(
        data=request.data, context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # Validate email domain format
    from core.validators import validate_email_domain
    try:
        validate_email_domain(data["email"])
    except Exception as e:
        return Response(
            {"email": [str(e.message)]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Check if membership already exists
    email = data["email"].lower()
    existing_user = User.objects.filter(email__iexact=email).first()
    if existing_user:
        if TenantMember.objects.filter(
            tenant=request.tenant, user=existing_user,
        ).exists():
            return Response(
                {"detail": "This user is already a member of this tenant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    password = data.get("password")

    with transaction.atomic():
        # Create or reuse User
        if existing_user:
            user = existing_user
            user.first_name = data["first_name"]
            user.last_name = data["last_name"]
            user.phone = data.get("phone", "")
            user.timezone = data.get("timezone", "")
            if password:
                user.set_password(password)
                user.password_changed_at = timezone.now()
            user.email_verified = True
            update_fields = [
                "first_name", "last_name", "phone", "timezone",
                "email_verified",
            ]
            if password:
                update_fields += ["password", "password_changed_at"]
            user.save(update_fields=update_fields)
        else:
            user = User.objects.create_user(
                email=email,
                password=password,
                first_name=data["first_name"],
                last_name=data["last_name"],
                phone=data.get("phone", ""),
                timezone=data.get("timezone", ""),
                email_verified=True,
                password_changed_at=timezone.now() if password else None,
            )

        member = TenantMember.objects.create(
            tenant=request.tenant,
            user=user,
            role=TenantRole.MEMBER,
            invite_status=InviteStatus.ACCEPTED,
        )

        # Assign groups
        group_ids = data.get("group_ids", [])
        if group_ids:
            groups = TenantGroup.objects.filter(
                tenant=request.tenant, pk__in=group_ids,
            )
            member.groups.set(groups)

    # Re-fetch for serialization
    member = TenantMember.objects.select_related("user").prefetch_related(
        "groups",
    ).get(pk=member.pk)

    log_audit(
        request=request, action=AuditAction.CREATE,
        resource_type="member", resource_id=member.pk,
        resource_repr=f"Member: {email}",
        after=_serialize_member(member),
    )
    logger.info("Member created id=%s user=%s tenant=%s", member.pk, request.user.pk, request.tenant.slug)

    return Response(
        _serialize_member(member),
        status=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------------------------
# Member detail / update / delete
# ---------------------------------------------------------------------------


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def member_detail(request, member_id):
    """Retrieve, update, or delete a tenant member."""
    target, err = _get_member_or_404(request, member_id)
    if err:
        return err

    if request.method == "GET":
        _, err = check_permission(request, ["user.view"])
        if err:
            return err
        return Response(_serialize_member(target))

    if request.method == "PATCH":
        _, err = check_permission(request, ["user.update"])
        if err:
            return err

        caller = get_tenant_member(request)
        is_owner_target = _is_owner(target)

        # Non-owner cannot modify their own record (use /profile instead)
        if not is_owner_target and caller and caller.pk == target.pk:
            return Response(
                {"detail": "You cannot modify your own account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        before = _serialize_member(target)
        serializer = TenantMemberUpdateSerializer(
            data=request.data, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            if "first_name" in data:
                target.user.first_name = data["first_name"]
            if "last_name" in data:
                target.user.last_name = data["last_name"]
            if "phone" in data:
                target.user.phone = data["phone"]
            if "timezone" in data:
                target.user.timezone = data["timezone"]
            target.user.save()
            target.save()

            # Owner bypasses all permissions; group assignments are
            # meaningless and silently ignored.
            if "group_ids" in data and not is_owner_target:
                groups = TenantGroup.objects.filter(
                    tenant=request.tenant, pk__in=data["group_ids"],
                )
                target.groups.set(groups)

        # Re-fetch
        target = TenantMember.objects.select_related("user").prefetch_related(
            "groups",
        ).get(pk=target.pk)

        log_audit(
            request=request, action=AuditAction.UPDATE,
            resource_type="member", resource_id=target.pk,
            resource_repr=f"Member: {target.user.email}",
            before=before, after=_serialize_member(target),
        )
        logger.info("Member updated id=%s user=%s tenant=%s", target.pk, request.user.pk, request.tenant.slug)
        return Response(_serialize_member(target))

    # DELETE
    _, err = check_permission(request, ["user.delete"])
    if err:
        return err

    caller = get_tenant_member(request)

    if _is_owner(target):
        # Only an owner can delete another owner
        if not caller or caller.role != TenantRole.OWNER:
            return Response(
                {"detail": "Only an owner can remove another owner."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Cannot remove the last owner
        if _owner_count(request.tenant) <= 1:
            return Response(
                {"detail": "Cannot remove the last owner."},
                status=status.HTTP_403_FORBIDDEN,
            )

    if caller and caller.pk == target.pk:
        return Response(
            {"detail": "You cannot remove yourself."},
            status=status.HTTP_403_FORBIDDEN,
        )

    before = _serialize_member(target)
    mid, repr_str = target.pk, f"Member: {target.user.email}"
    removed_email = target.user.email
    removed_name = target.user.first_name
    target.delete()
    log_audit(
        request=request, action=AuditAction.DELETE,
        resource_type="member", resource_id=mid,
        resource_repr=repr_str, before=before,
    )
    get_event_publisher().publish({
        "routing": ["notification"],
        "event_area": "membership",
        "event_type": "member_removed",
        "tenant_id": str(request.tenant.pk),
        "user_id": str(request.user.pk),
        "email": removed_email,
        "name": removed_name,
        "tenant_name": request.tenant.name,
        "removed_by": request.user.get_full_name(),
        "version": "1",
    })
    logger.info("Member deleted id=%s user=%s tenant=%s", mid, request.user.pk, request.tenant.slug)
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Toggle active (lock/unlock)
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def member_toggle_active(request, member_id):
    """Lock or unlock a tenant member."""
    _, err = check_permission(request, ["user.update"])
    if err:
        return err

    target, err = _get_member_or_404(request, member_id)
    if err:
        return err

    caller = get_tenant_member(request)

    if _is_owner(target):
        # Only an owner can lock/unlock another owner
        if not caller or caller.role != TenantRole.OWNER:
            return Response(
                {"detail": "Only an owner can lock another owner."},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Cannot lock the last owner
        if target.is_active and _owner_count(request.tenant) <= 1:
            return Response(
                {"detail": "Cannot lock the last owner."},
                status=status.HTTP_403_FORBIDDEN,
            )

    if caller and caller.pk == target.pk:
        return Response(
            {"detail": "You cannot lock your own account."},
            status=status.HTTP_403_FORBIDDEN,
        )

    old_active = target.is_active
    target.is_active = not target.is_active
    target.save(update_fields=["is_active", "updated_at"])

    action_label = "unlocked" if target.is_active else "locked"
    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="member", resource_id=target.pk,
        resource_repr=f"Member {action_label}: {target.user.email}",
        before={"is_active": old_active},
        after={"is_active": target.is_active},
    )
    get_event_publisher().publish({
        "routing": ["notification"],
        "event_area": "membership",
        "event_type": f"member_{action_label}",
        "tenant_id": str(request.tenant.pk),
        "user_id": str(target.user.pk),
        "email": target.user.email,
        "name": target.user.first_name,
        "tenant_name": request.tenant.name,
        "version": "1",
    })
    logger.info("Member toggled active id=%s is_active=%s user=%s tenant=%s", target.pk, target.is_active, request.user.pk, request.tenant.slug)
    return Response({
        "id": str(target.pk),
        "is_active": target.is_active,
    })


# ---------------------------------------------------------------------------
# Reset MFA
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def member_reset_mfa(request, member_id):
    """Admin resets MFA for a tenant member."""
    _, err = check_permission(request, ["user.update"])
    if err:
        return err

    target, err = _get_member_or_404(request, member_id)
    if err:
        return err

    caller = get_tenant_member(request)

    if _is_owner(target):
        if not caller or caller.role != TenantRole.OWNER:
            return Response(
                {"detail": "Only an owner can reset another owner's MFA."},
                status=status.HTTP_403_FORBIDDEN,
            )

    if caller and caller.pk == target.pk:
        return Response(
            {"detail": "You cannot reset your own MFA here."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not target.user.mfa_enabled:
        return Response(
            {"detail": "This user does not have MFA enabled."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    disable_mfa(target.user)

    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="mfa", resource_id=target.pk,
        resource_repr=f"MFA reset by admin for {target.user.email}",
    )
    publish_mfa_event(
        "mfa_reset_by_admin", target.user, request.tenant,
        triggered_by="admin", admin_user=request.user,
    )
    logger.info("MFA reset member=%s user=%s tenant=%s", target.pk, request.user.pk, request.tenant.slug)
    return Response({"detail": "MFA has been reset."})


# ---------------------------------------------------------------------------
# Reset password
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def member_reset_password(request, member_id):
    """Admin resets password for a tenant member."""
    _, err = check_permission(request, ["user.update"])
    if err:
        return err

    target, err = _get_member_or_404(request, member_id)
    if err:
        return err

    caller = get_tenant_member(request)

    if _is_owner(target):
        if not caller or caller.role != TenantRole.OWNER:
            return Response(
                {"detail": "Only an owner can reset another owner's password."},
                status=status.HTTP_403_FORBIDDEN,
            )

    if caller and caller.pk == target.pk:
        return Response(
            {"detail": "Use your profile to change your own password."},
            status=status.HTTP_403_FORBIDDEN,
        )

    password = request.data.get("password", "")
    password_confirm = request.data.get("password_confirm", "")

    if not password:
        return Response(
            {"detail": "Password is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if password != password_confirm:
        return Response(
            {"detail": "Passwords do not match."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from account_settings.password_policy import validate_password_against_policy
    from django.core.exceptions import ValidationError
    try:
        validate_password_against_policy(password, request.tenant, user=target.user)
    except ValidationError as e:
        return Response(
            {"detail": e.messages[0] if e.messages else "Password does not meet policy."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    target.user.set_password(password)
    target.user.password_changed_at = timezone.now()
    target.user.save(update_fields=["password", "password_changed_at"])

    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="member", resource_id=target.pk,
        resource_repr=f"Password reset by admin for {target.user.email}",
    )
    logger.info("Password reset member=%s by=%s tenant=%s", target.pk, request.user.pk, request.tenant.slug)
    return Response({"detail": "Password has been reset."})


# ---------------------------------------------------------------------------
# Re-invite
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def member_reinvite(request, member_id):
    """Re-send an invitation to a pending tenant member."""
    _, err = check_permission(request, ["user.update"])
    if err:
        return err

    target, err = _get_member_or_404(request, member_id)
    if err:
        return err

    if target.invite_status != InviteStatus.PENDING:
        return Response(
            {"detail": "This user has already accepted their invitation."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not check_reinvite_cooldown(target):
        return Response(
            {"detail": "Please wait before sending another invitation."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    raw_token = generate_invite_token(target)

    get_event_publisher().publish({
        'routing': ['notification'],
        'event_area': 'membership',
        'event_type': 'member_created',
        'tenant_id': str(request.tenant.pk),
        'user_id': str(target.user.pk),
        'email': target.user.email,
        'name': target.user.get_full_name(),
        'invite_token': raw_token,
        'tenant_name': request.tenant.name,
        'version': '1',
    })

    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="member", resource_id=target.pk,
        resource_repr=f"Invite re-sent for {target.user.email}",
    )
    logger.info("Reinvite sent member=%s user=%s tenant=%s", target.pk, request.user.pk, request.tenant.slug)
    return Response({"detail": "Invitation re-sent."})


# ---------------------------------------------------------------------------
# Promote / Demote owner
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def member_promote(request, member_id):
    """Promote a member to owner. Requires caller to be owner with MFA."""
    caller = get_tenant_member(request)
    if not caller or caller.role != TenantRole.OWNER:
        return Response(
            {"detail": "Only an owner can promote members."},
            status=status.HTTP_403_FORBIDDEN,
        )

    target, err = _get_member_or_404(request, member_id)
    if err:
        return err

    # Validation
    if caller.pk == target.pk:
        return Response(
            {"detail": "You cannot promote yourself."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not target.is_active:
        return Response(
            {"detail": "Cannot promote an inactive member."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if target.invite_status != InviteStatus.ACCEPTED:
        return Response(
            {"detail": "Cannot promote a member who has not accepted their invitation."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if _is_owner(target):
        return Response(
            {"detail": "User is already an owner."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # MFA enforcement on caller
    if not request.user.mfa_enabled:
        return Response(
            {"detail": "You must enable MFA before promoting users."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    mfa_code = request.data.get("mfa_code", "")
    if not mfa_code:
        return Response(
            {"detail": "MFA code is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not verify_mfa(request.user, mfa_code):
        return Response(
            {"detail": "Invalid MFA code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        target.role = TenantRole.OWNER
        target.save(update_fields=["role", "updated_at"])

    # Re-fetch for serialization
    target = TenantMember.objects.select_related("user").prefetch_related(
        "groups",
    ).get(pk=target.pk)

    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="member", resource_id=target.pk,
        resource_repr=f"Promoted {target.user.email} to owner",
        before={"role": "member"}, after={"role": "owner"},
    )
    logger.info("Member promoted to owner id=%s user=%s tenant=%s", target.pk, request.user.pk, request.tenant.slug)

    get_event_publisher().publish({
        'routing': ['notification'],
        'event_area': 'membership',
        'event_type': 'member_promoted',
        'tenant_id': str(request.tenant.pk),
        'user_id': str(target.user.pk),
        'email': target.user.email,
        'name': target.user.get_full_name(),
        'tenant_name': request.tenant.name,
        'promoted_by_email': request.user.email,
        'promoted_by_name': request.user.get_full_name(),
        'version': '1',
    })

    return Response(_serialize_member(target))


# ---------------------------------------------------------------------------
# Member reference (lightweight, for mentions/dropdowns)
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def member_ref(request):
    """Lightweight member list for mention dropdowns — any authenticated user."""
    from accounts.avatar_service import get_avatar_url

    members = TenantMember.objects.filter(
        tenant=request.tenant, is_active=True,
    ).select_related("user").order_by("user__first_name", "user__last_name")

    data = []
    for m in members:
        u = m.user
        display_name = f"{u.first_name} {u.last_name}".strip() or u.email
        data.append({
            "id": str(u.id),
            "display_name": display_name,
            "email": u.email,
            "avatar_url": get_avatar_url(u),
        })
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def member_demote(request, member_id):
    """Demote an owner to member. Requires caller to be owner."""
    caller = get_tenant_member(request)
    if not caller or caller.role != TenantRole.OWNER:
        return Response(
            {"detail": "Only an owner can demote members."},
            status=status.HTTP_403_FORBIDDEN,
        )

    target, err = _get_member_or_404(request, member_id)
    if err:
        return err

    if caller.pk == target.pk:
        return Response(
            {"detail": "You cannot demote yourself."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if target.role != TenantRole.OWNER:
        return Response(
            {"detail": "User is not an owner."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if _owner_count(request.tenant) <= 1:
        return Response(
            {"detail": "Cannot demote the last owner."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        target = TenantMember.objects.select_for_update().get(pk=target.pk)
        target.role = TenantRole.MEMBER
        target.save(update_fields=["role", "updated_at"])

    # Re-fetch for serialization
    target = TenantMember.objects.select_related("user").prefetch_related(
        "groups",
    ).get(pk=target.pk)

    log_audit(
        request=request, action=AuditAction.UPDATE,
        resource_type="member", resource_id=target.pk,
        resource_repr=f"Demoted {target.user.email} to member",
        before={"role": "owner"}, after={"role": "member"},
    )
    logger.info("Member demoted to member id=%s user=%s tenant=%s", target.pk, request.user.pk, request.tenant.slug)

    get_event_publisher().publish({
        'routing': ['notification'],
        'event_area': 'membership',
        'event_type': 'member_demoted',
        'tenant_id': str(request.tenant.pk),
        'user_id': str(target.user.pk),
        'email': target.user.email,
        'name': target.user.get_full_name(),
        'tenant_name': request.tenant.name,
        'demoted_by_email': request.user.email,
        'demoted_by_name': request.user.get_full_name(),
        'version': '1',
    })

    return Response(_serialize_member(target))


# ---------------------------------------------------------------------------
# Member engagement assignments
# ---------------------------------------------------------------------------


def _serialize_assignment(sh):
    """Serialize a stakeholder entry for the member engagements endpoint."""
    eng = sh.engagement
    return {
        "id": str(sh.pk),
        "engagement_id": str(eng.pk),
        "engagement_name": eng.name,
        "client_name": eng.client.name if eng.client else eng.client_name or "",
        "engagement_status": eng.status,
        "role": sh.role,
        "created_at": sh.created_at.isoformat(),
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def member_engagements(request, member_id):
    """List or add engagement assignments for a member."""
    target, err = _get_member_or_404(request, member_id)
    if err:
        return err

    if request.method == "GET":
        _, err = check_permission(request, ["user.view"])
        if err:
            return err

        entries = (
            EngagementStakeholder.objects
            .filter(member=target)
            .select_related("engagement", "engagement__client")
            .order_by("-created_at")
        )
        return Response([_serialize_assignment(sh) for sh in entries])

    # POST — add to engagement
    _, err = check_permission(request, ["user.update", "engagement.update"])
    if err:
        return err

    engagement_id = request.data.get("engagement_id")
    role = request.data.get("role", StakeholderRole.OBSERVER)

    if not engagement_id:
        return Response(
            {"detail": "engagement_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if role not in StakeholderRole.values:
        return Response(
            {"detail": f"Invalid role. Choices: {', '.join(StakeholderRole.values)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        engagement = Engagement.objects.get(pk=engagement_id, tenant=request.tenant)
    except Engagement.DoesNotExist:
        return Response(
            {"detail": "Engagement not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if EngagementStakeholder.objects.filter(engagement=engagement, member=target).exists():
        return Response(
            {"detail": "Member is already assigned to this engagement."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    sh = EngagementStakeholder.objects.create(
        engagement=engagement,
        member=target,
        role=role,
        created_by=request.user,
    )

    log_audit(
        request=request, action=AuditAction.CREATE,
        resource_type="engagement_stakeholder", resource_id=sh.pk,
        resource_repr=f"Assigned {target.user.email} to {engagement.name} as {role}",
    )
    logger.info(
        "Stakeholder added member=%s engagement=%s role=%s user=%s tenant=%s",
        target.pk, engagement.pk, role, request.user.pk, request.tenant.slug,
    )

    sh = EngagementStakeholder.objects.select_related(
        "engagement", "engagement__client",
    ).get(pk=sh.pk)
    return Response(_serialize_assignment(sh), status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def member_engagement_remove(request, member_id, stakeholder_id):
    """Remove a member from an engagement."""
    _, err = check_permission(request, ["user.update", "engagement.update"])
    if err:
        return err

    target, err = _get_member_or_404(request, member_id)
    if err:
        return err

    try:
        sh = EngagementStakeholder.objects.select_related(
            "engagement",
        ).get(pk=stakeholder_id, member=target)
    except EngagementStakeholder.DoesNotExist:
        return Response(
            {"detail": "Assignment not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    eng_name = sh.engagement.name
    sh_id = sh.pk
    sh.delete()

    log_audit(
        request=request, action=AuditAction.DELETE,
        resource_type="engagement_stakeholder", resource_id=sh_id,
        resource_repr=f"Removed {target.user.email} from {eng_name}",
    )
    logger.info(
        "Stakeholder removed member=%s engagement=%s user=%s tenant=%s",
        target.pk, eng_name, request.user.pk, request.tenant.slug,
    )
    return Response(status=status.HTTP_204_NO_CONTENT)
