from django.conf import settings
from django.contrib import admin
from django.urls import path, include

from api.views_avatar import UserAvatarView
from evidence.views import AttachmentContentView, MalwareSampleDownloadView
from .views import health_check
from core.setup_views import setup_status, setup_complete
from licensing.views import license_status

urlpatterns = [
    path('api/health/', health_check, name='health-check'),
    path('api/setup/status/', setup_status, name='setup-status'),
    path('api/setup/complete/', setup_complete, name='setup-complete'),
    path('api/license/', license_status, name='license-status'),
    path('api/', include('api.urls')),
    path('api/authorization/', include('authorization.urls')),
    path('api/clients/', include('clients.urls')),
    path('api/assets/', include('assets.urls')),
    path('api/engagements/', include('engagements.urls')),
    path('api/audit/', include('audit.urls')),
    path('api/settings/', include('account_settings.urls')),
    path('api/jobs/', include('jobs.urls')),
    path('api/', include('findings.urls')),
    path('api/tenant/', include('tenancy.urls')),
    path(
        'api/attachments/<uuid:pk>/content/',
        AttachmentContentView.as_view(),
        name='attachment-content',
    ),
    path(
        'api/samples/<uuid:pk>/download/',
        MalwareSampleDownloadView.as_view(),
        name='sample-download',
    ),
    path(
        'api/users/<int:user_id>/avatar/',
        UserAvatarView.as_view(),
        name='user-avatar',
    ),
]

# Dev-only: Django admin
if settings.DEBUG:
    urlpatterns += [
        path('admin/', admin.site.urls),
    ]
