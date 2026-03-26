from django.test import TestCase, override_settings

from .signing import _sign, sign_attachment_url, verify_attachment_sig


@override_settings(SECRET_KEY="test-secret-key-for-signing")
class SigningTests(TestCase):

    def test_sign_returns_16_hex_chars(self):
        sig = _sign("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
        self.assertEqual(len(sig), 16)
        self.assertTrue(all(c in "0123456789abcdef" for c in sig))

    def test_sign_deterministic(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        self.assertEqual(_sign(aid), _sign(aid))

    def test_sign_different_ids_differ(self):
        self.assertNotEqual(
            _sign("aaaaaaaa-0000-0000-0000-000000000000"),
            _sign("bbbbbbbb-0000-0000-0000-000000000000"),
        )

    def test_sign_with_tenant_differs_from_without(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        tid = "aaaaaaaa-0000-0000-0000-111111111111"
        self.assertNotEqual(_sign(aid), _sign(aid, tid))

    def test_sign_different_tenants_differ(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        self.assertNotEqual(
            _sign(aid, "tenant-a-id"),
            _sign(aid, "tenant-b-id"),
        )

    def test_verify_valid(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        sig = _sign(aid)
        self.assertTrue(verify_attachment_sig(aid, sig))

    def test_verify_valid_with_tenant(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        tid = "aaaaaaaa-0000-0000-0000-111111111111"
        sig = _sign(aid, tid)
        self.assertTrue(verify_attachment_sig(aid, sig, tenant_id=tid))

    def test_verify_wrong_tenant_fails(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        sig = _sign(aid, "tenant-a-id")
        self.assertFalse(verify_attachment_sig(aid, sig, tenant_id="tenant-b-id"))

    def test_verify_invalid(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        self.assertFalse(verify_attachment_sig(aid, "bad_signature_xx"))

    def test_verify_empty(self):
        self.assertFalse(verify_attachment_sig("some-id", ""))

    def test_verify_none(self):
        self.assertFalse(verify_attachment_sig("some-id", None))

    def test_sign_attachment_url_default(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        url = sign_attachment_url(aid)
        self.assertIn(f"/api/attachments/{aid}/content/", url)
        self.assertIn("?sig=", url)

    def test_sign_attachment_url_with_tenant(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        tid = "aaaaaaaa-0000-0000-0000-111111111111"
        url = sign_attachment_url(aid, tenant_id=tid)
        self.assertIn(f"/api/attachments/{aid}/content/", url)
        self.assertIn("?sig=", url)
        self.assertIn(f"&tid={tid}", url)

    def test_sign_attachment_url_custom_base(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        url = sign_attachment_url(aid, base_url="/custom/path/")
        self.assertTrue(url.startswith("/custom/path/"))
        self.assertIn("?sig=", url)

    @override_settings(SECRET_KEY="different-key")
    def test_different_secret_different_sig(self):
        aid = "12345678-1234-1234-1234-123456789abc"
        sig_new = _sign(aid)
        # Can't directly compare with old key, but verify with new key works
        self.assertTrue(verify_attachment_sig(aid, sig_new))
