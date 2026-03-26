from django.contrib import admin

from .models import Asset


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant', 'client', 'asset_type', 'environment', 'criticality', 'created_at')
    list_filter = ('asset_type', 'environment', 'criticality', 'tenant')
    search_fields = ('name', 'target')
