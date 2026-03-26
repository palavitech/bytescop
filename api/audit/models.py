from django.conf import settings
from django.db import models


class AuditAction(models.TextChoices):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    READ = "read"
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILED = "login_failed"
    LOGOUT = "logout"
    SIGNUP = "signup"
    TENANT_SWITCH = "tenant_switch"


class AuditLog(models.Model):
    """Append-only audit trail scoped per tenant."""

    id = models.BigAutoField(primary_key=True)
    tenant = models.ForeignKey(
        "tenancy.Tenant",
        on_delete=models.CASCADE,
        related_name="audit_logs",
        null=True,
        blank=True,
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
        null=True,
        blank=True,
    )
    actor_email = models.EmailField(max_length=254, default="")
    action = models.CharField(max_length=24, choices=AuditAction.choices)
    resource_type = models.CharField(max_length=50)
    resource_id = models.CharField(max_length=64, default="", blank=True)
    resource_repr = models.CharField(max_length=255, default="", blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    diff = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(default="", blank=True)
    request_id = models.CharField(max_length=64, default="", blank=True)
    request_path = models.CharField(max_length=512, default="", blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["tenant", "-timestamp"], name="audit_tenant_ts"),
            models.Index(fields=["tenant", "action"], name="audit_tenant_action"),
            models.Index(fields=["tenant", "resource_type"], name="audit_tenant_restype"),
            models.Index(fields=["tenant", "actor"], name="audit_tenant_actor"),
            models.Index(
                fields=["tenant", "resource_type", "resource_id"],
                name="audit_tenant_res",
            ),
        ]

    def __str__(self) -> str:
        return f"[{self.action}] {self.resource_type} {self.resource_id}"
