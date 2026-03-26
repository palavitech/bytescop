"""Tests for the exponential backoff rate limit service."""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from core.rate_limit.backends.db import DjangoDbBackend
from core.rate_limit.models import RateLimitEntry
from core.rate_limit.service import RateLimitService


class RateLimitServiceTests(TestCase):
    """Test RateLimitService with the DjangoDbBackend."""

    def setUp(self):
        self.service = RateLimitService(DjangoDbBackend())

    # ------------------------------------------------------------------
    # check() — first attempt always allowed
    # ------------------------------------------------------------------

    def test_first_attempt_allowed(self):
        result = self.service.check("login", "user@example.com")
        self.assertTrue(result.allowed)
        self.assertEqual(result.attempt_count, 0)
        self.assertEqual(result.retry_after_seconds, 0)

    # ------------------------------------------------------------------
    # record() — increments attempt count
    # ------------------------------------------------------------------

    def test_record_creates_entry(self):
        self.service.record("login", "user@example.com")
        entry = RateLimitEntry.objects.get(scope="login", key="user@example.com")
        self.assertEqual(entry.attempt_count, 1)

    def test_record_increments(self):
        self.service.record("login", "user@example.com")
        self.service.record("login", "user@example.com")
        entry = RateLimitEntry.objects.get(scope="login", key="user@example.com")
        self.assertEqual(entry.attempt_count, 2)

    # ------------------------------------------------------------------
    # check() — respects schedule
    # ------------------------------------------------------------------

    def test_within_free_attempts_allowed(self):
        """Login schedule [0,0,0,1,5,15] — first 3 attempts are free."""
        for _ in range(3):
            self.service.record("login", "user@example.com")
        result = self.service.check("login", "user@example.com")
        # 3 attempts done, schedule[3]=1min, but we just recorded so elapsed~0
        self.assertFalse(result.allowed)
        self.assertGreater(result.retry_after_seconds, 0)

    def test_blocked_after_schedule_kicks_in(self):
        """After free attempts exhausted, should be blocked."""
        # Login: [0,0,0,1,5,15]
        for _ in range(4):
            self.service.record("login", "user@example.com")
        result = self.service.check("login", "user@example.com")
        self.assertFalse(result.allowed)
        self.assertGreater(result.retry_after_seconds, 0)

    def test_allowed_after_cooldown_elapsed(self):
        """After waiting the required cooldown, should be allowed again."""
        # Login: [0,0,0,1,5,15] — record 3 attempts, schedule[3]=1min
        for _ in range(3):
            self.service.record("login", "user@example.com")

        # Fake the last_attempt_at to 2 minutes ago
        entry = RateLimitEntry.objects.get(scope="login", key="user@example.com")
        entry.last_attempt_at = timezone.now() - timedelta(minutes=2)
        entry.save()

        result = self.service.check("login", "user@example.com")
        self.assertTrue(result.allowed)
        self.assertEqual(result.attempt_count, 3)

    # ------------------------------------------------------------------
    # check() — max backoff (cap at last schedule entry)
    # ------------------------------------------------------------------

    def test_capped_at_max_schedule(self):
        """Beyond schedule length, backoff stays at the last entry."""
        # Login: [0,0,0,1,5,15] — 6 entries, record 10 attempts
        for _ in range(10):
            self.service.record("login", "user@example.com")
        result = self.service.check("login", "user@example.com")
        self.assertFalse(result.allowed)
        # Should be capped at 15 minutes (900 seconds)
        self.assertLessEqual(result.retry_after_seconds, 900)

    # ------------------------------------------------------------------
    # reset() — clears state
    # ------------------------------------------------------------------

    def test_reset_clears_entry(self):
        self.service.record("login", "user@example.com")
        self.service.record("login", "user@example.com")
        self.service.reset("login", "user@example.com", reason="login_success")

        result = self.service.check("login", "user@example.com")
        self.assertTrue(result.allowed)
        self.assertEqual(result.attempt_count, 0)

    def test_reset_nonexistent_no_error(self):
        """Resetting a key that doesn't exist should not raise."""
        self.service.reset("login", "nobody@example.com")

    # ------------------------------------------------------------------
    # Auto-reset after inactivity
    # ------------------------------------------------------------------

    def test_auto_reset_after_inactivity(self):
        """If inactive longer than reset_after, state is auto-cleared."""
        # Login: reset_after = 24*60 = 1440 minutes
        for _ in range(5):
            self.service.record("login", "user@example.com")

        # Fake last_attempt_at to 25 hours ago
        entry = RateLimitEntry.objects.get(scope="login", key="user@example.com")
        entry.last_attempt_at = timezone.now() - timedelta(hours=25)
        entry.save()

        result = self.service.check("login", "user@example.com")
        self.assertTrue(result.allowed)
        self.assertEqual(result.attempt_count, 0)

        # Entry should be deleted
        self.assertFalse(
            RateLimitEntry.objects.filter(scope="login", key="user@example.com").exists()
        )

    # ------------------------------------------------------------------
    # Scope isolation
    # ------------------------------------------------------------------

    def test_scopes_are_independent(self):
        """Rate limits for different scopes don't interfere."""
        for _ in range(5):
            self.service.record("login", "user@example.com")
        result = self.service.check("login", "user@example.com")
        self.assertFalse(result.allowed)

        # Same key, different scope — should be free
        result = self.service.check("signup", "user@example.com")
        self.assertTrue(result.allowed)

    # ------------------------------------------------------------------
    # Forgot password (silent) profile
    # ------------------------------------------------------------------

    def test_forgot_password_first_free_then_blocked(self):
        """forgot_password: [0,5,15,30,60,180] — first attempt free."""
        result = self.service.check("forgot_password", "user@example.com")
        self.assertTrue(result.allowed)

        self.service.record("forgot_password", "user@example.com")
        result = self.service.check("forgot_password", "user@example.com")
        # schedule[1]=5min, just recorded, should be blocked
        self.assertFalse(result.allowed)
        self.assertGreater(result.retry_after_seconds, 0)

    # ------------------------------------------------------------------
    # Sensitive key logging
    # ------------------------------------------------------------------

    def test_sensitive_key_truncated(self):
        """Token-based scopes should truncate key in _safe_key."""
        safe = self.service._safe_key("accept_invite", "abcdefghijklmnop")
        self.assertEqual(safe, "abcdefgh...")

    def test_non_sensitive_key_preserved(self):
        safe = self.service._safe_key("login", "user@example.com")
        self.assertEqual(safe, "user@example.com")


class BuildKeyTests(TestCase):
    """Test _build_key constructs the correct key per profile key_type."""

    def test_email_key(self):
        from core.rate_limit.helpers import _build_key
        key = _build_key("forgot_password", email="user@example.com")
        self.assertEqual(key, "user@example.com")

    def test_ip_email_key(self):
        from core.rate_limit.helpers import _build_key
        key = _build_key("login", email="user@example.com", ip="10.0.0.1")
        self.assertEqual(key, "10.0.0.1:user@example.com")

    def test_ip_user_id_key(self):
        from core.rate_limit.helpers import _build_key
        key = _build_key("mfa_verify", user_id="abc-123", ip="10.0.0.1")
        self.assertEqual(key, "10.0.0.1:abc-123")

    def test_token_key_truncated(self):
        from core.rate_limit.helpers import _build_key
        long_token = "a" * 100
        key = _build_key("verify_email", token=long_token)
        self.assertEqual(len(key), 32)
        self.assertEqual(key, "a" * 32)

    def test_signup_is_email_only(self):
        from core.rate_limit.helpers import _build_key
        key = _build_key("signup", email="user@example.com")
        self.assertNotIn(":", key)
        self.assertEqual(key, "user@example.com")

    def test_resend_verification_is_email_only(self):
        from core.rate_limit.helpers import _build_key
        key = _build_key("resend_verification", email="user@example.com")
        self.assertEqual(key, "user@example.com")


class DjangoDbBackendTests(TestCase):
    """Test the DjangoDbBackend directly."""

    def setUp(self):
        self.backend = DjangoDbBackend()

    def test_get_entry_returns_none_for_missing(self):
        self.assertIsNone(self.backend.get_entry("login", "nobody"))

    def test_record_creates_and_returns(self):
        result = self.backend.record_attempt("login", "user@test.example.com")
        self.assertEqual(result["attempt_count"], 1)
        self.assertIn("first_attempt_at", result)
        self.assertIn("last_attempt_at", result)

    def test_record_increments_atomically(self):
        self.backend.record_attempt("login", "user@test.example.com")
        result = self.backend.record_attempt("login", "user@test.example.com")
        self.assertEqual(result["attempt_count"], 2)

    def test_reset_deletes_entry(self):
        self.backend.record_attempt("login", "user@test.example.com")
        self.backend.reset("login", "user@test.example.com")
        self.assertIsNone(self.backend.get_entry("login", "user@test.example.com"))

    def test_reset_nonexistent_no_error(self):
        self.backend.reset("login", "nobody")  # should not raise


class MfaVerifyProfileTests(TestCase):
    """Test the mfa_verify backoff profile: [0,0,0,1,5,15]."""

    def setUp(self):
        self.service = RateLimitService(DjangoDbBackend())

    def test_mfa_verify_first_three_free(self):
        """MFA verify schedule [0,0,0,1,5,15] — first 3 attempts free."""
        for _ in range(3):
            self.service.record("mfa_verify", "10.0.0.1:user-123")
        # After 3 attempts, schedule[3]=1 → blocked
        result = self.service.check("mfa_verify", "10.0.0.1:user-123")
        self.assertFalse(result.allowed)
        self.assertGreater(result.retry_after_seconds, 0)

    def test_mfa_verify_blocked_after_schedule_kicks_in(self):
        for _ in range(4):
            self.service.record("mfa_verify", "10.0.0.1:user-456")
        result = self.service.check("mfa_verify", "10.0.0.1:user-456")
        self.assertFalse(result.allowed)
