from django.contrib import admin

from .models import Engagement, Sow, SowAsset


@admin.register(Engagement)
class EngagementAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant', 'client_name', 'status', 'start_date', 'end_date', 'created_at')
    list_filter = ('status', 'tenant')
    search_fields = ('name', 'client_name')


@admin.register(Sow)
class SowAdmin(admin.ModelAdmin):
    list_display = ('title', 'engagement', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('title',)


@admin.register(SowAsset)
class SowAssetAdmin(admin.ModelAdmin):
    list_display = ('sow', 'asset', 'in_scope', 'created_at')
    list_filter = ('in_scope',)
    raw_id_fields = ('sow', 'asset')
