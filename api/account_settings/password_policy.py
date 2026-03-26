"""Central password policy engine.

All password validation goes through this module. Tenant-specific settings
(min_length, require_uppercase, etc.) are read from AccountSettings with
fallback to definition defaults. Django's stock validators (common password,
numeric-only, user-similarity) are also applied as global safety nets.
"""

from datetime import timedelta

from django.contrib.auth.password_validation import (
    CommonPasswordValidator,
    NumericPasswordValidator,
    UserAttributeSimilarityValidator,
)
from django.core.exceptions import ValidationError
from django.utils import timezone

from .definitions import DEFINITION_MAP
from .models import AccountSetting

# Keys we read from tenant settings
_POLICY_KEYS = (
    "password_min_length",
    "password_require_uppercase",
    "password_require_special",
    "password_require_number",
    "password_expiry_days",
)

# Django stock validators (global safety nets, not tenant-configurable).
# MinimumLengthValidator is intentionally excluded — replaced by tenant min_length.
_STOCK_VALIDATORS = [
    UserAttributeSimilarityValidator(),
    CommonPasswordValidator(),
    NumericPasswordValidator(),
]


def get_password_policy(tenant):
    """Return the effective password policy dict for a tenant.

    Reads tenant overrides in a single query, merges with definition defaults.
    """
    overrides = dict(
        AccountSetting.objects.filter(
            tenant=tenant, key__in=_POLICY_KEYS,
        ).values_list("key", "value")
    )

    def _val(key):
        raw = overrides.get(key, DEFINITION_MAP[key].default)
        stype = DEFINITION_MAP[key].setting_type
        if stype == "boolean":
            return raw.lower() == "true"
        if stype == "choice" and raw.isdigit():
            return int(raw)
        return raw

    return {
        "min_length": _val("password_min_length"),
        "require_uppercase": _val("password_require_uppercase"),
        "require_special": _val("password_require_special"),
        "require_number": _val("password_require_number"),
        "expiry_days": _val("password_expiry_days"),
    }


def validate_password_against_policy(password, tenant, user=None):
    """Validate a password against the tenant's policy.

    Raises ``ValidationError`` with a list of all violated rules.
    """
    policy = get_password_policy(tenant)
    errors = []

    # Tenant-configurable rules
    if len(password) < policy["min_length"]:
        errors.append(
            f"Password must be at least {policy['min_length']} characters long."
        )

    if policy["require_uppercase"] and not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter.")

    if policy["require_number"] and not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one number.")

    if policy["require_special"] and not any(
        c in "!@#$%^&*()-_=+[]{}|;:'\",.<>?/`~" for c in password
    ):
        errors.append("Password must contain at least one special character.")

    # Django stock validators (global safety nets)
    for validator in _STOCK_VALIDATORS:
        try:
            validator.validate(password, user=user)
        except ValidationError as e:
            errors.extend(e.messages)

    if errors:
        raise ValidationError(errors)


_PLATFORM_DEFAULTS = {
    "min_length": 8,
    "require_uppercase": False,
    "require_special": False,
    "require_number": False,
    "expiry_days": 0,
}


def get_merged_password_policy(user):
    """Return the strictest-wins merged policy across all active tenants.

    Each rule is independent and additive — no two policies can be
    "incompatible" because rules only add requirements, never subtract.

    If the user has no active memberships, returns platform defaults.
    """
    from tenancy.models import Tenant, TenantMember, TenantStatus

    tenants = Tenant.objects.filter(
        members__user=user,
        members__is_active=True,
        status=TenantStatus.ACTIVE,
    )

    if not tenants.exists():
        return dict(_PLATFORM_DEFAULTS)

    merged = dict(_PLATFORM_DEFAULTS)
    for tenant in tenants:
        policy = get_password_policy(tenant)
        merged["min_length"] = max(merged["min_length"], policy["min_length"])
        merged["require_uppercase"] = merged["require_uppercase"] or policy["require_uppercase"]
        merged["require_number"] = merged["require_number"] or policy["require_number"]
        merged["require_special"] = merged["require_special"] or policy["require_special"]
        if policy["expiry_days"] > 0:
            if merged["expiry_days"] == 0:
                merged["expiry_days"] = policy["expiry_days"]
            else:
                merged["expiry_days"] = min(merged["expiry_days"], policy["expiry_days"])

    return merged


def validate_password_for_user(password, user):
    """Validate a password against the merged cross-tenant policy.

    Raises ``ValidationError`` with a list of all violated rules.
    """
    policy = get_merged_password_policy(user)
    errors = []

    if len(password) < policy["min_length"]:
        errors.append(
            f"Password must be at least {policy['min_length']} characters long."
        )

    if policy["require_uppercase"] and not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter.")

    if policy["require_number"] and not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one number.")

    if policy["require_special"] and not any(
        c in "!@#$%^&*()-_=+[]{}|;:'\",.<>?/`~" for c in password
    ):
        errors.append("Password must contain at least one special character.")

    for validator in _STOCK_VALIDATORS:
        try:
            validator.validate(password, user=user)
        except ValidationError as e:
            errors.extend(e.messages)

    if errors:
        raise ValidationError(errors)


_TIGHTENED_AT_KEY = "_password_policy_tightened_at"

# Complexity keys — changes to these may tighten the policy.
# password_expiry_days is excluded: the expiry check (#2) handles it naturally.
_COMPLEXITY_KEYS = (
    "password_min_length",
    "password_require_uppercase",
    "password_require_special",
    "password_require_number",
)


def is_policy_tightened(key, old_value, new_value):
    """Return True if changing *key* from *old_value* to *new_value* is stricter.

    Only complexity keys can tighten the policy; expiry changes are handled
    separately by the expiry check in ``check_password_reset_required``.
    """
    if key not in _COMPLEXITY_KEYS:
        return False

    defn = DEFINITION_MAP[key]

    if defn.setting_type == "boolean":
        # Stricter when enabling a requirement (false → true)
        return old_value.lower() == "false" and new_value.lower() == "true"

    if defn.setting_type == "choice" and old_value.isdigit() and new_value.isdigit():
        # Stricter when the numeric value increases (e.g., min_length 10 → 14)
        return int(new_value) > int(old_value)

    return False


def record_policy_tightened(tenant, user=None):
    """Stamp the ``_password_policy_tightened_at`` meta-key to *now*."""
    AccountSetting.objects.update_or_create(
        tenant=tenant,
        key=_TIGHTENED_AT_KEY,
        defaults={
            "value": timezone.now().isoformat(),
            "updated_by": user,
        },
    )


def check_password_reset_required(user, tenant=None):
    """Determine if the user must reset their password.

    When *tenant* is provided, checks that single tenant's policy (legacy).
    When *tenant* is ``None``, checks the merged policy across ALL active
    tenant memberships (strictest-wins).

    Returns (bool, reason_string | None).

    Checks:
    1. No password_changed_at set → force reset
    2. Password expired (expiry_days > 0 and password too old)
    3. Policy *tightened* after last password set (any tenant)
    """
    # 1. No password_changed_at
    if user.password_changed_at is None:
        return (True, "Password change required")

    if tenant is not None:
        # Single-tenant mode (backward compat)
        return _check_reset_for_tenant(user, tenant)

    # Merged mode: check all active tenant memberships
    from tenancy.models import Tenant, TenantMember, TenantStatus

    tenants = Tenant.objects.filter(
        members__user=user,
        members__is_active=True,
        status=TenantStatus.ACTIVE,
    )

    # 2. Password expired (merged expiry = shortest non-zero)
    merged_policy = get_merged_password_policy(user)
    expiry_days = merged_policy["expiry_days"]
    if expiry_days > 0:
        expiry_date = user.password_changed_at + timedelta(days=expiry_days)
        if expiry_date < timezone.now():
            return (True, "Your password has expired")

    # 3. Policy tightened in ANY tenant after last password set
    latest_tightened = (
        AccountSetting.objects.filter(
            tenant__in=tenants, key=_TIGHTENED_AT_KEY,
        )
        .values_list("updated_at", flat=True)
        .order_by("-updated_at")
        .first()
    )
    if latest_tightened and latest_tightened > user.password_changed_at:
        return (
            True,
            "Password policy has been updated since your last password change",
        )

    return (False, None)


def _check_reset_for_tenant(user, tenant):
    """Check reset required for a single tenant (original logic)."""
    policy = get_password_policy(tenant)
    expiry_days = policy["expiry_days"]
    if expiry_days > 0:
        expiry_date = user.password_changed_at + timedelta(days=expiry_days)
        if expiry_date < timezone.now():
            return (True, "Your password has expired")

    tightened_at_setting = (
        AccountSetting.objects.filter(
            tenant=tenant, key=_TIGHTENED_AT_KEY,
        )
        .values_list("updated_at", flat=True)
        .first()
    )
    if tightened_at_setting and tightened_at_setting > user.password_changed_at:
        return (
            True,
            "Password policy has been updated since your last password change",
        )

    return (False, None)
