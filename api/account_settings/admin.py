from django.contrib import admin

from .models import AccountSetting


@admin.register(AccountSetting)
class AccountSettingAdmin(admin.ModelAdmin):
    list_display = ('key', 'value', 'tenant', 'updated_by', 'updated_at')
    list_filter = ('tenant',)
    search_fields = ('key',)
