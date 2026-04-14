"""Tests for the licensing module (service.py + views.py).

Covers:
- License dataclass and is_enterprise property
- _decode_key with mocked JWT validation
- _load_license resolution order (DB -> env -> community)
- _get_key_from_db
- get_license caching and reset_license
- has_feature helper
- validate_license_key
- License API views (GET, POST, DELETE /api/license/)
"""

import sys
from datetime import datetime, timezone as dt_timezone
from types import ModuleType
from unittest.mock import patch, MagicMock, PropertyMock

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

# Ensure a mock 'jwt' module exists so patch("jwt.decode") works even
# when PyJWT is not installed in the test environment.
if 'jwt' not in sys.modules:
    _fake_jwt = ModuleType('jwt')
    _fake_jwt.decode = lambda *a, **kw: {}  # type: ignore[attr-defined]
    sys.modules['jwt'] = _fake_jwt

from accounts.models import User
from account_settings.models import AccountSetting
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole

from licensing.service import (
    COMMUNITY,
    License,
    _decode_key,
    _get_key_from_db,
    _load_license,
    get_license,
    has_feature,
    reset_license,
    validate_license_key,
)

STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="lic@example.com", password=STRONG_PASSWORD, **kwargs):
    kwargs.setdefault("email_verified", True)
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="License Corp", slug="license-corp"):
    return Tenant.objects.create(name=name, slug=slug)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


# ---------------------------------------------------------------------------
# License dataclass — unit tests
# ---------------------------------------------------------------------------


class LicenseDataclassTests(TestCase):
    """Test the License dataclass and its properties."""

    def test_default_license_is_community(self):
        lic = License()
        self.assertEqual(lic.plan, COMMUNITY)
        self.assertFalse(lic.valid)
        self.assertFalse(lic.is_enterprise)

    def test_community_license_is_not_enterprise(self):
        lic = License(plan=COMMUNITY, valid=True)
        self.assertFalse(lic.is_enterprise)

    def test_pro_valid_not_expired_is_enterprise(self):
        lic = License(plan="pro", valid=True, expired=False)
        self.assertTrue(lic.is_enterprise)

    def test_enterprise_valid_not_expired_is_enterprise(self):
        lic = License(plan="enterprise", valid=True, expired=False)
        self.assertTrue(lic.is_enterprise)

    def test_pro_expired_is_not_enterprise(self):
        lic = License(plan="pro", valid=True, expired=True)
        self.assertFalse(lic.is_enterprise)

    def test_pro_invalid_is_not_enterprise(self):
        lic = License(plan="pro", valid=False, expired=False)
        self.assertFalse(lic.is_enterprise)

    def test_features_default_to_empty_list(self):
        lic = License()
        self.assertEqual(lic.features, [])

    def test_max_workspaces_default(self):
        lic = License()
        self.assertEqual(lic.max_workspaces, 1)


# ---------------------------------------------------------------------------
# _decode_key — unit tests
# ---------------------------------------------------------------------------


class DecodeKeyTests(TestCase):
    """Test _decode_key with mocked JWT decode."""

    def test_empty_key_returns_community(self):
        lic = _decode_key("")
        self.assertEqual(lic.plan, COMMUNITY)
        self.assertTrue(lic.valid)

    def test_whitespace_key_returns_community(self):
        lic = _decode_key("   ")
        self.assertEqual(lic.plan, COMMUNITY)
        self.assertTrue(lic.valid)

    @patch("licensing.service.PUBLIC_KEY_PATH")
    def test_missing_public_key_returns_invalid(self, mock_path):
        mock_path.exists.return_value = False
        lic = _decode_key("some-key")
        self.assertEqual(lic.plan, COMMUNITY)
        self.assertFalse(lic.valid)

    @patch("licensing.service.PUBLIC_KEY_PATH")
    def test_valid_jwt_returns_license(self, mock_path):
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "fake-public-key"

        payload = {
            "customer": "Test Co",
            "email": "test@example.com",
            "plan": "enterprise",
            "features": ["rbac", "sso"],
            "max_users": 50,
            "max_workspaces": 10,
            "issued_at": "2025-01-01T00:00:00Z",
            "expires_at": "2030-12-31T23:59:59Z",
        }

        with patch("jwt.decode", return_value=payload):
            lic = _decode_key("valid-jwt-key")

        self.assertTrue(lic.valid)
        self.assertEqual(lic.plan, "enterprise")
        self.assertEqual(lic.customer, "Test Co")
        self.assertEqual(lic.email, "test@example.com")
        self.assertIn("rbac", lic.features)
        self.assertIn("sso", lic.features)
        self.assertEqual(lic.max_users, 50)
        self.assertEqual(lic.max_workspaces, 10)
        self.assertFalse(lic.expired)

    @patch("licensing.service.PUBLIC_KEY_PATH")
    def test_expired_jwt_marks_expired(self, mock_path):
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "fake-public-key"

        payload = {
            "customer": "Expired Co",
            "plan": "pro",
            "features": ["rbac"],
            "expires_at": "2020-01-01T00:00:00Z",
        }

        with patch("jwt.decode", return_value=payload):
            lic = _decode_key("expired-jwt-key")

        self.assertTrue(lic.valid)
        self.assertTrue(lic.expired)
        self.assertFalse(lic.is_enterprise)

    @patch("licensing.service.PUBLIC_KEY_PATH")
    def test_invalid_expiry_date_marks_expired(self, mock_path):
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "fake-public-key"

        payload = {
            "customer": "Bad Date Co",
            "plan": "pro",
            "expires_at": "not-a-date",
        }

        with patch("jwt.decode", return_value=payload):
            lic = _decode_key("bad-date-jwt-key")

        self.assertTrue(lic.valid)
        self.assertTrue(lic.expired)

    @patch("licensing.service.PUBLIC_KEY_PATH")
    def test_jwt_decode_failure_returns_invalid(self, mock_path):
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "fake-public-key"

        with patch("jwt.decode", side_effect=Exception("decode failed")):
            lic = _decode_key("broken-jwt-key")

        self.assertEqual(lic.plan, COMMUNITY)
        self.assertFalse(lic.valid)

    @patch("licensing.service.PUBLIC_KEY_PATH")
    def test_no_expiry_field_is_not_expired(self, mock_path):
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "fake-public-key"

        payload = {
            "customer": "Perpetual Co",
            "plan": "enterprise",
            "features": [],
        }

        with patch("jwt.decode", return_value=payload):
            lic = _decode_key("perpetual-key")

        self.assertTrue(lic.valid)
        self.assertFalse(lic.expired)

    @patch("licensing.service.PUBLIC_KEY_PATH")
    def test_naive_expiry_treated_as_utc(self, mock_path):
        """Expiry dates without timezone are treated as UTC."""
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "fake-public-key"

        payload = {
            "customer": "Naive TZ Co",
            "plan": "pro",
            "expires_at": "2040-12-31T23:59:59",  # no timezone
        }

        with patch("jwt.decode", return_value=payload):
            lic = _decode_key("naive-tz-key")

        self.assertTrue(lic.valid)
        self.assertFalse(lic.expired)


# ---------------------------------------------------------------------------
# _get_key_from_db — unit tests
# ---------------------------------------------------------------------------


class GetKeyFromDbTests(TestCase):
    """Test _get_key_from_db helper."""

    def test_returns_empty_string_for_none_tenant(self):
        result = _get_key_from_db(None)
        self.assertEqual(result, "")

    def test_returns_empty_string_when_no_setting(self):
        tenant = _create_tenant()
        result = _get_key_from_db(tenant)
        self.assertEqual(result, "")

    def test_returns_key_from_setting(self):
        tenant = _create_tenant()
        user = _create_user()
        AccountSetting.objects.create(
            tenant=tenant,
            key="license_key",
            value="my-license-key",
            updated_by=user,
        )
        result = _get_key_from_db(tenant)
        self.assertEqual(result, "my-license-key")


# ---------------------------------------------------------------------------
# _load_license — unit tests
# ---------------------------------------------------------------------------


class LoadLicenseTests(TestCase):
    """Test _load_license resolution order."""

    def setUp(self):
        reset_license()

    def test_no_key_returns_community(self):
        lic = _load_license(tenant=None)
        self.assertEqual(lic.plan, COMMUNITY)
        self.assertTrue(lic.valid)

    @override_settings(BC_LICENSE_KEY="")
    def test_empty_env_returns_community(self):
        lic = _load_license(tenant=None)
        self.assertEqual(lic.plan, COMMUNITY)
        self.assertTrue(lic.valid)

    def test_db_key_takes_priority(self):
        """DB-stored key is used before env var."""
        tenant = _create_tenant()
        user = _create_user()
        AccountSetting.objects.create(
            tenant=tenant,
            key="license_key",
            value="db-key-value",
            updated_by=user,
        )
        with patch("licensing.service._decode_key") as mock_decode:
            mock_decode.return_value = License(plan="pro", valid=True)
            lic = _load_license(tenant=tenant)
            mock_decode.assert_called_once_with("db-key-value")

    @override_settings(BC_LICENSE_KEY="env-key-value")
    def test_env_key_used_when_no_db_key(self):
        tenant = _create_tenant()
        with patch("licensing.service._decode_key") as mock_decode:
            mock_decode.return_value = License(plan="pro", valid=True)
            lic = _load_license(tenant=tenant)
            mock_decode.assert_called_once_with("env-key-value")


# ---------------------------------------------------------------------------
# get_license / reset_license / has_feature — unit tests
# ---------------------------------------------------------------------------


class GetLicenseCachingTests(TestCase):
    """Test get_license caching and reset_license."""

    def setUp(self):
        reset_license()

    def tearDown(self):
        reset_license()

    def test_get_license_returns_community_by_default(self):
        lic = get_license()
        self.assertEqual(lic.plan, COMMUNITY)
        self.assertTrue(lic.valid)

    def test_get_license_caches_result(self):
        lic1 = get_license()
        lic2 = get_license()
        self.assertIs(lic1, lic2)  # same object instance

    def test_reset_license_clears_cache(self):
        lic1 = get_license()
        reset_license()
        lic2 = get_license()
        # Should be a new object (not the same reference)
        self.assertIsNot(lic1, lic2)


class HasFeatureTests(TestCase):
    """Test has_feature helper."""

    def setUp(self):
        reset_license()

    def tearDown(self):
        reset_license()

    def test_has_feature_false_for_community(self):
        self.assertFalse(has_feature("rbac"))

    @patch("licensing.service._load_license")
    def test_has_feature_true_when_present(self, mock_load):
        mock_load.return_value = License(
            plan="enterprise", valid=True, features=["rbac", "sso"],
        )
        reset_license()
        self.assertTrue(has_feature("rbac"))
        self.assertTrue(has_feature("sso"))

    @patch("licensing.service._load_license")
    def test_has_feature_false_when_absent(self, mock_load):
        mock_load.return_value = License(
            plan="enterprise", valid=True, features=["rbac"],
        )
        reset_license()
        self.assertFalse(has_feature("sso"))


class ValidateLicenseKeyTests(TestCase):
    """Test validate_license_key (stateless validation)."""

    def test_empty_key_returns_valid_community(self):
        lic = validate_license_key("")
        self.assertEqual(lic.plan, COMMUNITY)
        self.assertTrue(lic.valid)

    @patch("licensing.service.PUBLIC_KEY_PATH")
    def test_valid_key_returns_license(self, mock_path):
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "fake-key"

        payload = {
            "customer": "Val Co",
            "plan": "pro",
            "features": ["rbac"],
            "expires_at": "2040-12-31T23:59:59Z",
        }

        with patch("jwt.decode", return_value=payload):
            lic = validate_license_key("some-key")

        self.assertTrue(lic.valid)
        self.assertEqual(lic.plan, "pro")

    @patch("licensing.service.PUBLIC_KEY_PATH")
    def test_invalid_key_returns_invalid(self, mock_path):
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "fake-key"

        with patch("jwt.decode", side_effect=Exception("bad key")):
            lic = validate_license_key("bad-key")

        self.assertFalse(lic.valid)


# ---------------------------------------------------------------------------
# License API views — integration tests
# ---------------------------------------------------------------------------


class LicenseViewGetTests(APITestCase):
    """Test GET /api/license/ — returns current license status."""

    URL = "/api/license/"

    def setUp(self):
        reset_license()
        self.user = _create_user(email="licget@example.com")
        self.tenant = _create_tenant(name="LicGet Corp", slug="licget-corp")
        self.member = _create_membership(self.user, self.tenant)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        login_as(self.client, self.user, self.tenant)

    def tearDown(self):
        reset_license()

    def test_get_returns_200(self):
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)

    def test_get_returns_community_by_default(self):
        resp = self.client.get(self.URL)
        self.assertEqual(resp.data["plan"], "community")
        self.assertFalse(resp.data["has_key"])
        self.assertFalse(resp.data["expired"])

    def test_get_returns_expected_fields(self):
        resp = self.client.get(self.URL)
        for field in ["plan", "features", "max_users", "max_workspaces", "expired", "expires_at", "customer", "has_key"]:
            self.assertIn(field, resp.data, f"Missing field: {field}")

    def test_unauthenticated_rejected(self):
        self.client.logout()
        resp = self.client.get(self.URL)
        self.assertIn(resp.status_code, [401, 403])


class LicenseViewPostTests(APITestCase):
    """Test POST /api/license/ — activate a license key."""

    URL = "/api/license/"

    def setUp(self):
        reset_license()
        self.user = _create_user(email="licpost@example.com")
        self.tenant = _create_tenant(name="LicPost Corp", slug="licpost-corp")
        self.member = _create_membership(self.user, self.tenant)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        login_as(self.client, self.user, self.tenant)

    def tearDown(self):
        reset_license()

    def test_missing_key_returns_400(self):
        resp = self.client.post(self.URL, {}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("required", resp.data["detail"].lower())

    def test_empty_key_returns_400(self):
        resp = self.client.post(self.URL, {"key": ""}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_invalid_json_returns_400(self):
        resp = self.client.post(self.URL, "not json", content_type="application/json")
        self.assertEqual(resp.status_code, 400)

    @patch("licensing.views.validate_license_key")
    def test_invalid_key_returns_400(self, mock_validate):
        mock_validate.return_value = License(valid=False)
        resp = self.client.post(self.URL, {"key": "bad-key"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("could not be verified", resp.data["detail"])

    @patch("licensing.views.get_license")
    @patch("licensing.views.validate_license_key")
    def test_valid_key_stores_and_returns_200(self, mock_validate, mock_get):
        mock_validate.return_value = License(
            plan="enterprise", valid=True, features=["rbac"],
            customer="Test", expires_at="2040-12-31",
        )
        mock_get.return_value = License(
            plan="enterprise", valid=True, features=["rbac"],
            customer="Test", expires_at="2040-12-31",
        )
        resp = self.client.post(self.URL, {"key": "valid-key"}, format="json")
        self.assertEqual(resp.status_code, 200)

        # Verify the key was stored in DB
        setting = AccountSetting.objects.filter(
            tenant=self.tenant, key="license_key",
        ).first()
        self.assertIsNotNone(setting)
        self.assertEqual(setting.value, "valid-key")

    def test_unauthenticated_rejected(self):
        self.client.logout()
        resp = self.client.post(self.URL, {"key": "some-key"}, format="json")
        self.assertIn(resp.status_code, [401, 403])


class LicenseViewDeleteTests(APITestCase):
    """Test DELETE /api/license/ — remove license key."""

    URL = "/api/license/"

    def setUp(self):
        reset_license()
        self.user = _create_user(email="licdel@example.com")
        self.tenant = _create_tenant(name="LicDel Corp", slug="licdel-corp")
        self.member = _create_membership(self.user, self.tenant)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        login_as(self.client, self.user, self.tenant)

    def tearDown(self):
        reset_license()

    def test_delete_when_no_key_returns_200(self):
        resp = self.client.delete(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["plan"], "community")

    def test_delete_removes_stored_key(self):
        AccountSetting.objects.create(
            tenant=self.tenant,
            key="license_key",
            value="old-key",
            updated_by=self.user,
        )
        resp = self.client.delete(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(
            AccountSetting.objects.filter(
                tenant=self.tenant, key="license_key",
            ).exists()
        )

    def test_delete_returns_community_plan(self):
        AccountSetting.objects.create(
            tenant=self.tenant,
            key="license_key",
            value="old-key",
            updated_by=self.user,
        )
        resp = self.client.delete(self.URL)
        self.assertEqual(resp.data["plan"], "community")
        self.assertFalse(resp.data["has_key"])

    def test_unauthenticated_rejected(self):
        self.client.logout()
        resp = self.client.delete(self.URL)
        self.assertIn(resp.status_code, [401, 403])


# ---------------------------------------------------------------------------
# _license_response — unit tests
# ---------------------------------------------------------------------------


class LicenseResponseHelperTests(TestCase):
    """Test the _license_response helper in views.py."""

    def test_active_license_returns_full_info(self):
        from licensing.views import _license_response

        lic = License(
            plan="enterprise",
            valid=True,
            expired=False,
            features=["rbac", "sso"],
            max_users=50,
            max_workspaces=10,
            customer="Test Co",
            expires_at="2040-12-31",
        )
        resp = _license_response(lic)
        self.assertEqual(resp["plan"], "enterprise")
        self.assertEqual(resp["features"], ["rbac", "sso"])
        self.assertEqual(resp["max_users"], 50)
        self.assertFalse(resp["expired"])
        self.assertTrue(resp["has_key"])

    def test_expired_license_downgrades_to_community(self):
        from licensing.views import _license_response

        lic = License(
            plan="enterprise",
            valid=True,
            expired=True,
            features=["rbac"],
            customer="Expired Co",
        )
        resp = _license_response(lic)
        self.assertEqual(resp["plan"], "community")
        self.assertEqual(resp["features"], [])
        self.assertTrue(resp["expired"])
        self.assertTrue(resp["has_key"])

    def test_invalid_license_downgrades_to_community(self):
        from licensing.views import _license_response

        lic = License(
            plan="pro",
            valid=False,
            expired=False,
            features=["rbac"],
        )
        resp = _license_response(lic)
        self.assertEqual(resp["plan"], "community")
        self.assertEqual(resp["features"], [])

    def test_community_license_has_key_false(self):
        from licensing.views import _license_response

        lic = License(plan=COMMUNITY, valid=True, expired=False)
        resp = _license_response(lic)
        self.assertFalse(resp["has_key"])
