from django.contrib import admin

from .models import ClassificationEntry, Finding

admin.site.register(Finding)
admin.site.register(ClassificationEntry)
