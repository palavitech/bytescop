from django.urls import path

from . import views, views_auth, views_dashboard, views_email_verify, views_forgot_password, views_invite, views_mfa, views_password, views_profile

urlpatterns = [
    path("dashboard/", views.dashboard, name="dashboard"),
    path("dashboard/catalog/", views_dashboard.dashboard_catalog, name="dashboard-catalog"),
    path("dashboard/layout/", views_dashboard.dashboard_layout, name="dashboard-layout"),
    path("me/profile/", views_profile.me_profile, name="me-profile"),
    path("me/profile/avatar/", views_profile.me_avatar, name="me-avatar"),
    path("me/profile/password/", views_password.me_change_password, name="me-change-password"),
    path("me/password-policy/", views_password.me_password_policy, name="me-password-policy"),
    # MFA self-service
    path("me/mfa/status/", views_mfa.me_mfa_status, name="me-mfa-status"),
    path("me/mfa/enroll/", views_mfa.me_mfa_enroll, name="me-mfa-enroll"),
    path("me/mfa/enroll/confirm/", views_mfa.me_mfa_enroll_confirm, name="me-mfa-enroll-confirm"),
    path("me/mfa/disable/", views_mfa.me_mfa_disable, name="me-mfa-disable"),
    path("me/mfa/regenerate-backup-codes/", views_mfa.me_mfa_regenerate_backup_codes, name="me-mfa-regenerate-backup-codes"),
    path("me/mfa/re-enroll/", views_mfa.me_mfa_re_enroll, name="me-mfa-re-enroll"),
    path("me/mfa/re-enroll/confirm/", views_mfa.me_mfa_re_enroll_confirm, name="me-mfa-re-enroll-confirm"),
    # Auth (no self-signup on-prem — admin creates users via invite)
    path("auth/login/", views_auth.login_step1, name="auth-login"),
    path("auth/login/select-tenant/", views_auth.login_step2, name="auth-login-select-tenant"),
    path("auth/tenants/", views_auth.list_tenants, name="auth-tenants"),
    path("auth/switch-tenant/", views_auth.switch_tenant, name="auth-switch-tenant"),
    path("auth/logout/", views_auth.logout, name="auth-logout"),
    # Email verification (public)
    path("auth/verify-email/", views_email_verify.verify_email, name="auth-verify-email"),
    path("auth/resend-verification/", views_email_verify.resend_verification, name="auth-resend-verification"),
    # Forgot password (public)
    path("auth/forgot-password/", views_forgot_password.forgot_password, name="auth-forgot-password"),
    path("auth/reset-password/validate/", views_forgot_password.reset_password_validate, name="auth-reset-password-validate"),
    path("auth/reset-password/", views_forgot_password.reset_password, name="auth-reset-password"),
    # Invite acceptance (public)
    path("auth/accept-invite/validate/", views_invite.accept_invite_validate, name="auth-accept-invite-validate"),
    path("auth/accept-invite/set-password/", views_invite.accept_invite_set_password, name="auth-accept-invite-set-password"),
    # MFA login flow
    path("auth/mfa/verify/", views_mfa.mfa_verify, name="auth-mfa-verify"),
    path("auth/mfa/setup/", views_mfa.mfa_setup, name="auth-mfa-setup"),
    path("auth/mfa/setup/confirm/", views_mfa.mfa_setup_confirm, name="auth-mfa-setup-confirm"),
]
