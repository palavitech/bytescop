"""Tests for password policy engine, forced reset detection, self-service
change, validation call sites, the password policy API endpoint, and
cross-tenant merged policy (strictest-wins).
"""

from datetime import timedelta

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from account_settings.definitions import DEFINITION_MAP
from account_settings.models import AccountSetting
from account_settings.password_policy import (
    check_password_reset_required,
    get_merged_password_policy,
    get_password_policy,
    is_policy_tightened,
    record_policy_tightened,
    validate_password_against_policy,
    validate_password_for_user,
)
from accounts.models import User
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole, TenantStatus

STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    kwargs.setdefault("email_verified", True)
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )




# ---------------------------------------------------------------------------
# Policy engine — get_password_policy()
# ---------------------------------------------------------------------------


class GetPasswordPolicyTests(TestCase):
    def setUp(self):
        self.tenant = _create_tenant()

    def test_returns_defaults_when_no_custom_settings(self):
        policy = get_password_policy(self.tenant)
        self.assertEqual(policy["min_length"], 10)
        self.assertTrue(policy["require_uppercase"])
        self.assertTrue(policy["require_special"])
        self.assertTrue(policy["require_number"])
        self.assertEqual(policy["expiry_days"], 0)

    def test_returns_custom_values_when_overridden(self):
        user = _create_user()
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_min_length", value="16",
            updated_by=user,
        )
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_require_uppercase", value="false",
            updated_by=user,
        )
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_expiry_days", value="90",
            updated_by=user,
        )
        policy = get_password_policy(self.tenant)
        self.assertEqual(policy["min_length"], 16)
        self.assertFalse(policy["require_uppercase"])
        self.assertEqual(policy["expiry_days"], 90)
        # Unmodified settings keep defaults
        self.assertTrue(policy["require_special"])
        self.assertTrue(policy["require_number"])


# ---------------------------------------------------------------------------
# Policy engine — validate_password_against_policy()
# ---------------------------------------------------------------------------


class ValidatePasswordTests(TestCase):
    def setUp(self):
        self.tenant = _create_tenant()

    def test_valid_password_passes(self):
        # Should not raise
        validate_password_against_policy(STRONG_PASSWORD, self.tenant)

    def test_enforces_min_length(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_min_length", value="14",
        )
        with self.assertRaises(ValidationError) as ctx:
            validate_password_against_policy("Sh0rt!pw", self.tenant)
        messages = ctx.exception.messages
        self.assertTrue(any("14 characters" in m for m in messages))

    def test_enforces_require_uppercase(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_password_against_policy("str0ngp@ss!99", self.tenant)
        messages = ctx.exception.messages
        self.assertTrue(any("uppercase" in m for m in messages))

    def test_enforces_require_special(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_password_against_policy("Str0ngPass99x", self.tenant)
        messages = ctx.exception.messages
        self.assertTrue(any("special" in m for m in messages))

    def test_enforces_require_number(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_password_against_policy("StrongP@ssword!", self.tenant)
        messages = ctx.exception.messages
        self.assertTrue(any("number" in m for m in messages))

    def test_collects_all_errors(self):
        """Multiple violations are returned together, not just the first."""
        with self.assertRaises(ValidationError) as ctx:
            validate_password_against_policy("short", self.tenant)
        messages = ctx.exception.messages
        # Should have at least min_length, uppercase, special, and number errors
        self.assertGreaterEqual(len(messages), 3)

    def test_runs_django_stock_validators_common_password(self):
        """Common passwords are rejected by the stock CommonPasswordValidator."""
        with self.assertRaises(ValidationError) as ctx:
            validate_password_against_policy("Password1!", self.tenant)
        messages = ctx.exception.messages
        self.assertTrue(any("too common" in m.lower() for m in messages))

    def test_skips_disabled_rules(self):
        """When a rule is disabled, it should not cause validation errors."""
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_require_uppercase", value="false",
        )
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_require_special", value="false",
        )
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_require_number", value="false",
        )
        # All lowercase, no special, no number — but long enough and not common
        validate_password_against_policy("averylongpasswordhere", self.tenant)


# ---------------------------------------------------------------------------
# Forced reset detection — check_password_reset_required()
# ---------------------------------------------------------------------------


class CheckPasswordResetRequiredTests(TestCase):
    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])

    def test_returns_false_when_no_policy_customized(self):
        required, reason = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)
        self.assertIsNone(reason)

    def test_returns_true_when_password_changed_at_is_none(self):
        self.user.password_changed_at = None
        self.user.save(update_fields=["password_changed_at"])
        required, reason = check_password_reset_required(self.user, self.tenant)
        self.assertTrue(required)
        self.assertIn("required", reason.lower())

    def test_returns_true_when_policy_tightened_after_password(self):
        # Set password_changed_at to the past
        self.user.password_changed_at = timezone.now() - timedelta(hours=2)
        self.user.save(update_fields=["password_changed_at"])
        # Tighten the policy (min_length default=10, now 14)
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_min_length", value="14",
        )
        record_policy_tightened(self.tenant)
        required, reason = check_password_reset_required(self.user, self.tenant)
        self.assertTrue(required)
        self.assertIn("policy", reason.lower())

    def test_returns_false_when_password_changed_after_policy(self):
        # Tighten policy first
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_min_length", value="14",
        )
        record_policy_tightened(self.tenant)
        # Then update password_changed_at to after the tightening
        self.user.password_changed_at = timezone.now() + timedelta(seconds=1)
        self.user.save(update_fields=["password_changed_at"])
        required, reason = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)
        self.assertIsNone(reason)

    def test_returns_true_when_password_expired(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_expiry_days", value="90",
        )
        self.user.password_changed_at = timezone.now() - timedelta(days=91)
        self.user.save(update_fields=["password_changed_at"])
        required, reason = check_password_reset_required(self.user, self.tenant)
        self.assertTrue(required)
        self.assertIn("expired", reason.lower())

    def test_returns_false_when_password_not_yet_expired(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_expiry_days", value="90",
        )
        # Set password_changed_at AFTER creating the setting to avoid
        # triggering condition 3 (policy changed after password set)
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        required, reason = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)
        self.assertIsNone(reason)

    def test_returns_false_when_expiry_disabled(self):
        """expiry_days=0 means never expires, regardless of age."""
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_expiry_days", value="0",
        )
        # Set password_changed_at AFTER creating the setting to avoid
        # triggering condition 3 (policy changed after password set)
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        required, reason = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)
        self.assertIsNone(reason)

    # -- Lenient changes should NOT trigger forced reset --

    def _set_policy_then_password(self, key, value):
        """Helper: set a policy setting, then update password_changed_at to now."""
        AccountSetting.objects.update_or_create(
            tenant=self.tenant, key=key,
            defaults={"value": value},
        )
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])

    def _change_policy_after_password(self, key, new_value):
        """Helper: change a policy setting after the user's password was set.

        Mimics what the settings view does: saves the value and stamps the
        ``_password_policy_tightened_at`` meta-key if the change is stricter.
        """
        import time
        time.sleep(0.01)  # ensure updated_at > password_changed_at
        setting = AccountSetting.objects.filter(tenant=self.tenant, key=key).first()
        old_value = setting.value if setting else DEFINITION_MAP[key].default
        if setting:
            setting.value = new_value
            setting.save(update_fields=["value", "updated_at"])
        else:
            AccountSetting.objects.create(
                tenant=self.tenant, key=key, value=new_value,
            )
        if is_policy_tightened(key, old_value, new_value):
            record_policy_tightened(self.tenant)

    # --- password_min_length ---

    def test_lenient_min_length_decrease_does_not_trigger_reset(self):
        """Lowering min_length (14→10) should NOT force password reset."""
        self._set_policy_then_password("password_min_length", "14")
        self._change_policy_after_password("password_min_length", "10")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)

    def test_strict_min_length_increase_triggers_reset(self):
        """Raising min_length (10→14) SHOULD force password reset."""
        self._set_policy_then_password("password_min_length", "10")
        self._change_policy_after_password("password_min_length", "14")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertTrue(required)

    def test_same_min_length_does_not_trigger_reset(self):
        """Setting min_length to same value should NOT force reset."""
        self._set_policy_then_password("password_min_length", "10")
        self._change_policy_after_password("password_min_length", "10")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)

    # --- password_require_uppercase ---

    def test_lenient_uppercase_disabled_does_not_trigger_reset(self):
        """Disabling require_uppercase (true→false) should NOT force reset."""
        self._set_policy_then_password("password_require_uppercase", "true")
        self._change_policy_after_password("password_require_uppercase", "false")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)

    def test_strict_uppercase_enabled_triggers_reset(self):
        """Enabling require_uppercase (false→true) SHOULD force reset."""
        self._set_policy_then_password("password_require_uppercase", "false")
        self._change_policy_after_password("password_require_uppercase", "true")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertTrue(required)

    # --- password_require_special ---

    def test_lenient_special_disabled_does_not_trigger_reset(self):
        """Disabling require_special (true→false) should NOT force reset."""
        self._set_policy_then_password("password_require_special", "true")
        self._change_policy_after_password("password_require_special", "false")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)

    def test_strict_special_enabled_triggers_reset(self):
        """Enabling require_special (false→true) SHOULD force reset."""
        self._set_policy_then_password("password_require_special", "false")
        self._change_policy_after_password("password_require_special", "true")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertTrue(required)

    # --- password_require_number ---

    def test_lenient_number_disabled_does_not_trigger_reset(self):
        """Disabling require_number (true→false) should NOT force reset."""
        self._set_policy_then_password("password_require_number", "true")
        self._change_policy_after_password("password_require_number", "false")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)

    def test_strict_number_enabled_triggers_reset(self):
        """Enabling require_number (false→true) SHOULD force reset."""
        self._set_policy_then_password("password_require_number", "false")
        self._change_policy_after_password("password_require_number", "true")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertTrue(required)

    # --- password_expiry_days ---

    def test_lenient_expiry_increase_does_not_trigger_reset(self):
        """Increasing expiry (30→90) should NOT force reset (handled by expiry check)."""
        self._set_policy_then_password("password_expiry_days", "30")
        self._change_policy_after_password("password_expiry_days", "90")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)

    def test_lenient_expiry_disabled_does_not_trigger_reset(self):
        """Disabling expiry (30→0) should NOT force reset."""
        self._set_policy_then_password("password_expiry_days", "30")
        self._change_policy_after_password("password_expiry_days", "0")
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)

    def test_expiry_decrease_does_not_trigger_policy_reset(self):
        """Decreasing expiry (90→30) should NOT trigger policy-changed reset.

        The expiry check (#2) itself will catch passwords that are actually
        older than the new expiry period — no need for a separate policy reset.
        """
        self._set_policy_then_password("password_expiry_days", "90")
        self._change_policy_after_password("password_expiry_days", "30")
        # Password was just changed, so it's not expired under 30-day policy either
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertFalse(required)

    # --- Combined scenario ---

    def test_mixed_lenient_and_strict_triggers_reset(self):
        """If any setting becomes stricter, force reset even if others are lenient."""
        self._set_policy_then_password("password_min_length", "14")
        # Make min_length more lenient AND require_special stricter
        self._change_policy_after_password("password_min_length", "10")
        self._change_policy_after_password("password_require_special", "true")
        # The require_special tightening from default should trigger reset
        # (default is 'true', so going from stored 'false' to 'true' is strict)
        AccountSetting.objects.update_or_create(
            tenant=self.tenant, key="password_require_special",
            defaults={"value": "true"},
        )
        # Actually set up the scenario properly: require_special was false, now true
        self._set_policy_then_password("password_require_special", "false")
        self._change_policy_after_password("password_min_length", "10")  # lenient
        self._change_policy_after_password("password_require_special", "true")  # strict
        required, _ = check_password_reset_required(self.user, self.tenant)
        self.assertTrue(required)


# ---------------------------------------------------------------------------
# Login response — password_reset_required field
# ---------------------------------------------------------------------------


class LoginResetFieldTests(APITestCase):
    LOGIN_URL = "/api/auth/login/select-tenant/"

    def setUp(self):
        cache.clear()
        self.tenant = _create_tenant()
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        self.user = _create_user(email="login@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.tenant, role=TenantRole.MEMBER)

    def test_login_returns_false_for_fresh_user(self):
        resp = self.client.post(self.LOGIN_URL, {
            "email": "login@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.id),
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["password_reset_required"])
        self.assertIsNone(resp.data["password_reset_reason"])

    def test_login_returns_true_after_policy_tightened(self):
        self.user.password_changed_at = timezone.now() - timedelta(hours=2)
        self.user.save(update_fields=["password_changed_at"])
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_min_length", value="16",
        )
        record_policy_tightened(self.tenant)
        resp = self.client.post(self.LOGIN_URL, {
            "email": "login@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.id),
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["password_reset_required"])
        self.assertIsNotNone(resp.data["password_reset_reason"])

    def test_login_returns_true_when_password_expired(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_expiry_days", value="30",
        )
        self.user.password_changed_at = timezone.now() - timedelta(days=31)
        self.user.save(update_fields=["password_changed_at"])
        resp = self.client.post(self.LOGIN_URL, {
            "email": "login@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.id),
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["password_reset_required"])
        self.assertIn("expired", resp.data["password_reset_reason"].lower())

    def test_login_includes_password_changed_at(self):
        resp = self.client.post(self.LOGIN_URL, {
            "email": "login@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.id),
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("password_changed_at", resp.data["user"])

    def test_reset_clears_forced_flag(self):
        """After changing password, login should return password_reset_required=false."""
        # Tighten policy
        self.user.password_changed_at = timezone.now() - timedelta(hours=2)
        self.user.save(update_fields=["password_changed_at"])
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_min_length", value="12",
        )
        record_policy_tightened(self.tenant)

        # Confirm forced reset
        resp = self.client.post(self.LOGIN_URL, {
            "email": "login@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.id),
        }, format="json")
        self.assertTrue(resp.data["password_reset_required"])

        # Change password via self-service
        login_as(self.client, self.user, self.tenant)
        new_pw = "N3wStr0ngP@ss!!"
        self.client.post(
            "/api/me/profile/password/",
            {"current_password": STRONG_PASSWORD, "new_password": new_pw},
            format="json",
        )

        # Login again — should no longer require reset
        resp2 = self.client.post(self.LOGIN_URL, {
            "email": "login@example.com",
            "password": new_pw,
            "tenant_id": str(self.tenant.id),
        }, format="json")
        self.assertEqual(resp2.status_code, 200)
        self.assertFalse(resp2.data["password_reset_required"])


# ---------------------------------------------------------------------------
# Self-service password change — POST /api/me/profile/password/
# ---------------------------------------------------------------------------


class SelfServicePasswordChangeTests(APITestCase):
    URL = "/api/me/profile/password/"

    def setUp(self):
        self.tenant = _create_tenant()
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        self.user = _create_user(email="change@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.tenant)
        login_as(self.client, self.user, self.tenant)

    def _post(self, data):
        return self.client.post(
            self.URL, data, format="json",
        )

    def test_success(self):
        resp = self._post({
            "current_password": STRONG_PASSWORD,
            "new_password": "N3wStr0ngP@ss!!",
        })
        self.assertEqual(resp.status_code, 200)
        self.assertIn("success", resp.data["detail"].lower())

    def test_wrong_current_password(self):
        resp = self._post({
            "current_password": "WrongPassword!1",
            "new_password": "N3wStr0ngP@ss!!",
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("current_password", resp.data)

    def test_new_password_violating_policy(self):
        resp = self._post({
            "current_password": STRONG_PASSWORD,
            "new_password": "weak",
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("new_password", resp.data)

    def test_updates_password_changed_at(self):
        old_ts = self.user.password_changed_at
        self._post({
            "current_password": STRONG_PASSWORD,
            "new_password": "N3wStr0ngP@ss!!",
        })
        self.user.refresh_from_db()
        self.assertGreater(self.user.password_changed_at, old_ts)

    def test_creates_audit_entry(self):
        from audit.models import AuditLog
        self._post({
            "current_password": STRONG_PASSWORD,
            "new_password": "N3wStr0ngP@ss!!",
        })
        self.assertTrue(
            AuditLog.objects.filter(
                resource_type="password",
                action="update",
                actor_email="change@example.com",
            ).exists()
        )

    def test_unauthenticated(self):
        self.client.logout()
        resp = self.client.post(self.URL, {
            "current_password": STRONG_PASSWORD,
            "new_password": "N3wStr0ngP@ss!!",
        }, format="json")
        self.assertEqual(resp.status_code, 401)


# ---------------------------------------------------------------------------
# Validation integration — signup, admin create, admin reset
# ---------------------------------------------------------------------------


class AdminCreateUserValidationTests(APITestCase):
    URL = "/api/authorization/members/"

    def setUp(self):
        self.tenant = _create_tenant()
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        self.admin = _create_user(email="admin@example.com")
        self.admin.password_changed_at = timezone.now()
        self.admin.save(update_fields=["password_changed_at"])
        _create_membership(self.admin, self.tenant)
        login_as(self.client, self.admin, self.tenant)

    def test_create_user_without_password_succeeds(self):
        """User creation no longer requires a password (invite flow)."""
        resp = self.client.post(
            self.URL,
            {
                "email": "newuser@example.com",
                "first_name": "New",
                "last_name": "User",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        user = User.objects.get(email="newuser@example.com")
        self.assertFalse(user.has_usable_password())


# ---------------------------------------------------------------------------
# Password policy API — GET /api/me/password-policy/
# ---------------------------------------------------------------------------


class PasswordPolicyAPITests(APITestCase):
    URL = "/api/me/password-policy/"

    def setUp(self):
        self.tenant = _create_tenant()
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        self.user = _create_user(email="policy@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.tenant)
        login_as(self.client, self.user, self.tenant)

    def test_returns_current_policy(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="password_expiry_days", value="60",
        )
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["min_length"], 10)
        self.assertTrue(resp.data["require_uppercase"])
        self.assertTrue(resp.data["require_special"])
        self.assertTrue(resp.data["require_number"])
        self.assertEqual(resp.data["expiry_days"], 60)

    def test_unauthenticated(self):
        self.client.logout()
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 401)


# ===========================================================================
# Merged password policy (strictest-wins across all active tenants)
# ===========================================================================


def _set_tenant_policy(tenant, **kwargs):
    """Set password policy settings on a tenant.

    Example: _set_tenant_policy(tenant, min_length=16, require_uppercase=True)
    """
    key_map = {
        "min_length": "password_min_length",
        "require_uppercase": "password_require_uppercase",
        "require_special": "password_require_special",
        "require_number": "password_require_number",
        "expiry_days": "password_expiry_days",
    }
    for short_key, value in kwargs.items():
        setting_key = key_map[short_key]
        AccountSetting.objects.update_or_create(
            tenant=tenant, key=setting_key,
            defaults={"value": str(value).lower() if isinstance(value, bool) else str(value)},
        )


# ---------------------------------------------------------------------------
# get_merged_password_policy(user)
# ---------------------------------------------------------------------------


class GetMergedPasswordPolicyTests(TestCase):
    """Tests for merging password policies across all active tenant memberships."""

    def setUp(self):
        self.user = _create_user(email="merge@example.com")

    def test_single_tenant_returns_that_tenants_policy(self):
        """User in one tenant → merged policy equals that tenant's policy."""
        tenant = _create_tenant(name="Only Corp", slug="only-corp")
        _create_membership(self.user, tenant)
        _set_tenant_policy(tenant, min_length=14, require_special=False)

        merged = get_merged_password_policy(self.user)
        single = get_password_policy(tenant)
        self.assertEqual(merged, single)

    def test_multi_tenant_stricter_min_length_wins(self):
        """Two tenants: min_length 8 vs 14 → merged returns 14."""
        t1 = _create_tenant(name="Lenient Corp", slug="lenient")
        t2 = _create_tenant(name="Strict Corp", slug="strict")
        _create_membership(self.user, t1)
        _create_membership(self.user, t2)
        _set_tenant_policy(t1, min_length=8)
        _set_tenant_policy(t2, min_length=14)

        merged = get_merged_password_policy(self.user)
        self.assertEqual(merged["min_length"], 14)

    def test_comparable_policies_both_booleans_required(self):
        """Tenant A requires uppercase, Tenant B requires number → merged requires both."""
        t_a = _create_tenant(name="Alpha Corp", slug="alpha")
        t_b = _create_tenant(name="Beta Corp", slug="beta")
        _create_membership(self.user, t_a)
        _create_membership(self.user, t_b)
        _set_tenant_policy(t_a, require_uppercase=True, require_number=False)
        _set_tenant_policy(t_b, require_uppercase=False, require_number=True)

        merged = get_merged_password_policy(self.user)
        self.assertTrue(merged["require_uppercase"])
        self.assertTrue(merged["require_number"])

    def test_expiry_days_nonzero_minimum_wins(self):
        """Tenant A: 90 days, Tenant B: 180 days → merged uses 90.
        Zero means 'never expires' and is ignored in the merge.
        """
        t_a = _create_tenant(name="Short Expiry", slug="short-expiry")
        t_b = _create_tenant(name="Long Expiry", slug="long-expiry")
        _create_membership(self.user, t_a)
        _create_membership(self.user, t_b)
        _set_tenant_policy(t_a, expiry_days=90)
        _set_tenant_policy(t_b, expiry_days=180)

        merged = get_merged_password_policy(self.user)
        self.assertEqual(merged["expiry_days"], 90)

    def test_expiry_days_zero_ignored(self):
        """One tenant has expiry=0 (disabled), other has 60 → merged uses 60."""
        t_a = _create_tenant(name="No Expiry", slug="no-expiry")
        t_b = _create_tenant(name="Has Expiry", slug="has-expiry")
        _create_membership(self.user, t_a)
        _create_membership(self.user, t_b)
        _set_tenant_policy(t_a, expiry_days=0)
        _set_tenant_policy(t_b, expiry_days=60)

        merged = get_merged_password_policy(self.user)
        self.assertEqual(merged["expiry_days"], 60)

    def test_no_active_tenants_returns_defaults(self):
        """User with no active memberships → platform defaults."""
        merged = get_merged_password_policy(self.user)
        self.assertEqual(merged["min_length"], 8)
        self.assertFalse(merged["require_uppercase"])
        self.assertFalse(merged["require_special"])
        self.assertFalse(merged["require_number"])
        self.assertEqual(merged["expiry_days"], 0)

    def test_inactive_membership_excluded(self):
        """User has active membership in lenient tenant, inactive in strict → strict ignored."""
        t_lenient = _create_tenant(name="Lenient", slug="lenient2")
        t_strict = _create_tenant(name="Strict", slug="strict2")
        _create_membership(self.user, t_lenient)
        _create_membership(self.user, t_strict, is_active=False)
        _set_tenant_policy(t_lenient, min_length=8)
        _set_tenant_policy(t_strict, min_length=16)

        merged = get_merged_password_policy(self.user)
        self.assertEqual(merged["min_length"], 8)

    def test_suspended_tenant_excluded(self):
        """Suspended tenant's policy is not included in the merge."""
        t_active = _create_tenant(name="Active", slug="active")
        t_suspended = _create_tenant(
            name="Suspended", slug="suspended",
            status=TenantStatus.SUSPENDED,
        )
        _create_membership(self.user, t_active)
        _create_membership(self.user, t_suspended)
        _set_tenant_policy(t_active, min_length=8)
        _set_tenant_policy(t_suspended, min_length=16)

        merged = get_merged_password_policy(self.user)
        self.assertEqual(merged["min_length"], 8)


# ---------------------------------------------------------------------------
# validate_password_for_user(password, user)
# ---------------------------------------------------------------------------


class ValidatePasswordForUserTests(TestCase):
    """Tests for password validation against the merged cross-tenant policy."""

    def setUp(self):
        self.user = _create_user(email="validate-merge@example.com")

    def test_passes_when_satisfies_all_tenants(self):
        """Password meeting the merged policy should not raise."""
        t1 = _create_tenant(name="Corp A", slug="corp-a")
        t2 = _create_tenant(name="Corp B", slug="corp-b")
        _create_membership(self.user, t1)
        _create_membership(self.user, t2)
        _set_tenant_policy(t1, min_length=8)
        _set_tenant_policy(t2, min_length=10, require_special=True)

        # STRONG_PASSWORD (14 chars, uppercase, number, special) meets both
        validate_password_for_user(STRONG_PASSWORD, self.user)

    def test_fails_when_one_tenant_min_length_not_met(self):
        """Password meets Tenant A (min 8) but not Tenant B (min 14)."""
        t_a = _create_tenant(name="Lenient A", slug="lenient-a")
        t_b = _create_tenant(name="Strict B", slug="strict-b")
        _create_membership(self.user, t_a)
        _create_membership(self.user, t_b)
        _set_tenant_policy(t_a, min_length=8)
        _set_tenant_policy(t_b, min_length=14)

        with self.assertRaises(ValidationError) as ctx:
            validate_password_for_user("Sh0rt!pw9", self.user)
        self.assertTrue(any("14" in m for m in ctx.exception.messages))

    def test_comparable_policies_must_satisfy_both(self):
        """Tenant A requires uppercase, Tenant B requires number → both checked."""
        t_a = _create_tenant(name="Upper Corp", slug="upper-corp")
        t_b = _create_tenant(name="Number Corp", slug="number-corp")
        _create_membership(self.user, t_a)
        _create_membership(self.user, t_b)
        _set_tenant_policy(t_a, require_uppercase=True, require_number=False,
                           require_special=False)
        _set_tenant_policy(t_b, require_uppercase=False, require_number=True,
                           require_special=False)

        # No uppercase, no number → should fail both
        with self.assertRaises(ValidationError) as ctx:
            validate_password_for_user("longpasswordhere!!", self.user)
        messages = " ".join(ctx.exception.messages)
        self.assertIn("uppercase", messages)
        self.assertIn("number", messages)

    def test_no_tenants_uses_defaults(self):
        """User with no memberships → default policy (min 8, no booleans)."""
        # 8 chars, lowercase only, no special, no number — meets default
        validate_password_for_user("averylongpasswordhere", self.user)


# ---------------------------------------------------------------------------
# check_password_reset_required(user) — merged (no tenant arg)
# ---------------------------------------------------------------------------


class MergedCheckPasswordResetRequiredTests(TestCase):
    """Tests for check_password_reset_required using merged policy (no tenant)."""

    def setUp(self):
        self.user = _create_user(email="reset-merge@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])

    def test_no_reset_needed_when_policies_not_tightened(self):
        """Fresh password, no policy tightening → no reset required."""
        t = _create_tenant(name="Normal", slug="normal")
        _create_membership(self.user, t)

        required, reason = check_password_reset_required(self.user)
        self.assertFalse(required)
        self.assertIsNone(reason)

    def test_any_tenant_tightened_triggers_reset(self):
        """Policy tightened in Tenant B (not A) → still forces reset."""
        t_a = _create_tenant(name="Stable", slug="stable")
        t_b = _create_tenant(name="Tightened", slug="tightened")
        _create_membership(self.user, t_a)
        _create_membership(self.user, t_b)

        # Set password in the past
        self.user.password_changed_at = timezone.now() - timedelta(hours=2)
        self.user.save(update_fields=["password_changed_at"])

        # Tighten policy on Tenant B only
        _set_tenant_policy(t_b, min_length=16)
        record_policy_tightened(t_b)

        required, reason = check_password_reset_required(self.user)
        self.assertTrue(required)
        self.assertIn("policy", reason.lower())

    def test_expiry_uses_shortest_nonzero(self):
        """Tenant A: 90 days, Tenant B: 0 (disabled) → expired after 91 days."""
        t_a = _create_tenant(name="Expiry 90", slug="expiry-90")
        t_b = _create_tenant(name="No Expiry", slug="no-expiry2")
        _create_membership(self.user, t_a)
        _create_membership(self.user, t_b)
        _set_tenant_policy(t_a, expiry_days=90)
        _set_tenant_policy(t_b, expiry_days=0)

        self.user.password_changed_at = timezone.now() - timedelta(days=91)
        self.user.save(update_fields=["password_changed_at"])

        required, reason = check_password_reset_required(self.user)
        self.assertTrue(required)
        self.assertIn("expired", reason.lower())

    def test_password_never_set_always_requires_reset(self):
        """password_changed_at=None → always requires reset, regardless of tenants."""
        t = _create_tenant(name="Any", slug="any")
        _create_membership(self.user, t)
        self.user.password_changed_at = None
        self.user.save(update_fields=["password_changed_at"])

        required, reason = check_password_reset_required(self.user)
        self.assertTrue(required)
        self.assertIn("required", reason.lower())


# ---------------------------------------------------------------------------
# Caller integration — merged policy at API level
# ---------------------------------------------------------------------------


class MergedPolicyChangePasswordTests(APITestCase):
    """Self-service password change should validate against merged policy."""
    URL = "/api/me/profile/password/"

    def setUp(self):
        cache.clear()
        self.t_lenient = _create_tenant(name="Lenient T", slug="lenient-t")
        self.t_strict = _create_tenant(name="Strict T", slug="strict-t")
        seed_permissions()
        create_default_groups_for_tenant(self.t_lenient)
        create_default_groups_for_tenant(self.t_strict)
        self.user = _create_user(email="multi@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.t_lenient)
        _create_membership(self.user, self.t_strict, role=TenantRole.MEMBER)
        # Strict tenant requires min 14 chars
        _set_tenant_policy(self.t_strict, min_length=14)
        # Lenient tenant keeps defaults (min 10)
        login_as(self.client, self.user, self.t_lenient)

    def test_rejects_password_meeting_current_tenant_but_not_merged(self):
        """Password meets lenient tenant (min 10) but not strict (min 14) → rejected."""
        resp = self.client.post(
            self.URL,
            {"current_password": STRONG_PASSWORD, "new_password": "Sh0rtP@ss!1"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("new_password", resp.data)


class MergedPolicyGetEndpointTests(APITestCase):
    """GET /api/me/password-policy/ should return merged policy."""
    URL = "/api/me/password-policy/"

    def setUp(self):
        cache.clear()
        self.t_a = _create_tenant(name="T Alpha", slug="t-alpha")
        self.t_b = _create_tenant(name="T Beta", slug="t-beta")
        seed_permissions()
        create_default_groups_for_tenant(self.t_a)
        create_default_groups_for_tenant(self.t_b)
        self.user = _create_user(email="policy-merge@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.t_a)
        _create_membership(self.user, self.t_b, role=TenantRole.MEMBER)
        _set_tenant_policy(self.t_a, min_length=8)
        _set_tenant_policy(self.t_b, min_length=14, require_special=True)
        login_as(self.client, self.user, self.t_a)

    def test_returns_merged_policy_not_current_tenant(self):
        """Even though request is on Tenant A (min 8), merged returns 14."""
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["min_length"], 14)
        self.assertTrue(resp.data["require_special"])


class MergedPolicyLoginForcedResetTests(APITestCase):
    """Login should check merged policy for forced reset."""
    LOGIN_URL = "/api/auth/login/select-tenant/"

    def setUp(self):
        cache.clear()
        self.t_a = _create_tenant(name="Login A", slug="login-a")
        self.t_b = _create_tenant(name="Login B", slug="login-b")
        seed_permissions()
        create_default_groups_for_tenant(self.t_a)
        create_default_groups_for_tenant(self.t_b)
        self.user = _create_user(email="login-merge@example.com")
        self.user.password_changed_at = timezone.now() - timedelta(hours=2)
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.t_a, role=TenantRole.MEMBER)
        _create_membership(self.user, self.t_b, role=TenantRole.MEMBER)

    def test_login_forces_reset_when_other_tenant_tightened(self):
        """Logging into Tenant A should force reset if Tenant B tightened policy."""
        _set_tenant_policy(self.t_b, min_length=16)
        record_policy_tightened(self.t_b)

        resp = self.client.post(self.LOGIN_URL, {
            "email": "login-merge@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.t_a.id),
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["password_reset_required"])


# ---------------------------------------------------------------------------
# CLI reset_password with strict tenant policy — safety net test
# ---------------------------------------------------------------------------


class CLIResetThenLoginForcedResetTests(APITestCase):
    """Verify that resetting a password via the management command with a value
    that passes Django validators but fails the tenant policy results in
    ``password_reset_required=True`` on the next login.

    This covers the scenario where a server admin uses
    ``./reset-password.sh`` to recover access — the CLI only runs Django's
    built-in validators, not the tenant policy. The login safety net must
    catch the gap and force a proper password change.
    """

    LOGIN_URL = "/api/auth/login/select-tenant/"

    def setUp(self):
        cache.clear()
        # Mark install complete so SetupGateMiddleware doesn't block requests
        from core.models import InstallState
        InstallState.objects.update_or_create(id=1, defaults={"installed": True})
        self.tenant = _create_tenant()
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        self.user = _create_user(email="cli-reset@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.tenant, role=TenantRole.MEMBER)

    def test_cli_weak_password_triggers_forced_reset_on_login(self):
        """Admin resets password via CLI to a value that passes Django but
        fails tenant policy → login returns password_reset_required=True."""
        # Tighten tenant policy: require uppercase + special + number
        for key, val in [
            ("password_require_uppercase", "true"),
            ("password_require_special", "true"),
            ("password_require_number", "true"),
        ]:
            AccountSetting.objects.create(
                tenant=self.tenant, key=key, value=val,
            )
        record_policy_tightened(self.tenant)

        # Simulate CLI reset: set a password that passes Django validators
        # (10+ chars, not common, not numeric-only, not similar to user)
        # but FAILS tenant policy (no uppercase, no special, no number)
        weak_password = "averylongpasswordhere"
        self.user.set_password(weak_password)
        self.user.save(update_fields=["password"])
        # NOTE: password_changed_at is NOT updated — the management command
        # only calls set_password + save(update_fields=["password"]).
        # This is what triggers the safety net: the tightened_at
        # timestamp is newer than password_changed_at.

        # Login should succeed but flag forced reset
        resp = self.client.post(self.LOGIN_URL, {
            "email": "cli-reset@example.com",
            "password": weak_password,
            "tenant_id": str(self.tenant.id),
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["password_reset_required"])
        self.assertIn("policy", resp.data["password_reset_reason"].lower())
