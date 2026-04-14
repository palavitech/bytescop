"""Tests for signup view and auth serializers (views_auth.py + serializers/auth.py).

Covers:
- SignupSerializer validation (email, password, duplicate, slug generation)
- signup view (success, duplicate email resend, rate limiting)
- build_full_auth_response helper
"""

from unittest.mock import patch, MagicMock

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase, APIRequestFactory

from accounts.models import User
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.rate_limit.models import RateLimitEntry
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole, TenantStatus

from api.serializers.auth import (
    SignupSerializer,
    LoginStep1Serializer,
    LoginStep2Serializer,
    build_full_auth_response,
    _permissions_payload,
)
from api.views_auth import signup, _try_resend_verification_on_duplicate

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
# SignupSerializer — unit tests
# ---------------------------------------------------------------------------


class SignupSerializerValidationTests(TestCase):
    """Test SignupSerializer field-level and cross-field validation."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()

    def _valid_data(self, **overrides):
        data = {
            "company_name": "Test Corp",
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "jane@example.com",
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        }
        data.update(overrides)
        return data

    def test_valid_data_passes(self):
        ser = SignupSerializer(data=self._valid_data())
        self.assertTrue(ser.is_valid(), ser.errors)

    def test_password_mismatch_rejected(self):
        ser = SignupSerializer(data=self._valid_data(password_confirm="Other!Pass1"))
        self.assertFalse(ser.is_valid())
        self.assertIn("password_confirm", ser.errors)

    def test_duplicate_email_rejected(self):
        _create_user(email="jane@example.com")
        ser = SignupSerializer(data=self._valid_data())
        self.assertFalse(ser.is_valid())
        self.assertIn("email", ser.errors)
        self.assertTrue(
            any("already exists" in str(e) for e in ser.errors["email"])
        )

    def test_email_lowercased(self):
        ser = SignupSerializer(data=self._valid_data(email="JANE@EXAMPLE.COM"))
        self.assertTrue(ser.is_valid(), ser.errors)
        self.assertEqual(ser.validated_data["email"], "jane@example.com")

    def test_missing_company_name_rejected(self):
        data = self._valid_data()
        del data["company_name"]
        ser = SignupSerializer(data=data)
        self.assertFalse(ser.is_valid())
        self.assertIn("company_name", ser.errors)

    def test_missing_email_rejected(self):
        data = self._valid_data()
        del data["email"]
        ser = SignupSerializer(data=data)
        self.assertFalse(ser.is_valid())
        self.assertIn("email", ser.errors)

    def test_missing_password_rejected(self):
        data = self._valid_data()
        del data["password"]
        ser = SignupSerializer(data=data)
        self.assertFalse(ser.is_valid())
        self.assertIn("password", ser.errors)

    def test_missing_first_name_rejected(self):
        data = self._valid_data()
        del data["first_name"]
        ser = SignupSerializer(data=data)
        self.assertFalse(ser.is_valid())
        self.assertIn("first_name", ser.errors)

    def test_invalid_email_format_rejected(self):
        ser = SignupSerializer(data=self._valid_data(email="not-an-email"))
        self.assertFalse(ser.is_valid())
        self.assertIn("email", ser.errors)


class SignupSerializerCreateTests(TestCase):
    """Test SignupSerializer.create() — tenant + user + membership creation."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()

    def _valid_data(self, **overrides):
        data = {
            "company_name": "New Corp",
            "first_name": "Alice",
            "last_name": "Smith",
            "email": "alice@example.com",
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        }
        data.update(overrides)
        return data

    def test_create_creates_tenant(self):
        ser = SignupSerializer(data=self._valid_data())
        ser.is_valid(raise_exception=True)
        result = ser.save()

        self.assertTrue(Tenant.objects.filter(slug="new-corp").exists())
        self.assertEqual(result["detail"], "Account created. Please check your email to verify your address.")

    def test_create_creates_user_with_unverified_email(self):
        ser = SignupSerializer(data=self._valid_data())
        ser.is_valid(raise_exception=True)
        result = ser.save()

        user = User.objects.get(email="alice@example.com")
        self.assertFalse(user.email_verified)
        self.assertIsNotNone(user.password_changed_at)

    def test_create_creates_owner_membership(self):
        ser = SignupSerializer(data=self._valid_data())
        ser.is_valid(raise_exception=True)
        result = ser.save()

        user = User.objects.get(email="alice@example.com")
        tenant = Tenant.objects.get(slug="new-corp")
        member = TenantMember.objects.get(user=user, tenant=tenant)
        self.assertEqual(member.role, TenantRole.OWNER)

    def test_create_returns_verify_token(self):
        ser = SignupSerializer(data=self._valid_data())
        ser.is_valid(raise_exception=True)
        result = ser.save()

        self.assertIn("verify_token", result)
        self.assertTrue(len(result["verify_token"]) > 10)

    def test_create_returns_correct_email(self):
        ser = SignupSerializer(data=self._valid_data())
        ser.is_valid(raise_exception=True)
        result = ser.save()

        self.assertEqual(result["email"], "alice@example.com")
        self.assertEqual(result["name"], "Alice")
        self.assertTrue(result["email_sent"])

    def test_create_assigns_default_plan(self):
        from subscriptions.models import TenantSubscription

        ser = SignupSerializer(data=self._valid_data())
        ser.is_valid(raise_exception=True)
        ser.save()

        tenant = Tenant.objects.get(slug="new-corp")
        self.assertTrue(TenantSubscription.objects.filter(tenant=tenant).exists())

    def test_create_seeds_company_name_setting(self):
        from account_settings.models import AccountSetting

        ser = SignupSerializer(data=self._valid_data())
        ser.is_valid(raise_exception=True)
        ser.save()

        tenant = Tenant.objects.get(slug="new-corp")
        setting = AccountSetting.objects.get(tenant=tenant, key="company_name")
        self.assertEqual(setting.value, "New Corp")

    def test_create_with_slug_collision(self):
        """If a tenant with the same slug exists, a counter is appended."""
        Tenant.objects.create(name="New Corp", slug="new-corp")

        ser = SignupSerializer(data=self._valid_data())
        ser.is_valid(raise_exception=True)
        result = ser.save()

        self.assertTrue(Tenant.objects.filter(slug="new-corp-1").exists())

    def test_create_weak_password_rejected(self):
        """Password that passes basic length check but fails policy validation."""
        from rest_framework.exceptions import ValidationError

        ser = SignupSerializer(data=self._valid_data(password="short", password_confirm="short"))
        # Basic validation passes since passwords match, but create() will validate policy
        if ser.is_valid():
            with self.assertRaises(ValidationError):
                ser.save()


# ---------------------------------------------------------------------------
# signup view — integration tests
# ---------------------------------------------------------------------------


class SignupViewTests(APITestCase):
    """Test the signup view function directly via APIRequestFactory."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.factory = APIRequestFactory()

    def _post_signup(self, data):
        request = self.factory.post("/api/auth/signup/", data, format="json")
        request.tenant = None
        return signup(request)

    def test_successful_signup_returns_201(self):
        response = self._post_signup({
            "company_name": "Startup Inc",
            "first_name": "Bob",
            "last_name": "Builder",
            "email": "bob@example.com",
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        })
        self.assertEqual(response.status_code, 201)
        self.assertIn("detail", response.data)
        self.assertTrue(response.data["email_sent"])

    def test_signup_duplicate_email_returns_400(self):
        _create_user(email="bob@example.com")
        response = self._post_signup({
            "company_name": "Startup Inc",
            "first_name": "Bob",
            "last_name": "Builder",
            "email": "bob@example.com",
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        })
        self.assertEqual(response.status_code, 400)

    def test_signup_missing_fields_returns_400(self):
        response = self._post_signup({
            "company_name": "Startup Inc",
        })
        self.assertEqual(response.status_code, 400)

    def test_signup_password_mismatch_returns_400(self):
        response = self._post_signup({
            "company_name": "Startup Inc",
            "first_name": "Bob",
            "last_name": "Builder",
            "email": "bob2@example.com",
            "password": STRONG_PASSWORD,
            "password_confirm": "Different!Pass1",
        })
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# _try_resend_verification_on_duplicate — unit tests
# ---------------------------------------------------------------------------


class TryResendVerificationTests(APITestCase):
    """Test _try_resend_verification_on_duplicate helper."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.factory = APIRequestFactory()

    def test_returns_false_for_empty_email(self):
        request = self.factory.post("/api/auth/signup/", {}, format="json")
        request.data = {"email": ""}
        result = _try_resend_verification_on_duplicate(request)
        self.assertFalse(result)

    def test_returns_false_for_nonexistent_email(self):
        request = self.factory.post("/api/auth/signup/", {}, format="json")
        request.data = {"email": "nobody@example.com"}
        result = _try_resend_verification_on_duplicate(request)
        self.assertFalse(result)

    def test_returns_false_for_verified_user(self):
        _create_user(email="verified@example.com", email_verified=True)
        request = self.factory.post("/api/auth/signup/", {}, format="json")
        request.data = {"email": "verified@example.com"}
        result = _try_resend_verification_on_duplicate(request)
        self.assertFalse(result)

    def test_returns_true_for_unverified_user(self):
        user = _create_user(email="unverified@example.com", email_verified=False)
        tenant = _create_tenant()
        _create_membership(user, tenant)
        request = self.factory.post("/api/auth/signup/", {}, format="json")
        request.data = {"email": "unverified@example.com"}
        result = _try_resend_verification_on_duplicate(request)
        self.assertTrue(result)

    def test_returns_true_silently_when_rate_limited(self):
        """Even when rate-limited, returns True to not leak state."""
        user = _create_user(email="ratelimited@example.com", email_verified=False)
        tenant = _create_tenant()
        _create_membership(user, tenant)

        # Exhaust rate limit
        from core.rate_limit.helpers import record_rate_limit
        for _ in range(10):
            record_rate_limit("resend_verification", email="ratelimited@example.com")

        request = self.factory.post("/api/auth/signup/", {}, format="json")
        request.data = {"email": "ratelimited@example.com"}
        result = _try_resend_verification_on_duplicate(request)
        self.assertTrue(result)


# ---------------------------------------------------------------------------
# build_full_auth_response — unit tests
# ---------------------------------------------------------------------------


class BuildFullAuthResponseTests(TestCase):
    """Test build_full_auth_response helper."""

    def setUp(self):
        cache.clear()
        self.user = _create_user(email="resp@example.com")
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        self.tenant = _create_tenant(name="Resp Corp", slug="resp-corp")
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.OWNER)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

    def test_response_contains_user_fields(self):
        data = build_full_auth_response(self.user, self.member)
        self.assertIn("user", data)
        self.assertEqual(data["user"]["email"], "resp@example.com")
        self.assertIn("id", data["user"])
        self.assertIn("first_name", data["user"])
        self.assertIn("last_name", data["user"])

    def test_response_contains_tenant_fields(self):
        data = build_full_auth_response(self.user, self.member)
        self.assertIn("tenant", data)
        self.assertEqual(data["tenant"]["slug"], "resp-corp")
        self.assertEqual(data["tenant"]["name"], "Resp Corp")
        self.assertEqual(data["tenant"]["role"], TenantRole.OWNER)

    def test_response_contains_authorization(self):
        data = build_full_auth_response(self.user, self.member)
        self.assertIn("authorization", data)
        auth = data["authorization"]
        self.assertIn("is_root", auth)
        self.assertIn("permissions", auth)
        self.assertIn("groups", auth)

    def test_owner_is_root(self):
        data = build_full_auth_response(self.user, self.member)
        self.assertTrue(data["authorization"]["is_root"])

    def test_member_is_not_root(self):
        user2 = _create_user(email="member@example.com")
        member2 = _create_membership(user2, self.tenant, role=TenantRole.MEMBER)
        data = build_full_auth_response(user2, member2)
        self.assertFalse(data["authorization"]["is_root"])

    def test_response_contains_subscription(self):
        data = build_full_auth_response(self.user, self.member)
        self.assertIn("subscription", data)

    def test_response_contains_password_reset_fields(self):
        data = build_full_auth_response(self.user, self.member)
        self.assertIn("password_reset_required", data)
        self.assertIn("password_reset_reason", data)

    def test_response_contains_date_format(self):
        data = build_full_auth_response(self.user, self.member)
        self.assertIn("date_format", data)

    def test_date_format_reads_tenant_setting(self):
        from account_settings.models import AccountSetting
        AccountSetting.objects.create(
            tenant=self.tenant,
            key="date_format",
            value="DD/MM/YYYY",
            updated_by=self.user,
        )
        data = build_full_auth_response(self.user, self.member)
        self.assertEqual(data["date_format"], "DD/MM/YYYY")

    def test_response_contains_avatar_url(self):
        data = build_full_auth_response(self.user, self.member)
        self.assertIn("avatar_url", data["user"])


# ---------------------------------------------------------------------------
# _permissions_payload — unit tests
# ---------------------------------------------------------------------------


class PermissionsPayloadTests(TestCase):
    """Test _permissions_payload helper."""

    def setUp(self):
        self.tenant = _create_tenant(name="Perm Corp", slug="perm-corp")
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)

    def test_owner_gets_all_permissions(self):
        user = _create_user(email="owner-perm@example.com")
        member = _create_membership(user, self.tenant, role=TenantRole.OWNER)
        payload = _permissions_payload(member)
        self.assertTrue(payload["is_root"])
        self.assertGreater(len(payload["permissions"]), 0)

    def test_member_gets_limited_permissions(self):
        user = _create_user(email="member-perm@example.com")
        member = _create_membership(user, self.tenant, role=TenantRole.MEMBER)
        payload = _permissions_payload(member)
        self.assertFalse(payload["is_root"])

    def test_permissions_are_sorted(self):
        user = _create_user(email="sorted@example.com")
        member = _create_membership(user, self.tenant, role=TenantRole.OWNER)
        payload = _permissions_payload(member)
        perms = payload["permissions"]
        self.assertEqual(perms, sorted(perms))
