from rest_framework import serializers

from authorization.models import Permission, TenantGroup


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "codename", "name", "category", "resource"]
        read_only_fields = fields


class TenantGroupListSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = TenantGroup
        fields = ["id", "name", "description", "is_default", "member_count", "created_at"]
        read_only_fields = fields


class TenantGroupDetailSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)

    class Meta:
        model = TenantGroup
        fields = ["id", "name", "description", "is_default", "permissions", "created_at", "updated_at"]
        read_only_fields = ["id", "is_default", "created_at", "updated_at"]


class TenantGroupCreateSerializer(serializers.ModelSerializer):
    permission_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False,
        default=list,
    )

    class Meta:
        model = TenantGroup
        fields = ["name", "description", "permission_ids"]

    def validate_name(self, value):
        tenant = self.context["request"].tenant
        if TenantGroup.objects.filter(tenant=tenant, name=value).exists():
            raise serializers.ValidationError("A group with this name already exists.")
        return value

    def create(self, validated_data):
        permission_ids = validated_data.pop("permission_ids", [])
        tenant = self.context["request"].tenant
        group = TenantGroup.objects.create(tenant=tenant, **validated_data)
        if permission_ids:
            perms = Permission.objects.filter(id__in=permission_ids)
            group.permissions.set(perms)
        return group


class TenantGroupUpdateSerializer(serializers.ModelSerializer):
    permission_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = TenantGroup
        fields = ["name", "description", "permission_ids"]

    def validate_name(self, value):
        tenant = self.context["request"].tenant
        qs = TenantGroup.objects.filter(tenant=tenant, name=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A group with this name already exists.")
        return value

    def validate(self, data):
        if self.instance and self.instance.is_default:
            raise serializers.ValidationError("Default groups cannot be modified.")
        return data

    def update(self, instance, validated_data):
        permission_ids = validated_data.pop("permission_ids", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if permission_ids is not None:
            perms = Permission.objects.filter(id__in=permission_ids)
            instance.permissions.set(perms)
        return instance


class GroupMemberAddSerializer(serializers.Serializer):
    member_id = serializers.UUIDField()


class MyPermissionsSerializer(serializers.Serializer):
    is_root = serializers.BooleanField()
    permissions = serializers.ListField(child=serializers.CharField())
    groups = serializers.ListField()
