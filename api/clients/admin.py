from django.contrib import admin

from .models import Client


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant', 'status', 'created_at')
    list_filter = ('status', 'tenant')
    search_fields = ('name',)
