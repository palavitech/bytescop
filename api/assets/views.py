import logging

from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.base import AuditedModelViewSet
from authorization.permissions import TenantPermission
from subscriptions.guard import SubscriptionGuard
from engagements.models import SowAsset
from .models import Asset
from .serializers import AssetSerializer

logger = logging.getLogger("bytescop.assets")


class AssetViewSet(AuditedModelViewSet):
    permission_classes = [IsAuthenticated, TenantPermission, SubscriptionGuard]
    serializer_class = AssetSerializer
    audit_resource_type = "asset"
    subscription_limits = {
        'create': {
            'rule': 'assets_per_tenant',
            'context': lambda view, request: {},
        },
    }
    required_permissions = {
        'list': ['asset.view'],
        'retrieve': ['asset.view'],
        'create': ['asset.create'],
        'update': ['asset.update'],
        'partial_update': ['asset.update'],
        'destroy': ['asset.delete'],
        'scope_usage': ['asset.view'],
    }

    def get_queryset(self):
        from authorization.scoping import scope_assets
        qs = Asset.objects.filter(tenant=self.request.tenant).select_related('client')
        qs = scope_assets(qs, self.request)

        client_id = (
            self.request.query_params.get('client')
            or self.request.query_params.get('client_id')
        )
        if client_id:
            qs = qs.filter(client_id=client_id)

        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        asset = serializer.save(tenant=self.request.tenant)
        logger.info("Asset created id=%s type=%s user=%s tenant=%s", asset.pk, asset.asset_type, self.request.user.pk, self.request.tenant.slug)

    def perform_update(self, serializer):
        asset = serializer.save()
        logger.info("Asset updated id=%s type=%s user=%s tenant=%s", asset.pk, asset.asset_type, self.request.user.pk, self.request.tenant.slug)

    def perform_destroy(self, instance):
        aid, atype = instance.pk, instance.asset_type
        instance.delete()
        logger.info("Asset deleted id=%s type=%s user=%s tenant=%s", aid, atype, self.request.user.pk, self.request.tenant.slug)

    @action(detail=True, methods=['get'], url_path='scope-usage')
    def scope_usage(self, request, pk=None):
        asset = self.get_object()
        count = SowAsset.objects.filter(asset=asset).count()
        return Response({'count': count})
