from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = [
        "id", "timestamp", "action", "resource_type",
        "resource_id", "actor_email", "ip_address",
    ]
    list_filter = ["action", "resource_type"]
    search_fields = ["actor_email", "resource_repr", "resource_id"]
    readonly_fields = [
        "id", "tenant", "actor", "actor_email", "action",
        "resource_type", "resource_id", "resource_repr",
        "before", "after", "diff", "ip_address", "user_agent",
        "request_id", "request_path", "timestamp",
    ]
    ordering = ["-id"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
