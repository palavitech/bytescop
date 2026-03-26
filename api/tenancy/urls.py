from django.urls import path

from . import views_closure

urlpatterns = [
    path("close/preflight/", views_closure.closure_preflight, name="tenant-close-preflight"),
    path("close/verify-mfa/", views_closure.closure_verify_mfa, name="tenant-close-verify-mfa"),
    path("close/execute/", views_closure.closure_execute, name="tenant-close-execute"),
    path("close/status/", views_closure.closure_status, name="tenant-close-status"),
]
