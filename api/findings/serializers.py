from rest_framework import serializers

from assets.models import Asset
from .models import ClassificationEntry, Finding


class FindingSerializer(serializers.ModelSerializer):
    asset_id = serializers.PrimaryKeyRelatedField(
        source='asset',
        queryset=Asset.objects.none(),
        allow_null=True,
        required=False,
    )
    asset_name = serializers.SerializerMethodField()

    class Meta:
        model = Finding
        fields = [
            'id',
            'engagement_id',
            'asset_id',
            'asset_name',
            'title',
            'severity',
            'assessment_area',
            'owasp_category',
            'cwe_id',
            'status',
            'description_md',
            'recommendation_md',
            'is_draft',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'engagement_id',
            'asset_name',
            'created_at',
            'updated_at',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None
        if tenant:
            self.fields['asset_id'].queryset = Asset.objects.filter(tenant=tenant)

    def get_asset_name(self, obj):
        try:
            return obj.asset.name if obj.asset_id else ''
        except Exception:
            return ''

    def validate_assessment_area(self, value):
        if value and not ClassificationEntry.objects.filter(
            entry_type='assessment_area', code=value,
        ).exists():
            raise serializers.ValidationError(
                f'Invalid assessment area: {value}.'
            )
        return value

    def validate_owasp_category(self, value):
        if value and not ClassificationEntry.objects.filter(
            entry_type='owasp', code=value,
        ).exists():
            raise serializers.ValidationError(
                f'Invalid OWASP category: {value}.'
            )
        return value

    def validate_cwe_id(self, value):
        if value and not ClassificationEntry.objects.filter(
            entry_type='cwe', code=value,
        ).exists():
            raise serializers.ValidationError(
                f'Invalid CWE ID: {value}. Must be a recognized CWE entry '
                f'(e.g. CWE-79).'
            )
        return value

