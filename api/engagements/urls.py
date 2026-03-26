from django.urls import path
from rest_framework.routers import DefaultRouter

from comments.urls import comment_urls
from .views import EngagementViewSet

router = DefaultRouter()
router.register('', EngagementViewSet, basename='engagements')

engagement_upload_image = EngagementViewSet.as_view({'post': 'upload_image'})

urlpatterns = [
    path(
        '<uuid:pk>/attachments/images/',
        engagement_upload_image,
        name='engagement_upload_image',
    ),
] + comment_urls("engagement") + router.urls
