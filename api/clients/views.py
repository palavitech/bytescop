import logging

from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.base import AuditedModelViewSet
from authorization.permissions import TenantPermission
from subscriptions.guard import SubscriptionGuard
from .models import Client
from .serializers import ClientSerializer, ClientRefSerializer

logger = logging.getLogger("bytescop.clients")


class ClientViewSet(AuditedModelViewSet):
    permission_classes = [IsAuthenticated, TenantPermission, SubscriptionGuard]
    serializer_class = ClientSerializer
    audit_resource_type = "client"
    subscription_limits = {
        'create': {
            'rule': 'clients_per_tenant',
            'context': lambda view, request: {},
        },
    }
    required_permissions = {
        'list': ['client.view'],
        'retrieve': ['client.view'],
        'create': ['client.create'],
        'update': ['client.update'],
        'partial_update': ['client.update'],
        'destroy': ['client.delete'],
        'ref': ['client.view'],
    }

    def get_queryset(self):
        from authorization.scoping import scope_clients
        qs = Client.objects.filter(tenant=self.request.tenant)
        qs = scope_clients(qs, self.request)
        return qs.order_by('name')

    def perform_create(self, serializer):
        client = serializer.save(tenant=self.request.tenant)
        logger.info("Client created id=%s user=%s tenant=%s", client.pk, self.request.user.pk, self.request.tenant.slug)

    def perform_update(self, serializer):
        client = serializer.save()
        logger.info("Client updated id=%s user=%s tenant=%s", client.pk, self.request.user.pk, self.request.tenant.slug)

    def perform_destroy(self, instance):
        cid = instance.pk
        instance.delete()
        logger.info("Client deleted id=%s user=%s tenant=%s", cid, self.request.user.pk, self.request.tenant.slug)

    @action(detail=False, methods=['get'])
    def ref(self, request):
        qs = self.get_queryset()
        serializer = ClientRefSerializer(qs, many=True)
        return Response(serializer.data)
