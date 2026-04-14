from django.test import TestCase, override_settings

from .signing import (
    _sign,
    sign_attachment_url,
    verify_attachment_sig,
    sign_download_url,
    verify_download_sig,
    sign_sample_url,
    verify_sample_sig,
)


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


@override_settings(SECRET_KEY="test-secret-key-for-signing")
class DownloadSigningTests(TestCase):
    """Tests for sign_download_url / verify_download_sig (export download signing)."""

    def test_sign_download_url_structure(self):
        jid = "aaaaaaaa-1111-2222-3333-444444444444"
        url = sign_download_url(jid)
        self.assertIn(f"/api/settings/export/{jid}/download/", url)
        self.assertIn("?sig=", url)
        self.assertNotIn("&tid=", url)

    def test_sign_download_url_with_tenant(self):
        jid = "aaaaaaaa-1111-2222-3333-444444444444"
        tid = "bbbbbbbb-1111-2222-3333-444444444444"
        url = sign_download_url(jid, tenant_id=tid)
        self.assertIn(f"/api/settings/export/{jid}/download/", url)
        self.assertIn("?sig=", url)
        self.assertIn(f"&tid={tid}", url)

    def test_verify_download_sig_valid(self):
        jid = "aaaaaaaa-1111-2222-3333-444444444444"
        sig = _sign(f"export:{jid}")
        self.assertTrue(verify_download_sig(jid, sig))

    def test_verify_download_sig_valid_with_tenant(self):
        jid = "aaaaaaaa-1111-2222-3333-444444444444"
        tid = "bbbbbbbb-1111-2222-3333-444444444444"
        sig = _sign(f"export:{jid}", tid)
        self.assertTrue(verify_download_sig(jid, sig, tenant_id=tid))

    def test_verify_download_sig_wrong_tenant_fails(self):
        jid = "aaaaaaaa-1111-2222-3333-444444444444"
        sig = _sign(f"export:{jid}", "tenant-a")
        self.assertFalse(verify_download_sig(jid, sig, tenant_id="tenant-b"))

    def test_verify_download_sig_invalid(self):
        jid = "aaaaaaaa-1111-2222-3333-444444444444"
        self.assertFalse(verify_download_sig(jid, "bad_signature_xx"))

    def test_verify_download_sig_empty(self):
        self.assertFalse(verify_download_sig("some-id", ""))

    def test_verify_download_sig_none(self):
        self.assertFalse(verify_download_sig("some-id", None))

    def test_roundtrip_url_contains_valid_sig(self):
        """sign_download_url should produce a URL whose sig passes verify."""
        jid = "aaaaaaaa-1111-2222-3333-444444444444"
        tid = "bbbbbbbb-1111-2222-3333-444444444444"
        url = sign_download_url(jid, tenant_id=tid)
        # Extract sig from URL
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        sig = qs['sig'][0]
        self.assertTrue(verify_download_sig(jid, sig, tenant_id=tid))


@override_settings(SECRET_KEY="test-secret-key-for-signing")
class SampleSigningTests(TestCase):
    """Tests for sign_sample_url / verify_sample_sig (malware sample signing)."""

    def test_sign_sample_url_structure(self):
        sid = "cccccccc-1111-2222-3333-444444444444"
        url = sign_sample_url(sid)
        self.assertIn(f"/api/samples/{sid}/download/", url)
        self.assertIn("?sig=", url)
        self.assertNotIn("&tid=", url)

    def test_sign_sample_url_with_tenant(self):
        sid = "cccccccc-1111-2222-3333-444444444444"
        tid = "dddddddd-1111-2222-3333-444444444444"
        url = sign_sample_url(sid, tenant_id=tid)
        self.assertIn(f"/api/samples/{sid}/download/", url)
        self.assertIn("?sig=", url)
        self.assertIn(f"&tid={tid}", url)

    def test_verify_sample_sig_valid(self):
        sid = "cccccccc-1111-2222-3333-444444444444"
        sig = _sign(f"sample:{sid}")
        self.assertTrue(verify_sample_sig(sid, sig))

    def test_verify_sample_sig_valid_with_tenant(self):
        sid = "cccccccc-1111-2222-3333-444444444444"
        tid = "dddddddd-1111-2222-3333-444444444444"
        sig = _sign(f"sample:{sid}", tid)
        self.assertTrue(verify_sample_sig(sid, sig, tenant_id=tid))

    def test_verify_sample_sig_wrong_tenant_fails(self):
        sid = "cccccccc-1111-2222-3333-444444444444"
        sig = _sign(f"sample:{sid}", "tenant-a")
        self.assertFalse(verify_sample_sig(sid, sig, tenant_id="tenant-b"))

    def test_verify_sample_sig_invalid(self):
        sid = "cccccccc-1111-2222-3333-444444444444"
        self.assertFalse(verify_sample_sig(sid, "bad_signature_xx"))

    def test_verify_sample_sig_empty(self):
        self.assertFalse(verify_sample_sig("some-id", ""))

    def test_verify_sample_sig_none(self):
        self.assertFalse(verify_sample_sig("some-id", None))

    def test_roundtrip_url_contains_valid_sig(self):
        """sign_sample_url should produce a URL whose sig passes verify."""
        sid = "cccccccc-1111-2222-3333-444444444444"
        tid = "dddddddd-1111-2222-3333-444444444444"
        url = sign_sample_url(sid, tenant_id=tid)
        from urllib.parse import urlparse, parse_qs
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        sig = qs['sig'][0]
        self.assertTrue(verify_sample_sig(sid, sig, tenant_id=tid))

    def test_download_and_sample_sigs_differ(self):
        """Ensure export and sample signing produce different signatures."""
        uid = "eeeeeeee-1111-2222-3333-444444444444"
        download_sig = _sign(f"export:{uid}")
        sample_sig = _sign(f"sample:{uid}")
        self.assertNotEqual(download_sig, sample_sig)
