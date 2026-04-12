from rest_framework import serializers

from .models import EvidenceSource, MalwareSample


class MalwareSampleSerializer(serializers.ModelSerializer):
    class Meta:
        model = MalwareSample
        fields = [
            'id',
            'original_filename',
            'safe_filename',
            'sha256',
            'content_type',
            'size_bytes',
            'notes',
            'created_at',
        ]
        read_only_fields = [
            'id', 'original_filename', 'safe_filename', 'sha256',
            'content_type', 'size_bytes', 'created_at',
        ]


class EvidenceSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvidenceSource
        fields = [
            'id',
            'name',
            'evidence_type',
            'description',
            'acquisition_date',
            'sha256',
            'size_bytes',
            'chain_of_custody',
            'created_at',
        ]
        read_only_fields = ['id', 'sha256', 'size_bytes', 'created_at']
