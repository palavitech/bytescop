from django.urls import path

from . import views, views_users

urlpatterns = [
    path("permissions/", views.permission_list, name="authorization-permissions"),
    path("my-permissions/", views.my_permissions, name="authorization-my-permissions"),
    path("groups/", views.group_list_create, name="authorization-groups"),
    path("groups/<uuid:group_id>/", views.group_detail, name="authorization-group-detail"),
    path("groups/<uuid:group_id>/members/", views.group_member_add, name="authorization-group-member-add"),
    path("groups/<uuid:group_id>/members/<uuid:member_id>/", views.group_member_remove, name="authorization-group-member-remove"),
    # Member reference (lightweight, for mentions/dropdowns)
    path("members/ref/", views_users.member_ref, name="authorization-member-ref"),
    # Member (user) management
    path("members/", views_users.member_list_create, name="authorization-members"),
    path("members/<uuid:member_id>/", views_users.member_detail, name="authorization-member-detail"),
    path("members/<uuid:member_id>/toggle-active/", views_users.member_toggle_active, name="authorization-member-toggle-active"),
    path("members/<uuid:member_id>/reset-mfa/", views_users.member_reset_mfa, name="authorization-member-reset-mfa"),
    path("members/<uuid:member_id>/reset-password/", views_users.member_reset_password, name="authorization-member-reset-password"),
    path("members/<uuid:member_id>/reinvite/", views_users.member_reinvite, name="authorization-member-reinvite"),
    path("members/<uuid:member_id>/promote/", views_users.member_promote, name="authorization-member-promote"),
    path("members/<uuid:member_id>/demote/", views_users.member_demote, name="authorization-member-demote"),
    path("members/<uuid:member_id>/engagements/", views_users.member_engagements, name="authorization-member-engagements"),
    path("members/<uuid:member_id>/engagements/<uuid:stakeholder_id>/", views_users.member_engagement_remove, name="authorization-member-engagement-remove"),
]
