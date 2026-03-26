"""MFA policy engine — decides whether MFA is required for a user."""

from account_settings.models import AccountSetting
from tenancy.models import TenantRole


def _setting_is_true(tenant, key: str, default: str = "false") -> bool:
    """Read a boolean tenant setting, falling back to *default*."""
    try:
        val = AccountSetting.objects.get(tenant=tenant, key=key).value
    except AccountSetting.DoesNotExist:
        val = default
    return val.lower() in ("true", "1", "yes")


def is_mfa_required(member, tenant) -> bool:
    """Return True when the member must have MFA enabled.

    Rules (in priority order):
    1. Owner role → always required.
    2. Member belongs to the 'Administrators' group → always required.
    3. Tenant setting ``mfa_required_all`` is true → required for everyone.
    4. Otherwise → optional.
    """
    if member.role == TenantRole.OWNER:
        return True

    if member.groups.filter(name="Administrators").exists():
        return True

    if _setting_is_true(tenant, "mfa_required_all"):
        return True

    return False


def get_mfa_policy(tenant) -> dict:
    """Return the effective MFA policy for a tenant."""
    return {
        "required_all": _setting_is_true(tenant, "mfa_required_all"),
        "required_for_owners": True,
        "required_for_admins": True,
    }
