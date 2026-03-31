from rest_framework import serializers

from assets.models import Asset
from evidence.models import MalwareSample
from .models import ClassificationEntry, Finding


class FindingSerializer(serializers.ModelSerializer):
    asset_id = serializers.PrimaryKeyRelatedField(
        source='asset',
        queryset=Asset.objects.none(),
        allow_null=True,
        required=False,
    )
    asset_name = serializers.SerializerMethodField()
    sample_id = serializers.PrimaryKeyRelatedField(
        source='sample',
        queryset=MalwareSample.objects.none(),
        allow_null=True,
        required=False,
    )
    sample_name = serializers.SerializerMethodField()

    class Meta:
        model = Finding
        fields = [
            'id',
            'engagement_id',
            'asset_id',
            'asset_name',
            'sample_id',
            'sample_name',
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
            'sample_name',
            'created_at',
            'updated_at',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request else None
        if tenant:
            self.fields['asset_id'].queryset = Asset.objects.filter(tenant=tenant)
            self.fields['sample_id'].queryset = MalwareSample.objects.filter(tenant=tenant)

    def get_asset_name(self, obj):
        try:
            return obj.asset.name if obj.asset_id else ''
        except Exception:
            return ''

    def get_sample_name(self, obj):
        try:
            return obj.sample.original_filename if obj.sample_id else ''
        except Exception:
            return ''

    def validate(self, data):
        asset = data.get('asset')
        sample = data.get('sample')
        if asset and sample:
            raise serializers.ValidationError(
                'A finding cannot reference both an asset and a malware sample.'
            )
        return data

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

