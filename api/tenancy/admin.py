from django.contrib import admin

from .models import Tenant, TenantMember


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "status", "created_at"]
    search_fields = ["name", "slug"]
    list_filter = ["status"]


@admin.register(TenantMember)
class TenantMemberAdmin(admin.ModelAdmin):
    list_display = ["user", "tenant", "role", "is_active", "invite_status", "created_at"]
    search_fields = ["user__email", "tenant__name"]
    list_filter = ["role", "is_active", "invite_status"]
