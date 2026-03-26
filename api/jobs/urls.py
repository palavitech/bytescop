from django.urls import path

from . import views

urlpatterns = [
    path('', views.job_list, name='job-list'),
    path('<str:job_id>/', views.job_detail, name='job-detail'),
]
