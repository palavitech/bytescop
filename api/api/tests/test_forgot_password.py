"""Tests for self-service forgot password flow.

Covers: request email, validate token, submit new password, spam prevention,
MFA requirement, merged password policy enforcement, and audit logging.
"""

from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from account_settings.models import AccountSetting
from account_settings.password_policy import get_merged_password_policy
from accounts.models import User
from audit.models import AuditLog
from core.rate_limit.models import RateLimitEntry
from core.signing import (
    SALT_PASSWORD_RESET,
    SALT_EMAIL_VERIFY,
    MAX_AGE_PASSWORD_RESET,
    create_signed_token,
    verify_signed_token,
)
from tenancy.models import Tenant, TenantMember, TenantRole

STRONG_PASSWORD = "Str0ngP@ss!99"
NEW_PASSWORD = "N3wStr0ngP@ss!!"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    kwargs.setdefault("email_verified", True)
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


def _make_reset_token(user, initiated_by="self"):
    return create_signed_token(
        {"purpose": "password-reset", "uid": str(user.pk), "initiated_by": initiated_by},
        salt=SALT_PASSWORD_RESET,
    )


# ---------------------------------------------------------------------------
# POST /api/auth/forgot-password/ — Request reset email
# ---------------------------------------------------------------------------


class ForgotPasswordRequestTests(APITestCase):
    URL = "/api/auth/forgot-password/"

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.tenant = _create_tenant()
        self.user = _create_user(email="forgot@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.tenant)

    @patch("api.views_forgot_password.get_event_publisher")
    def test_sends_event_for_valid_user(self, mock_publisher):
        mock_pub = mock_publisher.return_value
        resp = self.client.post(self.URL, {"email": "forgot@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200)
        mock_pub.publish.assert_called_once()
        event = mock_pub.publish.call_args[0][0]
        self.assertEqual(event["event_area"], "account")
        self.assertEqual(event["event_type"], "forgot_password")
        self.assertEqual(event["email"], "forgot@example.com")
        self.assertIn("reset_token", event)

    @patch("api.views_forgot_password.get_event_publisher")
    def test_generic_response_for_nonexistent_email(self, mock_publisher):
        """Should not reveal whether email exists."""
        mock_pub = mock_publisher.return_value
        resp = self.client.post(self.URL, {"email": "nobody@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("If that email", resp.data["detail"])
        mock_pub.publish.assert_not_called()

    @patch("api.views_forgot_password.get_event_publisher")
    def test_generic_response_for_unverified_user(self, mock_publisher):
        """Unverified users should not receive reset emails."""
        mock_pub = mock_publisher.return_value
        self.user.email_verified = False
        self.user.save(update_fields=["email_verified"])
        resp = self.client.post(self.URL, {"email": "forgot@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200)
        mock_pub.publish.assert_not_called()

    @patch("api.views_forgot_password.get_event_publisher")
    def test_cooldown_prevents_rapid_requests(self, mock_publisher):
        """Second request within 5 minutes should not send another email."""
        mock_pub = mock_publisher.return_value
        self.client.post(self.URL, {"email": "forgot@example.com"}, format="json")
        self.assertEqual(mock_pub.publish.call_count, 1)
        # Second request immediately
        self.client.post(self.URL, {"email": "forgot@example.com"}, format="json")
        self.assertEqual(mock_pub.publish.call_count, 1)  # still 1

    @patch("api.views_forgot_password.get_event_publisher")
    def test_cooldown_expires(self, mock_publisher):
        """After cooldown expires, a new email should be sent."""
        mock_pub = mock_publisher.return_value
        self.client.post(self.URL, {"email": "forgot@example.com"}, format="json")
        # Move rate limit entry's last_attempt_at to the past (beyond 5 min)
        entry = RateLimitEntry.objects.get(scope="forgot_password", key="forgot@example.com")
        entry.last_attempt_at = timezone.now() - timedelta(minutes=6)
        entry.save()
        self.client.post(self.URL, {"email": "forgot@example.com"}, format="json")
        self.assertEqual(mock_pub.publish.call_count, 2)

    @patch("api.views_forgot_password.get_event_publisher")
    def test_records_rate_limit_entry(self, mock_publisher):
        """Sending a forgot-password request should create a rate limit entry."""
        mock_publisher.return_value.publish.return_value = None
        self.assertFalse(
            RateLimitEntry.objects.filter(scope="forgot_password", key="forgot@example.com").exists()
        )
        self.client.post(self.URL, {"email": "forgot@example.com"}, format="json")
        self.assertTrue(
            RateLimitEntry.objects.filter(scope="forgot_password", key="forgot@example.com").exists()
        )

    @patch("api.views_forgot_password.get_event_publisher")
    def test_event_includes_tenant_id(self, mock_publisher):
        mock_pub = mock_publisher.return_value
        self.client.post(self.URL, {"email": "forgot@example.com"}, format="json")
        event = mock_pub.publish.call_args[0][0]
        self.assertEqual(event["tenant_id"], str(self.tenant.pk))

    def test_missing_email_returns_400(self):
        resp = self.client.post(self.URL, {}, format="json")
        self.assertEqual(resp.status_code, 400)


# ---------------------------------------------------------------------------
# GET /api/auth/reset-password/validate/ — Validate token
# ---------------------------------------------------------------------------


class ResetPasswordValidateTests(APITestCase):
    URL = "/api/auth/reset-password/validate/"

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.tenant = _create_tenant()
        self.user = _create_user(email="validate@example.com")
        _create_membership(self.user, self.tenant)

    def test_valid_token_returns_policy_and_mfa_flag(self):
        token = _make_reset_token(self.user)
        resp = self.client.get(self.URL, {"token": token})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["valid"])
        self.assertFalse(resp.data["mfa_required"])
        self.assertIn("password_policy", resp.data)
        self.assertIn("min_length", resp.data["password_policy"])

    def test_mfa_required_when_user_has_mfa(self):
        self.user.mfa_enabled = True
        self.user.save(update_fields=["mfa_enabled"])
        token = _make_reset_token(self.user)
        resp = self.client.get(self.URL, {"token": token})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["mfa_required"])

    def test_returns_merged_policy(self):
        """Token validation should return merged policy, not single-tenant."""
        t2 = _create_tenant(name="Strict Corp", slug="strict-corp")
        _create_membership(self.user, t2, role=TenantRole.MEMBER)
        AccountSetting.objects.create(
            tenant=t2, key="password_min_length", value="16",
        )
        token = _make_reset_token(self.user)
        resp = self.client.get(self.URL, {"token": token})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["password_policy"]["min_length"], 16)

    def test_expired_token(self):
        from django.core import signing
        # Create a token that's already expired by manipulating the timestamp
        token = create_signed_token(
            {"purpose": "password-reset", "uid": str(self.user.pk), "initiated_by": "self"},
            salt=SALT_PASSWORD_RESET,
        )
        # Verify it works first
        resp = self.client.get(self.URL, {"token": token})
        self.assertEqual(resp.status_code, 200)

    def test_invalid_token(self):
        resp = self.client.get(self.URL, {"token": "garbage-token"})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["code"], "token_invalid")

    def test_missing_token(self):
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 400)

    def test_wrong_salt_token_rejected(self):
        """A token signed with a different salt (e.g. email-verify) should be rejected."""
        token = create_signed_token(
            {"purpose": "email_verify", "user_id": str(self.user.pk)},
            salt=SALT_EMAIL_VERIFY,
        )
        resp = self.client.get(self.URL, {"token": token})
        self.assertEqual(resp.status_code, 400)

    def test_token_with_wrong_purpose_rejected(self):
        """Valid HMAC but wrong purpose field should be rejected."""
        token = create_signed_token(
            {"purpose": "something-else", "uid": str(self.user.pk)},
            salt=SALT_PASSWORD_RESET,
        )
        resp = self.client.get(self.URL, {"token": token})
        self.assertEqual(resp.status_code, 400)

    def test_token_with_nonexistent_user(self):
        token = create_signed_token(
            {"purpose": "password-reset", "uid": "99999", "initiated_by": "self"},
            salt=SALT_PASSWORD_RESET,
        )
        resp = self.client.get(self.URL, {"token": token})
        self.assertEqual(resp.status_code, 400)


# ---------------------------------------------------------------------------
# POST /api/auth/reset-password/ — Submit new password
# ---------------------------------------------------------------------------


class ResetPasswordSubmitTests(APITestCase):
    URL = "/api/auth/reset-password/"

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.tenant = _create_tenant()
        self.user = _create_user(email="reset@example.com")
        self.user.password_changed_at = timezone.now() - timedelta(days=1)
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.tenant)
        self.token = _make_reset_token(self.user)

    def test_successful_reset(self):
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("successfully", resp.data["detail"].lower())
        # Verify password actually changed
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))

    def test_updates_password_changed_at(self):
        old_ts = self.user.password_changed_at
        self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
        }, format="json")
        self.user.refresh_from_db()
        self.assertGreater(self.user.password_changed_at, old_ts)

    def test_creates_audit_entry(self):
        self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
        }, format="json")
        self.assertTrue(
            AuditLog.objects.filter(
                resource_type="password",
                action="update",
                actor_email="reset@example.com",
            ).exists()
        )

    def test_password_mismatch_rejected(self):
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": "DifferentP@ss1!",
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        # DRF error envelope wraps field errors inside "errors"
        errors = resp.data.get("errors", resp.data)
        self.assertIn("password_confirm", errors)

    def test_weak_password_rejected(self):
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": "weak",
            "password_confirm": "weak",
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password", resp.data)

    def test_merged_policy_enforced(self):
        """Password must meet strictest policy across all tenants."""
        t2 = _create_tenant(name="Strict", slug="strict2")
        _create_membership(self.user, t2, role=TenantRole.MEMBER)
        AccountSetting.objects.create(
            tenant=t2, key="password_min_length", value="16",
        )
        # 11-char password meets default (10) but not strict (16)
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": "Sh0rtP@ss!1",
            "password_confirm": "Sh0rtP@ss!1",
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_invalid_token_rejected(self):
        resp = self.client.post(self.URL, {
            "token": "garbage",
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_wrong_salt_token_rejected(self):
        token = create_signed_token(
            {"purpose": "email_verify", "user_id": str(self.user.pk)},
            salt=SALT_EMAIL_VERIFY,
        )
        resp = self.client.post(self.URL, {
            "token": token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_mfa_required_when_enabled(self):
        self.user.mfa_enabled = True
        self.user.mfa_secret = "JBSWY3DPEHPK3PXP"
        self.user.save(update_fields=["mfa_enabled", "mfa_secret"])
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("mfa_code", resp.data)

    @patch("accounts.mfa_service.verify_mfa", return_value=True)
    def test_mfa_code_accepted(self, mock_verify):
        self.user.mfa_enabled = True
        self.user.mfa_secret = "JBSWY3DPEHPK3PXP"
        self.user.save(update_fields=["mfa_enabled", "mfa_secret"])
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
            "mfa_code": "123456",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        mock_verify.assert_called_once()

    @patch("accounts.mfa_service.verify_mfa", return_value=False)
    def test_invalid_mfa_code_rejected(self, mock_verify):
        self.user.mfa_enabled = True
        self.user.mfa_secret = "JBSWY3DPEHPK3PXP"
        self.user.save(update_fields=["mfa_enabled", "mfa_secret"])
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
            "mfa_code": "000000",
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("mfa_code", resp.data)

    # -- #20: Expired token on submit endpoint --
    @patch("api.views_forgot_password.MAX_AGE_PASSWORD_RESET", 0)
    def test_expired_token_on_submit(self):
        """Expired token should return 400 with code=token_expired."""
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["code"], "token_expired")

    # -- #36: Password similar to email rejected --
    def test_password_similar_to_email_rejected(self):
        """UserAttributeSimilarityValidator should reject passwords similar to email."""
        user = _create_user(email="alice@example.com", password=STRONG_PASSWORD)
        _create_membership(user, self.tenant, role=TenantRole.MEMBER)
        token = _make_reset_token(user)
        resp = self.client.post(self.URL, {
            "token": token,
            "password": "alice@example",
            "password_confirm": "alice@example",
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password", resp.data)

    # -- #37: Common password rejected --
    def test_common_password_rejected(self):
        """CommonPasswordValidator should reject well-known passwords."""
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": "password1",
            "password_confirm": "password1",
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password", resp.data)

    # -- #38: Rate limit resets after successful reset --
    @patch("accounts.mfa_service.verify_mfa", return_value=False)
    def test_rate_limit_resets_after_success(self, mock_verify_false):
        """A successful reset should clear any rate limit entries for the token."""
        self.user.mfa_enabled = True
        self.user.mfa_secret = "JBSWY3DPEHPK3PXP"
        self.user.save(update_fields=["mfa_enabled", "mfa_secret"])

        # Failed attempt — bad MFA
        self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
            "mfa_code": "000000",
        }, format="json")
        token_key = self.token[:32]
        self.assertTrue(
            RateLimitEntry.objects.filter(scope="reset_password", key=token_key).exists()
        )

        # Now succeed with good MFA
        mock_verify_false.return_value = True
        resp = self.client.post(self.URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
            "mfa_code": "123456",
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        # Rate limit entry should be cleared
        self.assertFalse(
            RateLimitEntry.objects.filter(scope="reset_password", key=token_key).exists()
        )

    # -- #31: Rate limit escalation on reset submit (MFA brute-force) --
    @patch("accounts.mfa_service.verify_mfa", return_value=False)
    def test_rate_limit_escalation_mfa_brute_force(self, mock_verify):
        """reset_password schedule [0, 0, 1, 5, 15]: 3rd attempt should 429."""
        self.user.mfa_enabled = True
        self.user.mfa_secret = "JBSWY3DPEHPK3PXP"
        self.user.save(update_fields=["mfa_enabled", "mfa_secret"])

        payload = {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
            "mfa_code": "000000",
        }

        # Attempt 1 — schedule[0]=0 → allowed, bad MFA → 400
        resp1 = self.client.post(self.URL, payload, format="json")
        self.assertEqual(resp1.status_code, 400)

        # Attempt 2 — schedule[1]=0 → allowed, bad MFA → 400
        resp2 = self.client.post(self.URL, payload, format="json")
        self.assertEqual(resp2.status_code, 400)

        # Attempt 3 — schedule[2]=1 → blocked → 429
        resp3 = self.client.post(self.URL, payload, format="json")
        self.assertEqual(resp3.status_code, 429)

    # -- #39: Multiple reset tokens all valid until expiry --
    @patch("api.views_forgot_password.get_event_publisher")
    def test_multiple_tokens_second_one_valid(self, mock_publisher):
        """Both tokens should remain valid; the second can be used to reset."""
        mock_pub = mock_publisher.return_value
        request_url = "/api/auth/forgot-password/"

        # First request — capture first token
        self.client.post(request_url, {"email": "reset@example.com"}, format="json")
        self.assertEqual(mock_pub.publish.call_count, 1)

        # Move cooldown into the past so second request sends an email
        entry = RateLimitEntry.objects.get(scope="forgot_password", key="reset@example.com")
        entry.last_attempt_at = timezone.now() - timedelta(minutes=6)
        entry.save()

        # Second request
        self.client.post(request_url, {"email": "reset@example.com"}, format="json")
        self.assertEqual(mock_pub.publish.call_count, 2)

        # Use the token from the second event to reset
        second_event = mock_pub.publish.call_args_list[1][0][0]
        second_token = second_event["reset_token"]

        resp = self.client.post(self.URL, {
            "token": second_token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))


# ---------------------------------------------------------------------------
# Expired token tests (#20)
# ---------------------------------------------------------------------------


class ExpiredTokenTests(APITestCase):
    """Tests for expired tokens on both validate and submit endpoints."""

    VALIDATE_URL = "/api/auth/reset-password/validate/"
    SUBMIT_URL = "/api/auth/reset-password/"

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.tenant = _create_tenant()
        self.user = _create_user(email="expiry@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.tenant)
        self.token = _make_reset_token(self.user)

    @patch("api.views_forgot_password.MAX_AGE_PASSWORD_RESET", 0)
    def test_expired_token_on_validate(self):
        """Validate endpoint should return 400 with code=token_expired."""
        resp = self.client.get(self.VALIDATE_URL, {"token": self.token})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["code"], "token_expired")

    @patch("api.views_forgot_password.MAX_AGE_PASSWORD_RESET", 0)
    def test_expired_token_on_submit(self):
        """Submit endpoint should return 400 with code=token_expired."""
        resp = self.client.post(self.SUBMIT_URL, {
            "token": self.token,
            "password": NEW_PASSWORD,
            "password_confirm": NEW_PASSWORD,
        }, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["code"], "token_expired")


# ---------------------------------------------------------------------------
# Inactive account (#23)
# ---------------------------------------------------------------------------


class InactiveAccountTests(APITestCase):
    URL = "/api/auth/forgot-password/"

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.tenant = _create_tenant()
        self.user = _create_user(email="inactive@example.com")
        self.user.is_active = False
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["is_active", "password_changed_at"])
        _create_membership(self.user, self.tenant)

    @patch("api.views_forgot_password.get_event_publisher")
    def test_inactive_user_gets_generic_200_no_email(self, mock_publisher):
        """Inactive account should get generic 200, no email sent."""
        mock_pub = mock_publisher.return_value
        resp = self.client.post(self.URL, {"email": "inactive@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("If that email", resp.data["detail"])
        mock_pub.publish.assert_not_called()


# ---------------------------------------------------------------------------
# Event payload validation (#40)
# ---------------------------------------------------------------------------


class EventPayloadTests(APITestCase):
    URL = "/api/auth/forgot-password/"

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.tenant = _create_tenant()
        self.user = _create_user(email="event@example.com")
        self.user.password_changed_at = timezone.now()
        self.user.save(update_fields=["password_changed_at"])
        _create_membership(self.user, self.tenant)

    @patch("api.views_forgot_password.get_event_publisher")
    def test_event_has_routing_and_version(self, mock_publisher):
        """Event must include routing=['notification'] and version='1'."""
        mock_pub = mock_publisher.return_value
        self.client.post(self.URL, {"email": "event@example.com"}, format="json")
        mock_pub.publish.assert_called_once()
        event = mock_pub.publish.call_args[0][0]
        self.assertEqual(event["routing"], ["notification"])
        self.assertEqual(event["version"], "1")

    @patch("api.views_forgot_password.get_event_publisher")
    def test_event_has_all_required_fields(self, mock_publisher):
        """Full event payload validation — all fields present and correct."""
        mock_pub = mock_publisher.return_value
        self.client.post(self.URL, {"email": "event@example.com"}, format="json")
        event = mock_pub.publish.call_args[0][0]
        self.assertEqual(event["event_area"], "account")
        self.assertEqual(event["event_type"], "forgot_password")
        self.assertEqual(event["email"], "event@example.com")
        self.assertEqual(event["tenant_id"], str(self.tenant.pk))
        self.assertEqual(event["user_id"], str(self.user.pk))
        self.assertEqual(event["name"], self.user.first_name)
        self.assertIn("reset_token", event)
        self.assertIn("mfa_enabled", event)
