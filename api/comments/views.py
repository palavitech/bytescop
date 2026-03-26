"""Comment views — reusable across target types.

URL factories in comments/urls.py wire these to specific target types.
Two-layer permission: resource view permission + comment-specific permission.
"""

import logging
from collections import defaultdict

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.avatar_service import get_avatar_url
from authorization.permissions import check_permission
from events.publisher import get_event_publisher
from .mentions import extract_mention_user_ids, strip_mention_syntax, validate_mentions
from .models import Comment
from .serializers import CommentCreateSerializer, CommentSerializer
from .target_resolver import get_resource_permission_prefix, get_target_label, resolve_target

logger = logging.getLogger("bytescop.comments")


def _check_resource_and_comment_perm(request, target_type, comment_perm):
    """Two-layer permission check: resource view + comment permission.

    Returns (member, error_response). If error_response is set, return it.
    """
    resource_prefix = get_resource_permission_prefix(target_type)
    if resource_prefix is None:
        return None, Response(
            {"detail": "Invalid target type."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Layer 1: must be able to view the parent resource
    member, err = check_permission(request, [f"{resource_prefix}.view"])
    if err:
        return None, err

    # Layer 2: must have the comment-specific permission
    _, err = check_permission(request, [comment_perm])
    if err:
        return None, err

    return member, None


def _get_comments_with_replies(tenant, target_type, target_id):
    """Load top-level comments with prefetched replies."""
    all_comments = list(
        Comment.objects.filter(
            tenant=tenant,
            target_type=target_type,
            target_id=target_id,
        ).select_related("created_by").order_by("created_at")
    )

    # Separate top-level and replies
    top_level = []
    replies_by_parent = defaultdict(list)
    for c in all_comments:
        if c.parent_id is None:
            top_level.append(c)
        else:
            replies_by_parent[c.parent_id].append(c)

    # Attach replies to parents
    for c in top_level:
        c._prefetched_replies = replies_by_parent.get(c.pk, [])

    return top_level


def _publish_mention_events(request, comment, target_type, target_id, target_obj):
    """Extract mentions and publish notification events for each."""
    user_ids = extract_mention_user_ids(comment.body_md)
    if not user_ids:
        return

    valid_ids = validate_mentions(request.tenant, user_ids)
    # Don't notify the author about self-mentions
    valid_ids = [uid for uid in valid_ids if uid != str(request.user.id)]
    if not valid_ids:
        return

    from accounts.models import User
    mentioned_users = User.objects.filter(id__in=valid_ids).only(
        "id", "email", "first_name", "last_name",
    )

    publisher = get_event_publisher()
    author_name = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.email
    target_label = get_target_label(target_type, target_obj)
    preview = strip_mention_syntax(comment.body_md)[:200]

    for user in mentioned_users:
        publisher.publish({
            "routing": ["notification"],
            "event_area": "comments",
            "event_type": "mention",
            "tenant_id": str(request.tenant.id),
            "tenant_name": request.tenant.name,
            "user_id": str(user.id),
            "email": user.email,
            "name": f"{user.first_name} {user.last_name}".strip() or user.email,
            "mentioned_by_name": author_name,
            "target_type": target_type,
            "target_id": str(target_id),
            "target_label": target_label,
            "comment_id": str(comment.pk),
            "comment_preview": preview,
            "version": "1",
        })

    logger.info(
        "Published %d mention notifications comment=%s target=%s:%s tenant=%s",
        len(list(mentioned_users)), comment.pk, target_type, target_id, request.tenant.slug,
    )


def _publish_reply_events(request, reply, parent, target_type, target_id, target_obj):
    """Notify participants of the parent comment when a reply is posted.

    Participants = parent author + users mentioned in the parent body.
    Excludes the reply author (no self-notification) and anyone already
    notified via _publish_mention_events (mentioned in the reply body).
    """
    from accounts.models import User

    # Collect participant user IDs: parent author + parent's mentioned users
    participant_ids = {str(parent.created_by_id)}
    parent_mention_ids = extract_mention_user_ids(parent.body_md)
    if parent_mention_ids:
        valid_parent_mentions = validate_mentions(request.tenant, parent_mention_ids)
        participant_ids.update(valid_parent_mentions)

    # Exclude reply author
    participant_ids.discard(str(request.user.id))

    # Exclude users already mentioned in the reply (they get a mention email)
    reply_mention_ids = extract_mention_user_ids(reply.body_md)
    if reply_mention_ids:
        valid_reply_mentions = validate_mentions(request.tenant, reply_mention_ids)
        participant_ids -= set(valid_reply_mentions)

    if not participant_ids:
        return

    participants = User.objects.filter(id__in=participant_ids).only(
        "id", "email", "first_name", "last_name",
    )

    publisher = get_event_publisher()
    author_name = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.email
    target_label = get_target_label(target_type, target_obj)
    preview = strip_mention_syntax(reply.body_md)[:200]

    for user in participants:
        publisher.publish({
            "routing": ["notification"],
            "event_area": "comments",
            "event_type": "reply",
            "tenant_id": str(request.tenant.id),
            "tenant_name": request.tenant.name,
            "user_id": str(user.id),
            "email": user.email,
            "name": f"{user.first_name} {user.last_name}".strip() or user.email,
            "reply_by_name": author_name,
            "target_type": target_type,
            "target_id": str(target_id),
            "target_label": target_label,
            "comment_id": str(parent.pk),
            "comment_preview": preview,
            "version": "1",
        })

    logger.info(
        "Published %d reply notifications reply=%s parent=%s target=%s:%s tenant=%s",
        len(list(participants)), reply.pk, parent.pk, target_type, target_id, request.tenant.slug,
    )


# ---------------------------------------------------------------------------
# View factory — creates view functions bound to a specific target_type
# ---------------------------------------------------------------------------

def make_comment_list_create_view(target_type: str):
    """Return a view function for GET (list) and POST (create) on comments."""

    @api_view(["GET", "POST"])
    @permission_classes([IsAuthenticated])
    def comment_list_create(request, pk):
        if request.method == "GET":
            return _comment_list(request, pk, target_type)
        return _comment_create(request, pk, target_type)

    return comment_list_create


def make_comment_reply_view(target_type: str):
    """Return a view function for POST reply to a comment."""

    @api_view(["POST"])
    @permission_classes([IsAuthenticated])
    def comment_reply(request, pk, comment_id):
        return _comment_reply(request, pk, comment_id, target_type)

    return comment_reply


def make_comment_detail_view(target_type: str):
    """Return a view function for PATCH (edit) and DELETE on a comment."""

    @api_view(["PATCH", "DELETE"])
    @permission_classes([IsAuthenticated])
    def comment_detail(request, pk, comment_id):
        if request.method == "PATCH":
            return _comment_update(request, pk, comment_id, target_type)
        return _comment_delete(request, pk, comment_id, target_type)

    return comment_detail


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

def _comment_list(request, pk, target_type):
    """List comments for a target entity."""
    resource_prefix = get_resource_permission_prefix(target_type)
    if resource_prefix is None:
        return Response({"detail": "Invalid target type."}, status=status.HTTP_400_BAD_REQUEST)

    _, err = check_permission(request, [f"{resource_prefix}.view"])
    if err:
        return err

    target_obj = resolve_target(request.tenant, target_type, pk)
    if target_obj is None:
        return Response({"detail": "Target not found."}, status=status.HTTP_404_NOT_FOUND)

    comments = _get_comments_with_replies(request.tenant, target_type, pk)
    serializer = CommentSerializer(comments, many=True, context={"request": request})
    return Response(serializer.data)


def _comment_create(request, pk, target_type):
    """Create a top-level comment."""
    _, err = _check_resource_and_comment_perm(request, target_type, "comment.create")
    if err:
        return err

    target_obj = resolve_target(request.tenant, target_type, pk)
    if target_obj is None:
        return Response({"detail": "Target not found."}, status=status.HTTP_404_NOT_FOUND)

    serializer = CommentCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    comment = Comment.objects.create(
        tenant=request.tenant,
        target_type=target_type,
        target_id=pk,
        body_md=serializer.validated_data["body_md"],
        created_by=request.user,
    )

    _publish_mention_events(request, comment, target_type, pk, target_obj)

    logger.info(
        "Comment created id=%s target=%s:%s user=%s tenant=%s",
        comment.pk, target_type, pk, request.user.pk, request.tenant.slug,
    )

    comment._prefetched_replies = []
    return Response(
        CommentSerializer(comment, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


def _comment_reply(request, pk, comment_id, target_type):
    """Reply to a comment (1-level max)."""
    _, err = _check_resource_and_comment_perm(request, target_type, "comment.create")
    if err:
        return err

    target_obj = resolve_target(request.tenant, target_type, pk)
    if target_obj is None:
        return Response({"detail": "Target not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        parent = Comment.objects.get(
            id=comment_id,
            tenant=request.tenant,
            target_type=target_type,
            target_id=pk,
        )
    except Comment.DoesNotExist:
        return Response({"detail": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)

    # Enforce 1-level threading
    if parent.parent_id is not None:
        return Response(
            {"detail": "Cannot reply to a reply. Replies are limited to one level."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = CommentCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    reply = Comment.objects.create(
        tenant=request.tenant,
        target_type=target_type,
        target_id=pk,
        parent=parent,
        body_md=serializer.validated_data["body_md"],
        created_by=request.user,
    )

    _publish_mention_events(request, reply, target_type, pk, target_obj)
    _publish_reply_events(request, reply, parent, target_type, pk, target_obj)

    logger.info(
        "Comment reply created id=%s parent=%s target=%s:%s user=%s tenant=%s",
        reply.pk, comment_id, target_type, pk, request.user.pk, request.tenant.slug,
    )

    reply._prefetched_replies = []
    return Response(
        CommentSerializer(reply, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


def _comment_update(request, pk, comment_id, target_type):
    """Edit a comment (own only)."""
    _, err = _check_resource_and_comment_perm(request, target_type, "comment.edit")
    if err:
        return err

    try:
        comment = Comment.objects.select_related("created_by").get(
            id=comment_id,
            tenant=request.tenant,
            target_type=target_type,
            target_id=pk,
        )
    except Comment.DoesNotExist:
        return Response({"detail": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)

    if comment.created_by_id != request.user.id:
        return Response(
            {"detail": "You can only edit your own comments."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = CommentCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    comment.body_md = serializer.validated_data["body_md"]
    comment.edited_at = timezone.now()
    comment.save(update_fields=["body_md", "edited_at", "updated_at"])

    # Publish mention events for newly added mentions
    target_obj = resolve_target(request.tenant, target_type, pk)
    if target_obj:
        _publish_mention_events(request, comment, target_type, pk, target_obj)

    logger.info(
        "Comment edited id=%s target=%s:%s user=%s tenant=%s",
        comment.pk, target_type, pk, request.user.pk, request.tenant.slug,
    )

    comment._prefetched_replies = []
    return Response(CommentSerializer(comment, context={"request": request}).data)


def _comment_delete(request, pk, comment_id, target_type):
    """Delete a comment (own, or anyone with comment.delete permission)."""
    resource_prefix = get_resource_permission_prefix(target_type)
    if resource_prefix is None:
        return Response({"detail": "Invalid target type."}, status=status.HTTP_400_BAD_REQUEST)

    # Must be able to view the resource
    _, err = check_permission(request, [f"{resource_prefix}.view"])
    if err:
        return err

    try:
        comment = Comment.objects.get(
            id=comment_id,
            tenant=request.tenant,
            target_type=target_type,
            target_id=pk,
        )
    except Comment.DoesNotExist:
        return Response({"detail": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)

    is_own = comment.created_by_id == request.user.id

    if is_own:
        # Own comment — just need comment.create (any commenter can delete their own)
        _, err = check_permission(request, ["comment.create"])
        if err:
            return err
    else:
        # Someone else's comment — need comment.delete
        _, err = check_permission(request, ["comment.delete"])
        if err:
            return err

    cid = comment.pk
    comment.delete()

    logger.info(
        "Comment deleted id=%s target=%s:%s user=%s tenant=%s own=%s",
        cid, target_type, pk, request.user.pk, request.tenant.slug, is_own,
    )
    return Response(status=status.HTTP_204_NO_CONTENT)
