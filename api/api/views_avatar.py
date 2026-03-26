"""Tenant-scoped avatar serving endpoint.

GET /api/users/<int:user_id>/avatar/

Requires authentication. Only serves avatars for users within the
requesting user's tenant.
"""

import logging

from django.http import FileResponse, Http404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.avatar_service import AvatarService
from accounts.models import User
from tenancy.models import TenantMember

logger = logging.getLogger("bytescop.avatar")


class UserAvatarView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, user_id):
        # Verify the target user belongs to the same tenant
        tenant = request.tenant
        if not tenant:
            raise Http404()

        is_member = TenantMember.objects.filter(
            tenant=tenant, user_id=user_id, is_active=True
        ).exists()
        if not is_member:
            raise Http404()

        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise Http404()

        if not user.avatar_uri:
            raise Http404()

        svc = AvatarService()

        f = svc.open(user.avatar_uri)
        if not f:
            raise Http404()

        resp = FileResponse(f, content_type="image/png")
        resp["Content-Disposition"] = 'inline; filename="avatar.png"'
        resp["X-Content-Type-Options"] = "nosniff"
        resp["Cache-Control"] = "private, max-age=3600"
        return resp
