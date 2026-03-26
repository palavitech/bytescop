from django.urls import path

from . import views

urlpatterns = [
    path('', views.settings_list, name='settings-list'),
    path('logo/', views.logo_manage, name='settings-logo'),
    path('logo-content/', views.logo_content, name='settings-logo-content'),
    path('<str:key>/', views.settings_detail, name='settings-detail'),
]
