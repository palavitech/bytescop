"""Tests for email verification endpoints."""

from unittest.mock import patch

from django.core.cache import cache
from rest_framework.test import APITestCase

from core.rate_limit.models import RateLimitEntry

from accounts.models import User
from core.signing import (
    SALT_EMAIL_VERIFY,
    SALT_MFA_CHALLENGE,
    create_signed_token,
)
from tenancy.models import Tenant, TenantMember, TenantRole, TenantStatus

STRONG_PASSWORD = "Str0ngP@ss!99"
VERIFY_URL = "/api/auth/verify-email/"
RESEND_URL = "/api/auth/resend-verification/"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp"):
    return Tenant.objects.create(name=name, slug=slug)


def _create_membership(user, tenant, role=TenantRole.OWNER):
    return TenantMember.objects.create(tenant=tenant, user=user, role=role)


def _make_verify_token(user):
    return create_signed_token(
        {"user_id": str(user.pk), "purpose": "email_verify"},
        salt=SALT_EMAIL_VERIFY,
    )


# ---------------------------------------------------------------------------
# GET /api/auth/verify-email/
# ---------------------------------------------------------------------------


class VerifyEmailTests(APITestCase):

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.user = _create_user(email_verified=False)
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)

    def test_valid_token_verifies_email(self):
        token = _make_verify_token(self.user)
        response = self.client.get(VERIFY_URL, {"token": token})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.email_verified)

    def test_already_verified_returns_200(self):
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        token = _make_verify_token(self.user)
        response = self.client.get(VERIFY_URL, {"token": token})
        self.assertEqual(response.status_code, 200)
        self.assertIn("already verified", response.data["detail"].lower())

    def test_expired_token_returns_400(self):
        token = _make_verify_token(self.user)
        # Verify with max_age=0 won't work from the endpoint, so we create
        # a token that is already expired by manipulating the timestamp.
        # Instead, we patch MAX_AGE_EMAIL_VERIFY to 0.
        with patch("api.views_email_verify.MAX_AGE_EMAIL_VERIFY", 0):
            response = self.client.get(VERIFY_URL, {"token": token})
        self.assertEqual(response.status_code, 400)
        self.assertIn("expired", response.data["detail"].lower())

    def test_invalid_token_returns_400(self):
        response = self.client.get(VERIFY_URL, {"token": "garbage-token"})
        self.assertEqual(response.status_code, 400)

    def test_missing_token_returns_400(self):
        response = self.client.get(VERIFY_URL)
        self.assertEqual(response.status_code, 400)

    def test_wrong_salt_token_rejected(self):
        """MFA token cannot be used for email verification (salt isolation)."""
        mfa_token = create_signed_token(
            {"user_id": str(self.user.pk), "purpose": "mfa_challenge"},
            salt=SALT_MFA_CHALLENGE,
        )
        response = self.client.get(VERIFY_URL, {"token": mfa_token})
        self.assertEqual(response.status_code, 400)

    def test_token_for_nonexistent_user_returns_400(self):
        token = create_signed_token(
            {"user_id": "99999999", "purpose": "email_verify"},
            salt=SALT_EMAIL_VERIFY,
        )
        response = self.client.get(VERIFY_URL, {"token": token})
        self.assertEqual(response.status_code, 400)

    def test_token_without_purpose_returns_400(self):
        token = create_signed_token(
            {"user_id": str(self.user.pk)},
            salt=SALT_EMAIL_VERIFY,
        )
        response = self.client.get(VERIFY_URL, {"token": token})
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# POST /api/auth/resend-verification/
# ---------------------------------------------------------------------------


class ResendVerificationTests(APITestCase):

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.user = _create_user(email_verified=False)
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)

    @patch("api.views_email_verify.get_event_publisher")
    def test_valid_resend_publishes_event(self, mock_pub):
        publisher = mock_pub.return_value
        publisher.publish.return_value = None
        response = self.client.post(
            RESEND_URL,
            {"email": "user@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        publisher.publish.assert_called_once()

    def test_wrong_password_returns_generic_response(self):
        response = self.client.post(
            RESEND_URL,
            {"email": "user@example.com", "password": "WrongP@ss!99"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)  # Always 200
        self.assertIn("if that account exists", response.data["detail"].lower())

    def test_nonexistent_email_returns_generic_response(self):
        response = self.client.post(
            RESEND_URL,
            {"email": "nobody@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_already_verified_returns_generic_response(self):
        self.user.email_verified = True
        self.user.save(update_fields=["email_verified"])
        response = self.client.post(
            RESEND_URL,
            {"email": "user@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    @patch("api.views_email_verify.get_event_publisher")
    def test_cooldown_prevents_rapid_resend(self, mock_pub):
        publisher = mock_pub.return_value
        publisher.publish.return_value = None

        # First send — should publish
        response = self.client.post(
            RESEND_URL,
            {"email": "user@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        publisher.publish.assert_called_once()

        # Second send immediately — should be silently skipped (rate limit)
        publisher.publish.reset_mock()
        response = self.client.post(
            RESEND_URL,
            {"email": "user@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        publisher.publish.assert_not_called()

    def test_missing_fields_returns_400(self):
        response = self.client.post(RESEND_URL, {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_missing_password_returns_400(self):
        response = self.client.post(
            RESEND_URL, {"email": "user@example.com"}, format="json",
        )
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Signup + email verification integration
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Scenario gap tests
# ---------------------------------------------------------------------------


class VerifyEmailRateLimitTests(APITestCase):
    """Scenario #8: Rate limit escalation on repeated bad tokens.
    Scenario #17: Rate limit reset after successful verification.
    """

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.user = _create_user(email_verified=False)
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)

    def test_rate_limit_escalates_on_repeated_bad_tokens(self):
        """#8: After enough bad attempts, verify endpoint returns 429."""
        # verify_email profile: [0, 0, 1, 5, 15]
        # schedule[0]=0, schedule[1]=0 → first 2 attempts free
        # schedule[2]=1 → 3rd attempt needs 1 min wait
        # Key is token[:32], so must reuse the same token for same bucket.
        bad_token = "x" * 40  # consistent token key
        # Attempt 0 and 1 — allowed (schedule[0]=0, schedule[1]=0)
        for i in range(2):
            resp = self.client.get(VERIFY_URL, {"token": bad_token})
            self.assertEqual(resp.status_code, 400, f"Attempt {i} should be 400")
        # Attempt 2 — needs 1 min wait, we're at 0s elapsed → blocked
        resp = self.client.get(VERIFY_URL, {"token": bad_token})
        self.assertEqual(resp.status_code, 429)
        self.assertIn("Retry-After", resp.headers)

    def test_rate_limit_resets_after_successful_verify(self):
        """#17: After successful verify, rate limit entry is cleared for that token."""
        token = _make_verify_token(self.user)
        token_prefix = token[:32]
        # Verify successfully
        resp = self.client.get(VERIFY_URL, {"token": token})
        self.assertEqual(resp.status_code, 200)
        # The rate limit entry for this token should be cleared
        self.assertFalse(
            RateLimitEntry.objects.filter(
                scope="verify_email", key=token_prefix,
            ).exists(),
            "Rate limit entry should be deleted after successful verification",
        )


class VerifyEndpointNoJwtTests(APITestCase):
    """Scenario #12: Verify endpoint never returns JWT tokens."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.user = _create_user(email_verified=False)
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)

    def test_verify_response_contains_no_jwt_tokens(self):
        """#12: Token interception is harmless — verify only sets email_verified,
        never returns access/refresh tokens."""
        token = _make_verify_token(self.user)
        resp = self.client.get(VERIFY_URL, {"token": token})
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("access", resp.data)
        self.assertNotIn("refresh", resp.data)
        self.assertNotIn("mfa_token", resp.data)


class ResendEventPayloadTests(APITestCase):
    """Scenario #14 (payload): Resend publishes correct event payload to SNS."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.user = _create_user(
            email="payload@example.com", email_verified=False, first_name="Ada",
        )
        self.tenant = _create_tenant()
        _create_membership(self.user, self.tenant)

    @patch("api.views_email_verify.get_event_publisher")
    def test_resend_event_payload_has_required_fields(self, mock_pub):
        """Event must have routing, event_area, event_type, verify_token, email, tenant_id."""
        publisher = mock_pub.return_value
        publisher.publish.return_value = None
        self.client.post(
            RESEND_URL,
            {"email": "payload@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        publisher.publish.assert_called_once()
        event = publisher.publish.call_args[0][0]
        self.assertEqual(event["routing"], ["notification"])
        self.assertEqual(event["event_area"], "account")
        self.assertEqual(event["event_type"], "signup_verify")
        self.assertEqual(event["email"], "payload@example.com")
        self.assertEqual(event["name"], "Ada")
        self.assertEqual(event["tenant_id"], str(self.tenant.pk))
        self.assertTrue(len(event["verify_token"]) > 0)
        self.assertEqual(event["version"], "1")

    @patch("api.views_email_verify.get_event_publisher")
    def test_resend_with_no_active_tenant_publishes_empty_tenant_id(self, mock_pub):
        """#13: User with no active membership → event has empty tenant_id."""
        publisher = mock_pub.return_value
        publisher.publish.return_value = None
        # Deactivate the membership
        TenantMember.objects.filter(user=self.user).update(is_active=False)
        self.client.post(
            RESEND_URL,
            {"email": "payload@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        publisher.publish.assert_called_once()
        event = publisher.publish.call_args[0][0]
        self.assertEqual(event["tenant_id"], "")
        # Other fields should still be correct
        self.assertEqual(event["event_type"], "signup_verify")
        self.assertEqual(event["email"], "payload@example.com")


