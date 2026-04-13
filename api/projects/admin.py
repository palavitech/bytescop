from django.contrib import admin

from .models import Project


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant', 'client_name', 'status', 'start_date', 'end_date', 'created_at')
    list_filter = ('status', 'tenant')
    search_fields = ('name', 'client_name')
