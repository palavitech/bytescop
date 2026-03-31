from rest_framework import serializers

from .models import MalwareSample


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
