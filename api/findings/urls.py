from django.urls import path

from comments.urls import comment_urls
from .views import classification_list

urlpatterns = [
    path('classifications/', classification_list, name='classification-list'),
] + comment_urls("finding", prefix="findings/")
