from rest_framework import serializers

from clients.models import Client
from engagements.models import Engagement, EngagementType
from .models import Project


class ProjectEngagementSerializer(serializers.ModelSerializer):
    """Lightweight engagement serializer for nesting inside project detail."""

    class Meta:
        model = Engagement
        fields = [
            'id',
            'name',
            'engagement_type',
            'status',
            'start_date',
            'end_date',
            'created_at',
        ]


class ProjectSerializer(serializers.ModelSerializer):
    client_id = serializers.PrimaryKeyRelatedField(
        source='client',
        queryset=Client.objects.all(),
        allow_null=True,
        required=False,
    )
    client_name = serializers.CharField(read_only=True)
    engagement_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            'id',
            'name',
            'description',
            'client_id',
            'client_name',
            'status',
            'start_date',
            'end_date',
            'engagement_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'client_name', 'created_at', 'updated_at']

    def get_engagement_count(self, obj):
        if hasattr(obj, '_engagement_count'):
            return obj._engagement_count
        return obj.engagements.count()

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and hasattr(request, 'tenant'):
            self.fields['client_id'].queryset = Client.objects.filter(
                tenant=request.tenant,
            )

    def update(self, instance, validated_data):
        if 'client' in validated_data:
            client = validated_data['client']
            validated_data['client_name'] = client.name if client else ''
        return super().update(instance, validated_data)


class ProjectCreateSerializer(ProjectSerializer):
    """Extends ProjectSerializer with engagement_types for bulk creation."""

    engagement_types = serializers.ListField(
        child=serializers.ChoiceField(choices=EngagementType.choices),
        write_only=True,
    )

    class Meta(ProjectSerializer.Meta):
        fields = ProjectSerializer.Meta.fields + ['engagement_types']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # On create, status is always defaulted by the model
        if not self.instance:
            self.fields['status'].read_only = True


class ProjectDetailSerializer(ProjectSerializer):
    """Adds nested engagements for retrieve action."""

    engagements = ProjectEngagementSerializer(many=True, read_only=True)

    class Meta(ProjectSerializer.Meta):
        fields = ProjectSerializer.Meta.fields + ['engagements']


class ProjectRefSerializer(serializers.ModelSerializer):
    """Lightweight serializer for reference/lookup endpoints."""

    class Meta:
        model = Project
        fields = ['id', 'name']
