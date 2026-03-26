from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class TenantStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"
    DISABLED = "disabled", "Disabled"
    CLOSING = "closing", "Closing"


class TenantRole(models.TextChoices):
    OWNER = "owner", "Owner"
    MEMBER = "member", "Member"


class InviteStatus(models.TextChoices):
    NONE = "none", "None"
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"


class Tenant(TimeStampedModel):
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    status = models.CharField(
        max_length=20,
        choices=TenantStatus.choices,
        default=TenantStatus.ACTIVE,
    )

    class Meta(TimeStampedModel.Meta):
        pass

    def __str__(self) -> str:
        return self.name


class TenantMember(TimeStampedModel):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    role = models.CharField(
        max_length=20,
        choices=TenantRole.choices,
        default=TenantRole.MEMBER,
    )
    groups = models.ManyToManyField(
        "authorization.TenantGroup",
        blank=True,
        related_name="members",
    )
    is_active = models.BooleanField(default=True)
    invite_status = models.CharField(
        max_length=20,
        choices=InviteStatus.choices,
        default=InviteStatus.NONE,
    )
    last_invited_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimeStampedModel.Meta):
        constraints = [
            models.UniqueConstraint(fields=["tenant", "user"], name="unique_tenant_user"),
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.tenant} ({self.role})"


class DataExportChoice(models.TextChoices):
    EXPORTED = "exported", "I have exported and saved my data"
    NOT_NEEDED = "not_needed", "I don't need my data"


class TenantClosure(models.Model):
    """Permanent record of tenant closure — never deleted.

    Lives outside tenant-scoped data. Serves as the legal receipt that
    the owner consented to data deletion.
    """

    id = models.UUIDField(primary_key=True, default=None, editable=False)
    tenant_name = models.CharField(max_length=255)
    tenant_slug = models.SlugField(max_length=255)
    owner_email = models.EmailField()
    data_export_choice = models.CharField(
        max_length=20,
        choices=DataExportChoice.choices,
    )
    confirmation_code_hash = models.CharField(max_length=128)
    code_expires_at = models.DateTimeField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    progress = models.JSONField(default=dict, blank=True)
    initiated_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    purged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-initiated_at"]

    def __str__(self) -> str:
        return f"TenantClosure({self.tenant_slug}, {self.initiated_at})"


class InviteToken(TimeStampedModel):
    """One-time invite token for accepting a tenant membership."""

    member = models.ForeignKey(TenantMember, on_delete=models.CASCADE, related_name="invite_tokens")
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    used = models.BooleanField(default=False)
    expires_at = models.DateTimeField()

    class Meta(TimeStampedModel.Meta):
        pass

    def __str__(self) -> str:
        return f"InviteToken for {self.member} (used={self.used})"
