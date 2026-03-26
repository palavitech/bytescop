from rest_framework import serializers

from clients.models import Client
from .models import Engagement, Sow


class EngagementSerializer(serializers.ModelSerializer):
    client_id = serializers.PrimaryKeyRelatedField(
        source='client',
        queryset=Client.objects.all(),
        allow_null=True,
        required=False,
    )
    client_name = serializers.CharField(read_only=True)
    findings_summary = serializers.SerializerMethodField()

    class Meta:
        model = Engagement
        fields = [
            'id',
            'name',
            'client_id',
            'client_name',
            'status',
            'description',
            'notes',
            'start_date',
            'end_date',
            'findings_summary',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'client_name', 'created_at', 'updated_at']

    def get_findings_summary(self, obj):
        if not hasattr(obj, 'findings_critical'):
            return None
        return {
            'critical': obj.findings_critical,
            'high': obj.findings_high,
            'medium': obj.findings_medium,
            'low': obj.findings_low,
            'info': obj.findings_info,
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and hasattr(request, 'tenant'):
            self.fields['client_id'].queryset = Client.objects.filter(
                tenant=request.tenant,
            )
        # On create, status is always defaulted to PLANNED by the model
        if not self.instance:
            self.fields['status'].read_only = True

    def update(self, instance, validated_data):
        if 'client' in validated_data:
            client = validated_data['client']
            validated_data['client_name'] = client.name if client else ''
        return super().update(instance, validated_data)


class SowSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sow
        fields = ['id', 'title', 'status', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
