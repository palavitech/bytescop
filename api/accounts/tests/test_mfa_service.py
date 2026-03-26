"""Unit tests for accounts.mfa_crypto and accounts.mfa_service."""

from django.test import TestCase

from accounts.mfa_crypto import decrypt_secret, encrypt_secret
from accounts.mfa_service import (
    BACKUP_CODE_COUNT,
    confirm_enrollment,
    disable_mfa,
    enroll_mfa,
    generate_backup_codes,
    generate_qr_code_base64,
    generate_totp_secret,
    get_provisioning_uri,
    hash_backup_code,
    regenerate_backup_codes,
    verify_and_consume_backup_code,
    verify_mfa,
    verify_totp_code,
)
from accounts.models import User

STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="mfa@example.com"):
    return User.objects.create_user(email=email, password=STRONG_PASSWORD)


# ---------------------------------------------------------------------------
# Crypto
# ---------------------------------------------------------------------------


class MfaCryptoTests(TestCase):
    def test_round_trip(self):
        plaintext = "JBSWY3DPEHPK3PXP"
        encrypted = encrypt_secret(plaintext)
        self.assertNotEqual(encrypted, plaintext)
        self.assertEqual(decrypt_secret(encrypted), plaintext)

    def test_different_inputs_different_ciphertext(self):
        a = encrypt_secret("SECRET_A")
        b = encrypt_secret("SECRET_B")
        self.assertNotEqual(a, b)


# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------


class TotpHelperTests(TestCase):
    def test_generate_totp_secret_length(self):
        secret = generate_totp_secret()
        self.assertTrue(len(secret) >= 16)

    def test_provisioning_uri(self):
        uri = get_provisioning_uri("JBSWY3DPEHPK3PXP", "user@example.com")
        self.assertIn("otpauth://totp/", uri)
        self.assertIn("BytesCop", uri)
        self.assertIn("user%40example.com", uri)

    def test_qr_code_base64(self):
        uri = get_provisioning_uri("JBSWY3DPEHPK3PXP", "user@example.com")
        qr = generate_qr_code_base64(uri)
        self.assertTrue(qr.startswith("data:image/png;base64,"))

    def test_verify_totp_code_correct(self):
        import pyotp
        secret = generate_totp_secret()
        code = pyotp.TOTP(secret).now()
        self.assertTrue(verify_totp_code(secret, code))

    def test_verify_totp_code_wrong(self):
        secret = generate_totp_secret()
        self.assertFalse(verify_totp_code(secret, "000000"))


# ---------------------------------------------------------------------------
# Backup codes
# ---------------------------------------------------------------------------


class BackupCodeTests(TestCase):
    def test_generate_backup_codes_count(self):
        codes = generate_backup_codes()
        self.assertEqual(len(codes), BACKUP_CODE_COUNT)

    def test_generate_backup_codes_unique(self):
        codes = generate_backup_codes()
        self.assertEqual(len(set(codes)), len(codes))

    def test_hash_backup_code_salted_format(self):
        hashed = hash_backup_code("abc12345")
        self.assertIn("$", hashed)
        salt_hex, hash_hex = hashed.split("$", 1)
        self.assertEqual(len(bytes.fromhex(salt_hex)), 16)

    def test_hash_backup_code_unique_per_call(self):
        """Random salt means same input produces different hashes."""
        h1 = hash_backup_code("abc12345")
        h2 = hash_backup_code("abc12345")
        self.assertNotEqual(h1, h2)

    def test_hash_backup_code_case_insensitive(self):
        from accounts.mfa_service import _verify_backup_hash
        stored = hash_backup_code("AbC12345")
        self.assertTrue(_verify_backup_hash("abc12345", stored))

    def test_verify_and_consume_backup_code(self):
        user = _create_user()
        codes = generate_backup_codes()
        user.mfa_backup_codes = [hash_backup_code(c) for c in codes]
        user.save()

        # Valid code consumed
        self.assertTrue(verify_and_consume_backup_code(user, codes[0]))
        user.refresh_from_db()
        self.assertEqual(len(user.mfa_backup_codes), BACKUP_CODE_COUNT - 1)

        # Same code no longer works
        self.assertFalse(verify_and_consume_backup_code(user, codes[0]))

    def test_verify_and_consume_backup_code_invalid(self):
        user = _create_user()
        user.mfa_backup_codes = [hash_backup_code("realcode")]
        user.save()
        self.assertFalse(verify_and_consume_backup_code(user, "wrongcode"))


# ---------------------------------------------------------------------------
# High-level operations
# ---------------------------------------------------------------------------


class EnrollMfaTests(TestCase):
    def test_enroll_returns_secret_and_qr(self):
        user = _create_user()
        result = enroll_mfa(user)
        self.assertIn("secret", result)
        self.assertIn("qr_code", result)
        self.assertIn("backup_codes", result)
        self.assertEqual(len(result["backup_codes"]), BACKUP_CODE_COUNT)

    def test_enroll_stores_encrypted_secret(self):
        user = _create_user()
        result = enroll_mfa(user)
        user.refresh_from_db()
        # Encrypted secret stored on user
        self.assertTrue(user.mfa_secret)
        self.assertNotEqual(user.mfa_secret, result["secret"])
        # MFA not yet enabled
        self.assertFalse(user.mfa_enabled)

    def test_enroll_stores_hashed_backup_codes(self):
        user = _create_user()
        result = enroll_mfa(user)
        user.refresh_from_db()
        self.assertEqual(len(user.mfa_backup_codes), BACKUP_CODE_COUNT)
        # Stored codes are hashes, not plaintext
        self.assertNotIn(result["backup_codes"][0], user.mfa_backup_codes)


class ConfirmEnrollmentTests(TestCase):
    def test_confirm_with_valid_code(self):
        import pyotp
        user = _create_user()
        result = enroll_mfa(user)
        code = pyotp.TOTP(result["secret"]).now()
        self.assertTrue(confirm_enrollment(user, code))
        user.refresh_from_db()
        self.assertTrue(user.mfa_enabled)
        self.assertIsNotNone(user.mfa_enrolled_at)

    def test_confirm_with_invalid_code(self):
        user = _create_user()
        enroll_mfa(user)
        self.assertFalse(confirm_enrollment(user, "000000"))
        user.refresh_from_db()
        self.assertFalse(user.mfa_enabled)

    def test_confirm_no_secret(self):
        user = _create_user()
        self.assertFalse(confirm_enrollment(user, "123456"))


class VerifyMfaTests(TestCase):
    def test_verify_with_totp(self):
        import pyotp
        user = _create_user()
        result = enroll_mfa(user)
        code = pyotp.TOTP(result["secret"]).now()
        confirm_enrollment(user, code)
        user.refresh_from_db()

        new_code = pyotp.TOTP(result["secret"]).now()
        self.assertTrue(verify_mfa(user, new_code))

    def test_verify_with_backup_code(self):
        import pyotp
        user = _create_user()
        result = enroll_mfa(user)
        code = pyotp.TOTP(result["secret"]).now()
        confirm_enrollment(user, code)
        user.refresh_from_db()

        self.assertTrue(verify_mfa(user, result["backup_codes"][0]))

    def test_verify_with_wrong_code(self):
        import pyotp
        user = _create_user()
        result = enroll_mfa(user)
        code = pyotp.TOTP(result["secret"]).now()
        confirm_enrollment(user, code)
        user.refresh_from_db()

        self.assertFalse(verify_mfa(user, "wrongcode"))

    def test_verify_when_not_enabled(self):
        user = _create_user()
        self.assertFalse(verify_mfa(user, "123456"))


class DisableMfaTests(TestCase):
    def test_disable_clears_all_fields(self):
        import pyotp
        user = _create_user()
        result = enroll_mfa(user)
        code = pyotp.TOTP(result["secret"]).now()
        confirm_enrollment(user, code)
        user.refresh_from_db()
        self.assertTrue(user.mfa_enabled)

        disable_mfa(user)
        user.refresh_from_db()
        self.assertFalse(user.mfa_enabled)
        self.assertEqual(user.mfa_secret, "")
        self.assertEqual(user.mfa_backup_codes, [])
        self.assertIsNone(user.mfa_enrolled_at)


class ExhaustBackupCodesThenTotpTests(TestCase):
    """Test that after exhausting all 10 backup codes, only TOTP works."""

    def test_exhaust_all_backup_codes_then_totp_only(self):
        import pyotp

        user = _create_user(email="exhaust@example.com")
        result = enroll_mfa(user)
        secret = result["secret"]
        backup_codes = result["backup_codes"]

        # Confirm enrollment
        code = pyotp.TOTP(secret).now()
        confirm_enrollment(user, code)
        user.refresh_from_db()

        # Consume all 10 backup codes
        for bc in backup_codes:
            self.assertTrue(verify_and_consume_backup_code(user, bc))
            user.refresh_from_db()

        # Verify no backup codes remain
        self.assertEqual(len(user.mfa_backup_codes), 0)

        # Attempting another backup code should fail
        self.assertFalse(verify_and_consume_backup_code(user, backup_codes[0]))

        # But TOTP should still work
        totp_code = pyotp.TOTP(secret).now()
        self.assertTrue(verify_mfa(user, totp_code))


class BackupCodesFallbackToTotpTest(TestCase):
    """Test that verify_mfa with backup code fails after exhaustion, TOTP succeeds."""

    def test_verify_mfa_backup_exhausted_totp_works(self):
        import pyotp

        user = _create_user(email="fallback@example.com")
        result = enroll_mfa(user)
        secret = result["secret"]
        backup_codes = result["backup_codes"]

        code = pyotp.TOTP(secret).now()
        confirm_enrollment(user, code)
        user.refresh_from_db()

        # Consume all codes via verify_mfa (which tries backup codes too)
        for bc in backup_codes:
            self.assertTrue(verify_mfa(user, bc))
            user.refresh_from_db()

        # Random backup code string should now fail via verify_mfa
        self.assertFalse(verify_mfa(user, "randomcode123"))

        # TOTP still works via verify_mfa
        totp_code = pyotp.TOTP(secret).now()
        self.assertTrue(verify_mfa(user, totp_code))


class RegenerateBackupCodesTests(TestCase):
    def test_regenerate_returns_new_codes(self):
        import pyotp
        user = _create_user()
        result = enroll_mfa(user)
        code = pyotp.TOTP(result["secret"]).now()
        confirm_enrollment(user, code)
        user.refresh_from_db()

        new_codes = regenerate_backup_codes(user)
        self.assertEqual(len(new_codes), BACKUP_CODE_COUNT)
        user.refresh_from_db()
        self.assertEqual(len(user.mfa_backup_codes), BACKUP_CODE_COUNT)

        # Old codes no longer work
        self.assertFalse(verify_and_consume_backup_code(user, result["backup_codes"][0]))
        # New codes work
        self.assertTrue(verify_and_consume_backup_code(user, new_codes[0]))
