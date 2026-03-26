"""Tests for auth endpoint rate limiting (exponential backoff).

Verifies that endpoints use the rate limit service correctly:
- Blocked requests return 429 (or generic 200 for silent endpoints)
- Attempts are recorded with correct key strategy
- Successful actions reset the backoff
- IP+email keying prevents lockout-as-DoS for auth endpoints
"""

from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase


from accounts.models import User
from core.rate_limit.models import RateLimitEntry
from tenancy.models import Tenant, TenantMember, TenantRole

STRONG_PASSWORD = "Str0ngP@ss!99"
# Django test client uses 127.0.0.1 by default
TEST_IP = "127.0.0.1"


def _create_user(email="throttle@example.com", password=STRONG_PASSWORD):
    return User.objects.create_user(email=email, password=password, email_verified=True)


def _create_tenant(name="Throttle Corp", slug="throttle-corp"):
    return Tenant.objects.create(name=name, slug=slug)


def _create_membership(user, tenant, role=TenantRole.MEMBER):
    return TenantMember.objects.create(tenant=tenant, user=user, role=role, is_active=True)


class LoginRateLimitTests(APITestCase):
    """Login endpoints use exponential backoff keyed on ip:email."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant)

    def test_login_blocked_after_backoff_kicks_in(self):
        """After 3 free attempts, login should be blocked."""
        url = "/api/auth/login/"
        # login schedule: [0,0,0,1,5,15] — 3 free attempts
        for _ in range(3):
            self.client.post(url, {"email": "throttle@example.com", "password": "wrong"})

        # 4th attempt should be blocked (schedule[3]=1min cooldown)
        resp = self.client.post(url, {"email": "throttle@example.com", "password": "wrong"})
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_login_under_limit_not_throttled(self):
        url = "/api/auth/login/"
        resp = self.client.post(
            url, {"email": "throttle@example.com", "password": STRONG_PASSWORD},
        )
        self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_login_key_includes_ip(self):
        """Login rate limit key should be ip:email, not just email."""
        url = "/api/auth/login/"
        self.client.post(url, {"email": "throttle@example.com", "password": "wrong"})
        expected_key = f"{TEST_IP}:throttle@example.com"
        self.assertTrue(
            RateLimitEntry.objects.filter(scope="login", key=expected_key).exists()
        )

    def test_different_ip_gets_separate_counter(self):
        """An attacker on a different IP should not affect the real user."""
        url = "/api/auth/login/"
        # Exhaust attempts from attacker IP
        attacker_key = "10.0.0.1:throttle@example.com"
        RateLimitEntry.objects.create(
            scope="login", key=attacker_key,
            attempt_count=5,
            first_attempt_at=timezone.now(),
            last_attempt_at=timezone.now(),
        )
        # Real user from test client IP (127.0.0.1) should still be free
        resp = self.client.post(
            url, {"email": "throttle@example.com", "password": STRONG_PASSWORD},
        )
        self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_successful_login_resets_backoff(self):
        """After successful login, backoff should be cleared."""
        url_step1 = "/api/auth/login/"
        url_step2 = "/api/auth/login/select-tenant/"

        # Make 2 failed attempts
        for _ in range(2):
            self.client.post(url_step1, {"email": "throttle@example.com", "password": "wrong"})

        # Successful login
        self.client.post(url_step1, {"email": "throttle@example.com", "password": STRONG_PASSWORD})
        self.client.post(url_step2, {
            "email": "throttle@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.pk),
        })

        # Backoff should be reset — entry deleted
        expected_key = f"{TEST_IP}:throttle@example.com"
        self.assertFalse(
            RateLimitEntry.objects.filter(scope="login", key=expected_key).exists()
        )

    def test_429_response_includes_retry_after_header(self):
        """429 response must include a Retry-After header with a positive integer."""
        url = "/api/auth/login/"
        # login schedule: [0,0,0,1,5,15] — exhaust 3 free attempts
        for _ in range(3):
            self.client.post(url, {"email": "throttle@example.com", "password": "wrong"})

        resp = self.client.post(url, {"email": "throttle@example.com", "password": "wrong"})
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("Retry-After", resp)
        retry_after = int(resp["Retry-After"])
        self.assertGreater(retry_after, 0)

    def test_successful_login_resets_both_login_scopes(self):
        """Successful login resets BOTH 'login' and 'login_select_tenant' counters."""
        url_step1 = "/api/auth/login/"
        url_step2 = "/api/auth/login/select-tenant/"
        expected_key = f"{TEST_IP}:throttle@example.com"

        # Record attempts for both scopes
        for _ in range(2):
            self.client.post(url_step1, {"email": "throttle@example.com", "password": "wrong"})

        # Also create a login_select_tenant entry (simulates failed step2 attempts)
        RateLimitEntry.objects.create(
            scope="login_select_tenant",
            key=expected_key,
            attempt_count=2,
            first_attempt_at=timezone.now(),
            last_attempt_at=timezone.now(),
        )

        # Successful full login
        self.client.post(url_step1, {"email": "throttle@example.com", "password": STRONG_PASSWORD})
        self.client.post(url_step2, {
            "email": "throttle@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(self.tenant.pk),
        })

        # Both scopes should be cleared
        self.assertFalse(
            RateLimitEntry.objects.filter(scope="login", key=expected_key).exists()
        )
        self.assertFalse(
            RateLimitEntry.objects.filter(scope="login_select_tenant", key=expected_key).exists()
        )


class ForgotPasswordRateLimitTests(APITestCase):
    """Forgot password uses email-only key + silent rate limiting (200, not 429)."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.tenant = _create_tenant()
        self.user = _create_user(email="forgot@example.com")
        self.member = _create_membership(self.user, self.tenant)

    def test_forgot_password_silent_when_rate_limited(self):
        """Should return generic 200 even when rate limited."""
        url = "/api/auth/forgot-password/"
        # Exhaust the first free attempt — email-only key
        RateLimitEntry.objects.create(
            scope="forgot_password",
            key="forgot@example.com",
            attempt_count=2,
            first_attempt_at=timezone.now(),
            last_attempt_at=timezone.now(),
        )
        resp = self.client.post(url, {"email": "forgot@example.com"}, format="json")
        self.assertEqual(resp.status_code, 200)  # silent — not 429
        self.assertIn("If that email", resp.data["detail"])

    def test_forgot_password_key_is_email_only(self):
        """Forgot password should use email-only key (not ip:email)."""
        url = "/api/auth/forgot-password/"
        self.client.post(url, {"email": "forgot@example.com"}, format="json")
        # Should be email-only, not ip:email
        self.assertTrue(
            RateLimitEntry.objects.filter(scope="forgot_password", key="forgot@example.com").exists()
        )
        self.assertFalse(
            RateLimitEntry.objects.filter(
                scope="forgot_password", key__contains=":"
            ).exists()
        )


class ScopeIsolationTests(APITestCase):
    """Rate limits for different scopes don't interfere."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant)

    def test_scopes_are_independent(self):
        """Exhausting login throttle should not block MFA verify."""
        # Exhaust login free attempts
        url = "/api/auth/login/"
        for _ in range(3):
            self.client.post(url, {"email": "throttle@example.com", "password": "wrong"})
        resp = self.client.post(url, {"email": "throttle@example.com", "password": "wrong"})
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

        # MFA verify should still work (different scope)
        resp = self.client.post(
            "/api/auth/mfa/verify/", {"mfa_token": "fake", "code": "000000"},
        )
        self.assertNotEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
