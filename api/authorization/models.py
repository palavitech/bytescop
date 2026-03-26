from django.db import models

from core.models import TimeStampedModel


class PermissionCategory(models.TextChoices):
    MODEL = "model", "Model CRUD"
    SYSTEM = "system", "System"


class Permission(TimeStampedModel):
    """Global permission definition. Not tenant-scoped."""

    codename = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    category = models.CharField(
        max_length=20,
        choices=PermissionCategory.choices,
        default=PermissionCategory.MODEL,
    )
    resource = models.CharField(max_length=50)

    class Meta(TimeStampedModel.Meta):
        ordering = ["resource", "codename"]

    def __str__(self) -> str:
        return self.codename


class TenantGroup(TimeStampedModel):
    """Tenant-scoped group with M2M to permissions."""

    tenant = models.ForeignKey(
        "tenancy.Tenant",
        on_delete=models.CASCADE,
        related_name="groups",
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default="")
    permissions = models.ManyToManyField(Permission, blank=True, related_name="groups")
    is_default = models.BooleanField(default=False)

    class Meta(TimeStampedModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "name"],
                name="unique_tenant_group_name",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.tenant})"
