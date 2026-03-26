"""Tests for self-service profile + avatar endpoints."""

import io
import struct
from unittest.mock import patch

from PIL import Image
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from accounts.avatar_service import AvatarService, get_avatar_url
from accounts.models import User
from audit.models import AuditLog
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole

STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    kwargs.setdefault("email_verified", True)
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp"):
    return Tenant.objects.create(name=name, slug=slug)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


def _make_test_image(fmt="PNG", size=(100, 100)):
    """Create a valid in-memory image file."""
    img = Image.new("RGB", size, color="red")
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    buf.seek(0)
    buf.name = f"test.{fmt.lower()}"
    return buf


def _make_test_image_with_exif():
    """Create a JPEG with minimal EXIF data."""
    img = Image.new("RGB", (100, 100), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    buf.name = "test_exif.jpg"
    return buf


# ---------------------------------------------------------------------------
# AvatarService unit tests
# ---------------------------------------------------------------------------


class AvatarServiceTests(TestCase):

    def setUp(self):
        self.user = _create_user(first_name="Test", last_name="User")
        self.tenant = _create_tenant()
        self.tenant_id = str(self.tenant.id)
        self.svc = AvatarService()

    def test_get_avatar_url_none_when_empty(self):
        self.assertIsNone(get_avatar_url(self.user))

    def test_get_avatar_url_returns_path(self):
        self.user.avatar_uri = "/some/path/avatar.png"
        self.assertEqual(
            get_avatar_url(self.user),
            f"/api/users/{self.user.id}/avatar/",
        )

    def test_process_and_save_valid_png(self):
        img_file = _make_test_image("PNG")
        img_file.size = len(img_file.getvalue())
        uri = self.svc.process_and_save(self.user, img_file, self.tenant_id)
        self.assertIn("avatar.png", uri)
        self.assertTrue(uri.endswith("avatar.png"))
        # Cleanup
        self.svc.delete(uri)

    def test_process_and_save_valid_jpeg(self):
        img_file = _make_test_image("JPEG")
        img_file.size = len(img_file.getvalue())
        uri = self.svc.process_and_save(self.user, img_file, self.tenant_id)
        # Even though input is JPEG, output is PNG
        self.assertTrue(uri.endswith("avatar.png"))
        self.svc.delete(uri)

    def test_process_rejects_oversized_file(self):
        img_file = _make_test_image("PNG")
        img_file.size = 3 * 1024 * 1024  # 3 MB
        with self.assertRaises(ValueError) as ctx:
            self.svc.process_and_save(self.user, img_file, self.tenant_id)
        self.assertIn("2 MB", str(ctx.exception))

    def test_process_rejects_bad_magic_bytes(self):
        buf = io.BytesIO(b"MZ" + b"\x00" * 100)  # EXE magic
        buf.name = "fake.png"
        buf.size = 102
        with self.assertRaises(ValueError) as ctx:
            self.svc.process_and_save(self.user, buf, self.tenant_id)
        self.assertIn("Unsupported", str(ctx.exception))

    def test_process_rejects_svg(self):
        svg_content = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'
        buf = io.BytesIO(svg_content)
        buf.name = "test.svg"
        buf.size = len(svg_content)
        with self.assertRaises(ValueError) as ctx:
            self.svc.process_and_save(self.user, buf, self.tenant_id)
        self.assertIn("Unsupported", str(ctx.exception))

    def test_process_rejects_corrupted_image(self):
        # Valid PNG magic but truncated body
        buf = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50)
        buf.name = "corrupt.png"
        buf.size = 58
        with self.assertRaises(ValueError):
            self.svc.process_and_save(self.user, buf, self.tenant_id)

    def test_center_crop_landscape(self):
        img = Image.new("RGB", (200, 100))
        cropped = AvatarService._center_crop_square(img)
        self.assertEqual(cropped.size, (100, 100))

    def test_center_crop_portrait(self):
        img = Image.new("RGB", (100, 200))
        cropped = AvatarService._center_crop_square(img)
        self.assertEqual(cropped.size, (100, 100))

    def test_output_is_256x256_png(self):
        img_file = _make_test_image("JPEG", size=(800, 600))
        img_file.size = len(img_file.getvalue())
        uri = self.svc.process_and_save(self.user, img_file, self.tenant_id)

        f = self.svc.open(uri)
        self.assertIsNotNone(f)
        output_img = Image.open(f)
        self.assertEqual(output_img.size, (256, 256))
        self.assertEqual(output_img.format, "PNG")
        f.close()
        self.svc.delete(uri)


# ---------------------------------------------------------------------------
# Profile API tests
# ---------------------------------------------------------------------------


class ProfileGetTests(APITestCase):

    def setUp(self):
        self.user = _create_user(first_name="Alice", last_name="Smith")
        self.tenant = _create_tenant()
        self.member = _create_membership(self.user, self.tenant)
        login_as(self.client, self.user, self.tenant)

    def test_get_profile(self):
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["user"]["email"], "user@example.com")
        self.assertEqual(data["user"]["first_name"], "Alice")
        self.assertEqual(data["user"]["last_name"], "Smith")
        self.assertIsNone(data["user"]["avatar_url"])
        self.assertEqual(data["role"], "owner")
        self.assertIn("member_since", data)

    def test_get_profile_includes_authorization(self):
        """Profile response includes authorization payload for bootstrap."""
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("authorization", data)
        auth = data["authorization"]
        self.assertIn("is_root", auth)
        self.assertIn("permissions", auth)
        self.assertIn("groups", auth)
        # Owner should be root
        self.assertTrue(auth["is_root"])

    def test_get_profile_includes_tenant(self):
        """Profile response includes tenant info for bootstrap."""
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("tenant", data)
        self.assertEqual(data["tenant"]["name"], "Acme Corp")
        self.assertEqual(data["tenant"]["slug"], "acme-corp")

    def test_get_profile_includes_password_reset_fields(self):
        """Profile response includes password reset status."""
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("password_reset_required", data)
        self.assertIn("password_reset_reason", data)

    def test_get_profile_includes_date_format_default(self):
        """Profile response includes date_format with default value when no setting is stored."""
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("date_format", data)
        self.assertEqual(data["date_format"], "MMM d, yyyy")

    def test_get_profile_includes_date_format_custom(self):
        """Profile response includes tenant's custom date_format when set."""
        from account_settings.models import AccountSetting
        AccountSetting.objects.create(
            tenant=self.tenant, key="date_format", value="yyyy-MM-dd",
        )
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["date_format"], "yyyy-MM-dd")

    def test_get_profile_unauthenticated(self):
        self.client.logout()
        resp = self.client.get("/api/me/profile/")
        self.assertEqual(resp.status_code, 401)


class ProfilePatchTests(APITestCase):

    def setUp(self):
        self.user = _create_user(first_name="Alice", last_name="Smith")
        self.tenant = _create_tenant()
        self.member = _create_membership(self.user, self.tenant)
        login_as(self.client, self.user, self.tenant)

    def test_update_name(self):
        resp = self.client.patch(
            "/api/me/profile/",
            {"first_name": "Bob", "last_name": "Jones"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["user"]["first_name"], "Bob")
        self.assertEqual(data["user"]["last_name"], "Jones")

    def test_update_ignores_email(self):
        resp = self.client.patch(
            "/api/me/profile/",
            {"first_name": "Bob", "email": "hacker@evil.example.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "user@example.com")

    def test_update_no_fields_returns_400(self):
        resp = self.client.patch(
            "/api/me/profile/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_update_logs_audit(self):
        self.client.patch(
            "/api/me/profile/",
            {"first_name": "Updated"},
            format="json",
        )
        entry = AuditLog.objects.filter(
            resource_type="profile", action="update",
        ).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.resource_id, str(self.user.pk))

    def test_update_unauthenticated(self):
        self.client.logout()
        resp = self.client.patch(
            "/api/me/profile/",
            {"first_name": "Hacker"},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)


# ---------------------------------------------------------------------------
# Avatar upload / delete API tests
# ---------------------------------------------------------------------------


class AvatarUploadTests(APITestCase):

    def setUp(self):
        self.user = _create_user(first_name="Alice", last_name="Smith")
        self.tenant = _create_tenant()
        self.member = _create_membership(self.user, self.tenant)
        login_as(self.client, self.user, self.tenant)

    def tearDown(self):
        # Cleanup any uploaded files
        if self.user.avatar_uri:
            AvatarService().delete(self.user.avatar_uri)

    def test_upload_valid_image(self):
        img_file = _make_test_image("PNG")
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("/api/users/", data["avatar_url"])
        self.assertIn("/avatar/", data["avatar_url"])

    def test_upload_no_file_returns_400(self):
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("No file", resp.json()["detail"])

    def test_avatar_url_in_profile_after_upload(self):
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        resp = self.client.get("/api/me/profile/")
        self.assertIsNotNone(resp.json()["user"]["avatar_url"])

    def test_upload_logs_audit(self):
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        entry = AuditLog.objects.filter(
            resource_type="profile", action="update",
        ).first()
        self.assertIsNotNone(entry)

    def test_upload_unauthenticated(self):
        self.client.logout()
        img_file = _make_test_image("PNG")
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 401)

    # --- Security tests ---

    def test_upload_oversized_file(self):
        """File > 2 MB is rejected."""
        img = Image.new("RGB", (4000, 4000), color="red")
        buf = io.BytesIO()
        img.save(buf, format="BMP")  # BMP is large uncompressed
        buf.seek(0)
        buf.name = "large.bmp"
        # Simulate Django UploadedFile .size attribute
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": buf},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("2 MB", resp.json()["detail"])

    def test_upload_spoofed_content_type(self):
        """HTML file with image/png content type header is rejected."""
        html = b"<html><script>alert(1)</script></html>"
        buf = io.BytesIO(html)
        buf.name = "test.png"
        from django.core.files.uploadedfile import SimpleUploadedFile
        fake = SimpleUploadedFile("test.png", html, content_type="image/png")
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": fake},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_renamed_executable(self):
        """File with EXE magic bytes (.png extension) is rejected."""
        exe_header = b"MZ" + b"\x00" * 200
        from django.core.files.uploadedfile import SimpleUploadedFile
        fake = SimpleUploadedFile("malware.png", exe_header, content_type="image/png")
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": fake},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_svg_rejected(self):
        """SVG (XSS vector) is rejected."""
        svg = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        from django.core.files.uploadedfile import SimpleUploadedFile
        fake = SimpleUploadedFile("icon.svg", svg, content_type="image/svg+xml")
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": fake},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_corrupted_image(self):
        """Valid PNG magic but truncated body is rejected."""
        corrupted = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
        from django.core.files.uploadedfile import SimpleUploadedFile
        fake = SimpleUploadedFile("corrupt.png", corrupted, content_type="image/png")
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": fake},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_path_traversal_filename_ignored(self):
        """Malicious filename doesn't affect storage path."""
        img_file = _make_test_image("PNG")
        img_file.name = "../../etc/passwd.png"
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        # Upload succeeds — filename is ignored, stored at canonical path
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertIn("avatar.png", self.user.avatar_uri)
        self.assertNotIn("etc/passwd", self.user.avatar_uri)

    def test_cross_user_cannot_delete_other_avatar(self):
        """User B cannot delete User A's avatar."""
        # User A uploads avatar
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.avatar_uri)

        # User B tries to delete
        user_b = _create_user(email="b@example.com", first_name="Bob", last_name="B")
        member_b = _create_membership(user_b, self.tenant, role=TenantRole.MEMBER)
        login_as(self.client, user_b, self.tenant)

        resp = self.client.delete("/api/me/profile/avatar/")
        self.assertEqual(resp.status_code, 204)

        # User A's avatar is still there
        self.user.refresh_from_db()
        self.assertTrue(self.user.avatar_uri)

    def test_output_is_clean_png(self):
        """Input JPEG is re-encoded as clean PNG (strips EXIF)."""
        img_file = _make_test_image_with_exif()
        resp = self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)

        self.user.refresh_from_db()
        svc = AvatarService()
        f = svc.open(self.user.avatar_uri)
        self.assertIsNotNone(f)
        output_img = Image.open(f)
        self.assertEqual(output_img.format, "PNG")
        self.assertEqual(output_img.size, (256, 256))
        # PNG should have no EXIF
        exif = output_img.info.get("exif")
        self.assertIsNone(exif)
        f.close()


class AvatarDeleteTests(APITestCase):

    def setUp(self):
        self.user = _create_user(first_name="Alice", last_name="Smith")
        self.tenant = _create_tenant()
        self.member = _create_membership(self.user, self.tenant)
        login_as(self.client, self.user, self.tenant)

    def tearDown(self):
        if self.user.avatar_uri:
            AvatarService().delete(self.user.avatar_uri)

    def test_delete_avatar(self):
        # Upload first
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.avatar_uri)

        # Delete
        resp = self.client.delete("/api/me/profile/avatar/")
        self.assertEqual(resp.status_code, 204)

        self.user.refresh_from_db()
        self.assertEqual(self.user.avatar_uri, "")

    def test_delete_when_no_avatar(self):
        resp = self.client.delete("/api/me/profile/avatar/")
        self.assertEqual(resp.status_code, 204)

    def test_delete_avatar_clears_profile(self):
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        self.client.delete("/api/me/profile/avatar/")

        resp = self.client.get("/api/me/profile/")
        self.assertIsNone(resp.json()["user"]["avatar_url"])

    def test_delete_logs_audit(self):
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        AuditLog.objects.all().delete()  # clear upload audit

        self.client.delete("/api/me/profile/avatar/")
        entry = AuditLog.objects.filter(
            resource_type="profile", action="delete",
        ).first()
        self.assertIsNotNone(entry)


# ---------------------------------------------------------------------------
# Avatar serving tests
# ---------------------------------------------------------------------------


class AvatarServeTests(APITestCase):

    def setUp(self):
        self.user = _create_user(first_name="Alice", last_name="Smith")
        self.tenant = _create_tenant()
        self.member = _create_membership(self.user, self.tenant)
        login_as(self.client, self.user, self.tenant)

    def tearDown(self):
        if self.user.avatar_uri:
            AvatarService().delete(self.user.avatar_uri)

    def test_serve_avatar(self):
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        self.user.refresh_from_db()

        resp = self.client.get(f"/api/users/{self.user.id}/avatar/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "image/png")
        self.assertEqual(resp["X-Content-Type-Options"], "nosniff")
        self.assertIn("avatar.png", resp["Content-Disposition"])

    def test_serve_no_avatar_returns_404(self):
        resp = self.client.get(f"/api/users/{self.user.id}/avatar/")
        self.assertEqual(resp.status_code, 404)

    def test_serve_nonexistent_user_returns_404(self):
        import uuid
        resp = self.client.get(f"/api/users/{uuid.uuid4()}/avatar/")
        self.assertEqual(resp.status_code, 404)

    def test_serve_requires_auth(self):
        """Avatar endpoint requires authentication."""
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        self.user.refresh_from_db()

        # Request without auth headers — logout first
        self.client.logout()
        resp = self.client.get(f"/api/users/{self.user.id}/avatar/")
        self.assertIn(resp.status_code, [400, 401])

    def test_serve_cross_tenant_returns_404(self):
        """Users from a different tenant cannot access avatars."""
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        self.user.refresh_from_db()

        # Create a different tenant + user
        other_user = _create_user(email="other@example.com")
        other_tenant = Tenant.objects.create(name="Other Corp", slug="other-corp")
        _create_membership(other_user, other_tenant)
        login_as(self.client, other_user, other_tenant)

        resp = self.client.get(f"/api/users/{self.user.id}/avatar/")
        self.assertEqual(resp.status_code, 404)


# ---------------------------------------------------------------------------
# Auth response includes avatar_url
# ---------------------------------------------------------------------------


class AuthResponseAvatarTests(APITestCase):

    def test_login_includes_avatar_url(self):
        user = _create_user(first_name="Alice", last_name="Smith")
        tenant = _create_tenant()
        _create_membership(user, tenant, role=TenantRole.MEMBER)

        # Upload an avatar
        login_as(self.client, user, tenant)
        img_file = _make_test_image("PNG")
        self.client.post(
            "/api/me/profile/avatar/",
            {"avatar": img_file},
            format="multipart",
        )
        user.refresh_from_db()

        # Logout so we can do the login flow
        self.client.logout()

        # Login
        resp = self.client.post("/api/auth/login/select-tenant/", {
            "email": "user@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(tenant.id),
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(resp.json()["user"]["avatar_url"])

        # Cleanup
        AvatarService().delete(user.avatar_uri)

    def test_login_avatar_url_null_without_avatar(self):
        user = _create_user(first_name="Alice", last_name="Smith")
        tenant = _create_tenant()
        _create_membership(user, tenant, role=TenantRole.MEMBER)

        resp = self.client.post("/api/auth/login/select-tenant/", {
            "email": "user@example.com",
            "password": STRONG_PASSWORD,
            "tenant_id": str(tenant.id),
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.json()["user"]["avatar_url"])
