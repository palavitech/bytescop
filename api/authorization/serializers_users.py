"""Serializers for tenant member (user) management."""

from rest_framework import serializers

from accounts.avatar_service import get_avatar_url
from accounts.models import User
from authorization.models import TenantGroup


class UserNestedSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    mfa_enabled = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "phone", "timezone", "avatar_url", "mfa_enabled"]
        read_only_fields = ["id", "email", "first_name", "last_name", "phone", "timezone", "mfa_enabled"]

    def get_avatar_url(self, obj):
        return get_avatar_url(obj)


class MemberGroupSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    is_default = serializers.BooleanField()


class TenantMemberListSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    user = UserNestedSerializer()
    role = serializers.CharField()
    is_active = serializers.BooleanField()
    invite_status = serializers.CharField()
    groups = MemberGroupSerializer(many=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class TenantMemberDetailSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    user = UserNestedSerializer()
    role = serializers.CharField()
    is_active = serializers.BooleanField()
    invite_status = serializers.CharField()
    groups = MemberGroupSerializer(many=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class TenantMemberCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    password = serializers.CharField(min_length=8, write_only=True, required=False)
    password_confirm = serializers.CharField(write_only=True, required=False)
    phone = serializers.CharField(max_length=40, required=False, default="", allow_blank=True)
    timezone = serializers.CharField(max_length=80, required=False, default="", allow_blank=True)
    group_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list,
    )

    def validate_email(self, value):
        from core.validators import validate_email_address
        try:
            validate_email_address(value)
        except Exception as e:
            raise serializers.ValidationError(str(e.message))
        return value.lower()

    def validate(self, data):
        password = data.get('password')
        password_confirm = data.get('password_confirm')

        if password:
            if password != password_confirm:
                raise serializers.ValidationError({'password_confirm': 'Passwords do not match.'})

            # Validate against tenant password policy
            from account_settings.password_policy import validate_password_against_policy
            try:
                validate_password_against_policy(
                    password,
                    self.context['request'].tenant,
                )
            except Exception as e:
                messages = e.messages if hasattr(e, 'messages') else [str(e)]
                raise serializers.ValidationError({'password': messages})

        return data

    def validate_group_ids(self, value):
        if not value:
            return value
        tenant = self.context["request"].tenant
        existing = set(
            TenantGroup.objects.filter(
                tenant=tenant, pk__in=value,
            ).values_list("pk", flat=True)
        )
        invalid = set(value) - existing
        if invalid:
            raise serializers.ValidationError(
                f"Invalid group IDs: {[str(i) for i in invalid]}"
            )
        return value


class TenantMemberUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    timezone = serializers.CharField(max_length=80, required=False, allow_blank=True)
    group_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
    )

    def validate_group_ids(self, value):
        if not value:
            return value
        tenant = self.context["request"].tenant
        existing = set(
            TenantGroup.objects.filter(
                tenant=tenant, pk__in=value,
            ).values_list("pk", flat=True)
        )
        invalid = set(value) - existing
        if invalid:
            raise serializers.ValidationError(
                f"Invalid group IDs: {[str(i) for i in invalid]}"
            )
        return value
