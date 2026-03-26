"""Backoff profiles for rate-limited endpoints.

key_type controls how the rate limit key is constructed:
  - "email"      → key = email address
  - "ip_email"   → key = client_ip:email (prevents lockout-as-DoS)
  - "ip_user_id" → key = client_ip:user_id
  - "token"      → key = first 32 chars of token (sensitive)
"""

BACKOFF_PROFILES: dict[str, dict] = {
    # Email-sending endpoints — email-only key to cap total emails sent
    "forgot_password": {
        "key_type": "email",
        "schedule": [0, 5, 15, 30, 60, 180],
        "reset_after": 24 * 60,  # minutes
        "sensitive_key": False,
    },
    "resend_verification": {
        "key_type": "email",
        "schedule": [0, 5, 10, 30, 60],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
    "signup": {
        "key_type": "email",
        "schedule": [0, 0, 10, 30, 60, 180],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
    # Auth endpoints — ip+email so attacker can't lock out legitimate user
    "login": {
        "key_type": "ip_email",
        "schedule": [0, 0, 0, 1, 5, 15],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
    "login_select_tenant": {
        "key_type": "ip_email",
        "schedule": [0, 0, 0, 1, 5, 15],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
    # MFA endpoints — ip+user_id so attacker can't lock out legitimate user
    "mfa_verify": {
        "key_type": "ip_user_id",
        "schedule": [0, 0, 0, 1, 5, 15],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
    "mfa_setup": {
        "key_type": "ip_user_id",
        "schedule": [0, 0, 1, 5, 15],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
    "mfa_setup_confirm": {
        "key_type": "ip_user_id",
        "schedule": [0, 0, 1, 5, 15],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
    # Token-based endpoints — keyed by token prefix (sensitive)
    "accept_invite": {
        "key_type": "token",
        "schedule": [0, 0, 1, 5, 15],
        "reset_after": 24 * 60,
        "sensitive_key": True,
    },
    "verify_email": {
        "key_type": "token",
        "schedule": [0, 0, 1, 5, 15],
        "reset_after": 24 * 60,
        "sensitive_key": True,
    },
    "reset_password": {
        "key_type": "token",
        "schedule": [0, 0, 1, 5, 15],
        "reset_after": 24 * 60,
        "sensitive_key": True,
    },
    # Feature requests — ip+user_id so attacker can't lock out user
    "feature_request": {
        "key_type": "ip_user_id",
        "schedule": [0, 0, 5, 15, 30, 60],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
    # Contact us — email-keyed to cap submissions per sender
    "contact_us": {
        "key_type": "email",
        "schedule": [0, 0, 10, 30, 60, 180],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
    # Token refresh — only tracks failures (reset on success), throttle abuse
    "refresh": {
        "key_type": "token",
        "schedule": [0, 0, 0, 1, 5, 15],
        "reset_after": 24 * 60,
        "sensitive_key": False,
    },
}
