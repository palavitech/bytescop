import logging

from rest_framework import serializers

from .models import Asset
from clients.models import Client

logger = logging.getLogger("bytescop.assets")


class AssetSerializer(serializers.ModelSerializer):
    client_id = serializers.PrimaryKeyRelatedField(
        source='client',
        queryset=Client.objects.all(),
        allow_null=True,
        required=False,
    )
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = [
            'id',
            'name',
            'client_id',
            'client_name',
            'asset_type',
            'environment',
            'criticality',
            'target',
            'notes',
            'attributes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None)
        if tenant and 'client_id' in fields:
            fields['client_id'].queryset = Client.objects.filter(tenant=tenant)
        return fields

    def get_client_name(self, obj):
        try:
            return obj.client.name if obj.client_id else ''
        except Exception:
            logger.warning("Failed to resolve client_name for asset=%s client_id=%s", obj.pk, obj.client_id)
            return ''

    def validate_client_id(self, client):
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None)
        if client is None:
            return None
        if client.tenant_id != getattr(tenant, 'id', None):
            raise serializers.ValidationError('Client does not belong to this tenant.')
        return client
