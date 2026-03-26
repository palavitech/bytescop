"""Tests for core.signing shared token utilities."""

import time

from django.core import signing
from django.test import TestCase

from core.signing import (
    SALT_EMAIL_VERIFY,
    SALT_INVITE_SESSION,
    SALT_MFA_CHALLENGE,
    SALT_MFA_RE_ENROLL,
    create_signed_token,
    verify_signed_token,
)


class CreateAndVerifyTests(TestCase):
    """Test create_signed_token + verify_signed_token round-trip."""

    def test_round_trip(self):
        payload = {"user_id": "abc-123", "purpose": "test"}
        token = create_signed_token(payload, salt=SALT_EMAIL_VERIFY)
        result = verify_signed_token(token, salt=SALT_EMAIL_VERIFY, max_age=3600)
        self.assertEqual(result["user_id"], "abc-123")
        self.assertEqual(result["purpose"], "test")

    def test_token_is_string(self):
        token = create_signed_token({"k": "v"}, salt=SALT_MFA_CHALLENGE)
        self.assertIsInstance(token, str)
        self.assertTrue(len(token) > 0)


class SaltIsolationTests(TestCase):
    """Tokens signed with one salt must not verify with another."""

    def test_wrong_salt_raises_bad_signature(self):
        token = create_signed_token({"user_id": "x"}, salt=SALT_MFA_CHALLENGE)
        with self.assertRaises(signing.BadSignature):
            verify_signed_token(token, salt=SALT_EMAIL_VERIFY, max_age=3600)

    def test_invite_salt_rejects_mfa_token(self):
        token = create_signed_token({"user_id": "x"}, salt=SALT_MFA_CHALLENGE)
        with self.assertRaises(signing.BadSignature):
            verify_signed_token(token, salt=SALT_INVITE_SESSION, max_age=3600)

    def test_re_enroll_salt_rejects_challenge_token(self):
        token = create_signed_token({"user_id": "x"}, salt=SALT_MFA_CHALLENGE)
        with self.assertRaises(signing.BadSignature):
            verify_signed_token(token, salt=SALT_MFA_RE_ENROLL, max_age=3600)


class ExpiryTests(TestCase):
    """Tokens must expire after max_age."""

    def test_expired_token_raises_signature_expired(self):
        token = create_signed_token({"user_id": "x"}, salt=SALT_EMAIL_VERIFY)
        with self.assertRaises(signing.SignatureExpired):
            verify_signed_token(token, salt=SALT_EMAIL_VERIFY, max_age=0)

    def test_valid_token_within_max_age(self):
        token = create_signed_token({"user_id": "x"}, salt=SALT_EMAIL_VERIFY)
        result = verify_signed_token(token, salt=SALT_EMAIL_VERIFY, max_age=3600)
        self.assertEqual(result["user_id"], "x")


class TamperedTokenTests(TestCase):
    """Tampered tokens must raise BadSignature."""

    def test_tampered_token(self):
        token = create_signed_token({"user_id": "x"}, salt=SALT_EMAIL_VERIFY)
        tampered = token[:-4] + "XXXX"
        with self.assertRaises(signing.BadSignature):
            verify_signed_token(tampered, salt=SALT_EMAIL_VERIFY, max_age=3600)

    def test_garbage_token(self):
        with self.assertRaises(signing.BadSignature):
            verify_signed_token("not-a-real-token", salt=SALT_EMAIL_VERIFY, max_age=3600)


class UniqueSaltsTests(TestCase):
    """All salts must be unique."""

    def test_all_salts_are_unique(self):
        salts = [SALT_MFA_CHALLENGE, SALT_MFA_RE_ENROLL, SALT_INVITE_SESSION, SALT_EMAIL_VERIFY]
        self.assertEqual(len(salts), len(set(salts)))
