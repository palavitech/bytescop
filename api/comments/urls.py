"""Reusable URL factory for comment endpoints.

Usage in any app's urls.py:

    from comments.urls import comment_urls
    urlpatterns += comment_urls("engagement")

This generates:
    <uuid:pk>/comments/              GET (list), POST (create)
    <uuid:pk>/comments/<uuid:cid>/   PATCH (edit), DELETE
    <uuid:pk>/comments/<uuid:cid>/reply/  POST (reply)
"""

from django.urls import path

from .views import make_comment_detail_view, make_comment_list_create_view, make_comment_reply_view


def comment_urls(target_type: str, prefix: str = "") -> list:
    """Return URL patterns for comments on a given target type.

    Args:
        target_type: The TargetType value (e.g., "engagement", "finding").
        prefix: Optional URL prefix (e.g., "" for top-level, or a nested path).
    """
    list_create = make_comment_list_create_view(target_type)
    reply = make_comment_reply_view(target_type)
    detail = make_comment_detail_view(target_type)

    base = f"{prefix}<uuid:pk>/comments/"

    return [
        path(base, list_create, name=f"{target_type}-comments"),
        path(f"{base}<uuid:comment_id>/", detail, name=f"{target_type}-comment-detail"),
        path(f"{base}<uuid:comment_id>/reply/", reply, name=f"{target_type}-comment-reply"),
    ]
