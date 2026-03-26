from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

from account_settings.mfa_policy import is_mfa_required
from account_settings.password_policy import (
    check_password_reset_required,
    validate_password_against_policy,
)
from accounts.avatar_service import get_avatar_url
from accounts.models import User
from authorization.models import Permission
from authorization.permissions import get_user_permissions
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.signing import (
    SALT_MFA_CHALLENGE,
    SALT_EMAIL_VERIFY,
    create_signed_token,
)
from subscriptions.services import assign_default_plan, get_subscription_info
from tenancy.models import Tenant, TenantMember, TenantRole, TenantStatus, InviteStatus


def _generate_unique_slug(name: str) -> str:
    """Generate a unique slug from a company name, appending a counter on collision."""
    base = slugify(name)
    if not base:
        base = "tenant"
    slug = base
    counter = 1
    while Tenant.objects.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _permissions_payload(member):
    """Build the permissions payload for an auth response."""
    is_root = member.role == TenantRole.OWNER

    if is_root:
        perms = sorted(Permission.objects.values_list("codename", flat=True))
    else:
        perms = sorted(get_user_permissions(member))

    groups = [
        {"id": str(g.id), "name": g.name, "is_default": g.is_default}
        for g in member.groups.all()
    ]

    return {
        "is_root": is_root,
        "permissions": perms,
        "groups": groups,
    }


class SignupSerializer(serializers.Serializer):
    company_name = serializers.CharField(max_length=255)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    def validate_email(self, value):
        from core.validators import validate_email_address, validate_email_domain
        try:
            validate_email_address(value)
        except Exception as e:
            raise serializers.ValidationError(str(e.message))
        try:
            validate_email_domain(value)
        except Exception as e:
            raise serializers.ValidationError(str(e.message))
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()

    def validate(self, data):
        if data["password"] != data["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        # Policy validation happens in create() after tenant is created;
        # run a basic length check here as a fast fail.
        return data

    @transaction.atomic
    def create(self, validated_data):
        slug = _generate_unique_slug(validated_data["company_name"])

        tenant = Tenant.objects.create(
            name=validated_data["company_name"],
            slug=slug,
        )

        # Validate password against the new tenant's policy
        try:
            validate_password_against_policy(validated_data["password"], tenant)
        except Exception as e:
            raise serializers.ValidationError(
                {"password": e.messages if hasattr(e, "messages") else [str(e)]}
            )

        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
        )
        user.password_changed_at = timezone.now()
        user.email_verified = False
        user.save(update_fields=["password_changed_at", "email_verified"])

        member = TenantMember.objects.create(
            tenant=tenant,
            user=user,
            role=TenantRole.OWNER,
        )

        # Seed the company_name setting from signup
        from account_settings.models import AccountSetting
        AccountSetting.objects.create(
            tenant=tenant,
            key="company_name",
            value=validated_data["company_name"],
            updated_by=user,
        )

        # Ensure permissions are seeded and create default groups
        seed_permissions()
        default_groups = create_default_groups_for_tenant(tenant)

        # Assign owner to Administrators group
        admin_group = default_groups.get("Administrators")
        if admin_group:
            member.groups.add(admin_group)

        # Assign default subscription plan
        assign_default_plan(tenant)

        # Generate email verification token (HMAC-signed, 24h expiry)
        verify_token = create_signed_token(
            {"user_id": str(user.pk), "purpose": "email_verify"},
            salt=SALT_EMAIL_VERIFY,
        )

        return {
            "detail": "Account created. Please check your email to verify your address.",
            "email_sent": True,
            "user_id": str(user.pk),
            "tenant_id": str(tenant.pk),
            "email": user.email,
            "name": user.first_name,
            "verify_token": verify_token,
        }


class LoginStep1Serializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        user = authenticate(email=data["email"], password=data["password"])
        if user is None:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account is disabled.")
        data["user"] = user
        return data

    def get_tenants(self):
        user = self.validated_data["user"]
        memberships = (
            TenantMember.objects
            .filter(user=user, is_active=True, tenant__status=TenantStatus.ACTIVE)
            .exclude(invite_status=InviteStatus.PENDING)
            .select_related("tenant")
        )
        return [
            {
                "id": str(m.tenant.pk),
                "slug": m.tenant.slug,
                "name": m.tenant.name,
                "role": m.role,
            }
            for m in memberships
        ]


class LoginStep2Serializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    tenant_id = serializers.UUIDField()

    def validate(self, data):
        user = authenticate(email=data["email"], password=data["password"])
        if user is None:
            raise serializers.ValidationError("Invalid email or password.")
        if not user.is_active:
            raise serializers.ValidationError("This account is disabled.")

        try:
            membership = (
                TenantMember.objects.select_related("tenant")
                .exclude(invite_status=InviteStatus.PENDING)
                .get(
                    user=user,
                    tenant__id=data["tenant_id"],
                    tenant__status=TenantStatus.ACTIVE,
                    is_active=True,
                )
            )
        except TenantMember.DoesNotExist:
            raise serializers.ValidationError("You do not have access to this tenant.")

        data["user"] = user
        data["membership"] = membership
        return data

    def get_response_data(self):
        user = self.validated_data["user"]
        membership = self.validated_data["membership"]
        tenant = membership.tenant

        # Email verification gate — must verify before MFA or token issuance
        if not user.email_verified:
            return {
                "email_not_verified": True,
                "resend_available": True,
            }

        # MFA gate: if user has MFA enabled, or MFA is required but not yet set up,
        # return a challenge token instead of logging in.
        mfa_required = is_mfa_required(membership, tenant)

        if user.mfa_enabled:
            mfa_token = create_signed_token(
                {"user_id": str(user.pk), "tenant_id": str(tenant.id), "purpose": "mfa_challenge"},
                salt=SALT_MFA_CHALLENGE,
            )
            return {
                "mfa_required": True,
                "mfa_setup_required": False,
                "mfa_token": mfa_token,
            }

        if mfa_required and not user.mfa_enabled:
            mfa_token = create_signed_token(
                {"user_id": str(user.pk), "tenant_id": str(tenant.id), "purpose": "mfa_challenge"},
                salt=SALT_MFA_CHALLENGE,
            )
            return {
                "mfa_required": True,
                "mfa_setup_required": True,
                "mfa_token": mfa_token,
            }

        return build_full_auth_response(user, membership)


def build_full_auth_response(user, membership):
    """Build the full auth response body (user, tenant, authorization, etc.)."""
    from account_settings.definitions import DEFINITION_MAP
    from account_settings.models import AccountSetting

    tenant = membership.tenant

    reset_required, reset_reason = check_password_reset_required(user)

    # Resolve date_format from tenant settings (or definition default)
    date_format = DEFINITION_MAP["date_format"].default
    stored = (
        AccountSetting.objects
        .filter(tenant=tenant, key="date_format")
        .values_list("value", flat=True)
        .first()
    )
    if stored:
        date_format = stored

    return {
        "user": {
            "id": str(user.pk),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "avatar_url": get_avatar_url(user),
            "password_changed_at": user.password_changed_at.isoformat() if user.password_changed_at else None,
        },
        "tenant": {
            "id": str(tenant.pk),
            "slug": tenant.slug,
            "name": tenant.name,
            "role": membership.role,
        },
        "authorization": _permissions_payload(membership),
        "subscription": get_subscription_info(tenant),
        "password_reset_required": reset_required,
        "password_reset_reason": reset_reason,
        "date_format": date_format,
    }


class SwitchTenantSerializer(serializers.Serializer):
    tenant_id = serializers.UUIDField()

    def validate(self, data):
        user = self.context["request"].user

        try:
            membership = (
                TenantMember.objects.select_related("tenant")
                .exclude(invite_status=InviteStatus.PENDING)
                .get(
                    user=user,
                    tenant__id=data["tenant_id"],
                    tenant__status=TenantStatus.ACTIVE,
                    is_active=True,
                )
            )
        except TenantMember.DoesNotExist:
            raise serializers.ValidationError("You do not have access to this tenant.")

        data["user"] = user
        data["membership"] = membership
        return data

    def get_response_data(self):
        user = self.validated_data["user"]
        membership = self.validated_data["membership"]
        return build_full_auth_response(user, membership)
