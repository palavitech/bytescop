from django.urls import path

from . import views

urlpatterns = [
    path("", views.audit_list, name="audit-list"),
    path("summary/", views.audit_summary, name="audit-summary"),
    path("<int:audit_id>/", views.audit_detail, name="audit-detail"),
]
