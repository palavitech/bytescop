from rest_framework import serializers

from .models import AuditLog


class AuditLogListSerializer(serializers.ModelSerializer):
    """Compact serializer for list endpoint (excludes before/after/diff)."""

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "resource_type",
            "resource_id",
            "resource_repr",
            "actor_email",
            "ip_address",
            "timestamp",
        ]


class AuditLogDetailSerializer(serializers.ModelSerializer):
    """Full serializer for detail endpoint (includes before/after/diff)."""

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "resource_type",
            "resource_id",
            "resource_repr",
            "actor_email",
            "ip_address",
            "user_agent",
            "request_id",
            "request_path",
            "before",
            "after",
            "diff",
            "timestamp",
        ]
