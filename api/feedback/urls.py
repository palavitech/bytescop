from django.urls import path

from .views import create_feature_request

urlpatterns = [
    path('', create_feature_request, name='feature-request-create'),
]
