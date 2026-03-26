"""Tests for account_settings app."""

import io
import struct

from PIL import Image
from django.test import TestCase
from rest_framework.test import APITestCase

from accounts.models import User
from audit.models import AuditLog
from authorization.models import Permission, TenantGroup
from authorization.seed import seed_permissions
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole

from .definitions import DEFINITION_MAP, SETTING_DEFINITIONS, SettingType
from .models import AccountSetting


STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp"):
    return Tenant.objects.create(name=name, slug=slug)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )




def _grant_permissions(member, codenames):
    """Create a group with the given permissions and assign to member."""
    group = TenantGroup.objects.create(
        tenant=member.tenant, name="Test Group",
    )
    perms = Permission.objects.filter(codename__in=codenames)
    group.permissions.set(perms)
    member.groups.add(group)


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


class AccountSettingModelTests(TestCase):
    def setUp(self):
        self.tenant = _create_tenant()

    def test_create_setting(self):
        s = AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Acme",
        )
        self.assertEqual(s.key, "company_name")
        self.assertEqual(s.value, "Acme")
        self.assertIsNotNone(s.id)

    def test_uuid_pk(self):
        s = AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Acme",
        )
        self.assertEqual(len(str(s.id)), 36)

    def test_unique_constraint(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Acme",
        )
        with self.assertRaises(Exception):
            AccountSetting.objects.create(
                tenant=self.tenant, key="company_name", value="Other",
            )

    def test_str_repr(self):
        s = AccountSetting(key="company_name", value="Acme")
        self.assertEqual(str(s), "company_name=Acme")

    def test_different_tenants_same_key(self):
        t2 = _create_tenant(name="Other Corp", slug="other-corp")
        AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Acme",
        )
        s2 = AccountSetting.objects.create(
            tenant=t2, key="company_name", value="Other",
        )
        self.assertEqual(s2.value, "Other")


# ---------------------------------------------------------------------------
# Definition tests
# ---------------------------------------------------------------------------


class DefinitionTests(TestCase):
    def test_unique_keys(self):
        keys = [d.key for d in SETTING_DEFINITIONS]
        self.assertEqual(len(keys), len(set(keys)))

    def test_choice_definitions_have_choices(self):
        for d in SETTING_DEFINITIONS:
            if d.setting_type == SettingType.CHOICE:
                self.assertTrue(
                    len(d.choices) > 0,
                    f"Choice setting {d.key} has no choices",
                )

    def test_boolean_defaults_valid(self):
        for d in SETTING_DEFINITIONS:
            if d.setting_type == SettingType.BOOLEAN:
                self.assertIn(
                    d.default, ('true', 'false'),
                    f"Boolean setting {d.key} has invalid default: {d.default}",
                )

    def test_definition_map_matches(self):
        self.assertEqual(len(DEFINITION_MAP), len(SETTING_DEFINITIONS))
        for d in SETTING_DEFINITIONS:
            self.assertIn(d.key, DEFINITION_MAP)
            self.assertIs(DEFINITION_MAP[d.key], d)

    def test_choice_defaults_in_choices(self):
        for d in SETTING_DEFINITIONS:
            if d.setting_type == SettingType.CHOICE and d.default:
                self.assertIn(
                    d.default, d.choices,
                    f"Choice setting {d.key} default '{d.default}' not in choices",
                )


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------


class SettingsListAPITests(APITestCase):
    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.owner_user = _create_user(email="owner@example.com")
        self.owner = _create_membership(
            self.owner_user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.owner_user, self.tenant)

    def test_list_returns_all_definitions(self):
        resp = self.client.get(
            "/api/settings/",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), len(SETTING_DEFINITIONS))

    def test_list_returns_default_values(self):
        resp = self.client.get(
            "/api/settings/",
        )
        data = {s["key"]: s for s in resp.data}
        self.assertEqual(data["password_min_length"]["value"], "10")
        self.assertFalse(data["password_min_length"]["has_value"])

    def test_list_returns_stored_value(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Acme Corp",
        )
        resp = self.client.get(
            "/api/settings/",
        )
        data = {s["key"]: s for s in resp.data}
        self.assertEqual(data["company_name"]["value"], "Acme Corp")
        self.assertTrue(data["company_name"]["has_value"])

    def test_list_ordered_by_order_field(self):
        resp = self.client.get(
            "/api/settings/",
        )
        orders = [s["order"] for s in resp.data]
        self.assertEqual(orders, sorted(orders))

    def test_list_includes_all_fields(self):
        resp = self.client.get(
            "/api/settings/",
        )
        entry = resp.data[0]
        expected_keys = {
            "key", "label", "description", "setting_type", "choices",
            "default", "group", "order", "value", "has_value",
            "updated_at", "updated_by",
        }
        self.assertEqual(set(entry.keys()), expected_keys)


class SettingsUpsertAPITests(APITestCase):
    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.owner_user = _create_user(email="owner@example.com")
        self.owner = _create_membership(
            self.owner_user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.owner_user, self.tenant)

    def test_create_text_setting(self):
        resp = self.client.put(
            "/api/settings/company_name/",
            {"value": "Acme Corp"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["value"], "Acme Corp")
        self.assertTrue(resp.data["has_value"])

    def test_update_text_setting(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Old Name",
        )
        resp = self.client.put(
            "/api/settings/company_name/",
            {"value": "New Name"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["value"], "New Name")

    def test_create_boolean_setting(self):
        resp = self.client.put(
            "/api/settings/password_require_uppercase/",
            {"value": "false"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["value"], "false")

    def test_boolean_validation_rejects_invalid(self):
        resp = self.client.put(
            "/api/settings/password_require_uppercase/",
            {"value": "yes"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("true", resp.data["detail"])

    def test_choice_setting_valid(self):
        resp = self.client.put(
            "/api/settings/password_min_length/",
            {"value": "12"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["value"], "12")

    def test_choice_setting_invalid(self):
        resp = self.client.put(
            "/api/settings/password_min_length/",
            {"value": "5"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Invalid choice", resp.data["detail"])

    def test_unknown_key_returns_404(self):
        resp = self.client.put(
            "/api/settings/nonexistent_key/",
            {"value": "foo"},
            format="json",
        )
        self.assertEqual(resp.status_code, 404)

    def test_missing_value_returns_400(self):
        resp = self.client.put(
            "/api/settings/company_name/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("value", resp.data["detail"])


class SettingsResetAPITests(APITestCase):
    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.owner_user = _create_user(email="owner@example.com")
        self.owner = _create_membership(
            self.owner_user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.owner_user, self.tenant)

    def test_reset_returns_default(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Custom",
        )
        resp = self.client.delete(
            "/api/settings/company_name/",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["has_value"])
        self.assertEqual(resp.data["value"], "")  # default for text is ''

    def test_reset_nonexistent_returns_default(self):
        resp = self.client.delete(
            "/api/settings/company_name/",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["has_value"])

    def test_reset_unknown_key_returns_404(self):
        resp = self.client.delete(
            "/api/settings/nonexistent_key/",
        )
        self.assertEqual(resp.status_code, 404)

    def test_reset_deletes_db_row(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Custom",
        )
        self.client.delete(
            "/api/settings/company_name/",
        )
        self.assertFalse(
            AccountSetting.objects.filter(
                tenant=self.tenant, key="company_name",
            ).exists()
        )


class SettingsPermissionTests(APITestCase):
    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.member_user = _create_user(email="member@example.com")
        self.member = _create_membership(
            self.member_user, self.tenant, role=TenantRole.MEMBER,
        )
        login_as(self.client, self.member_user, self.tenant)

    def test_list_denied_without_settings_view(self):
        resp = self.client.get(
            "/api/settings/",
        )
        self.assertEqual(resp.status_code, 403)

    def test_list_allowed_with_settings_view(self):
        _grant_permissions(self.member, ["tenant_settings.view"])
        resp = self.client.get(
            "/api/settings/",
        )
        self.assertEqual(resp.status_code, 200)

    def test_upsert_denied_without_settings_manage(self):
        _grant_permissions(self.member, ["tenant_settings.view"])
        resp = self.client.put(
            "/api/settings/company_name/",
            {"value": "Acme"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403)

    def test_upsert_allowed_with_settings_manage(self):
        _grant_permissions(self.member, ["tenant_settings.manage"])
        resp = self.client.put(
            "/api/settings/company_name/",
            {"value": "Acme"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

    def test_reset_denied_without_settings_manage(self):
        _grant_permissions(self.member, ["tenant_settings.view"])
        resp = self.client.delete(
            "/api/settings/company_name/",
        )
        self.assertEqual(resp.status_code, 403)

    def test_reset_allowed_with_settings_manage(self):
        _grant_permissions(self.member, ["tenant_settings.manage"])
        resp = self.client.delete(
            "/api/settings/company_name/",
        )
        self.assertEqual(resp.status_code, 200)


class SettingsAuditTests(APITestCase):
    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.owner_user = _create_user(email="owner@example.com")
        self.owner = _create_membership(
            self.owner_user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.owner_user, self.tenant)

    def test_create_audit_log(self):
        self.client.put(
            "/api/settings/company_name/",
            {"value": "Acme"},
            format="json",
        )
        log = AuditLog.objects.filter(
            resource_type="setting", action="create",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.resource_id, "company_name")
        self.assertEqual(log.after["value"], "Acme")

    def test_update_audit_log(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Old",
        )
        self.client.put(
            "/api/settings/company_name/",
            {"value": "New"},
            format="json",
        )
        log = AuditLog.objects.filter(
            resource_type="setting", action="update",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.before["value"], "Old")
        self.assertEqual(log.after["value"], "New")

    def test_delete_audit_log(self):
        AccountSetting.objects.create(
            tenant=self.tenant, key="company_name", value="Acme",
        )
        self.client.delete(
            "/api/settings/company_name/",
        )
        log = AuditLog.objects.filter(
            resource_type="setting", action="delete",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.resource_id, "company_name")

    def test_no_audit_log_on_reset_nonexistent(self):
        self.client.delete(
            "/api/settings/company_name/",
        )
        count = AuditLog.objects.filter(resource_type="setting").count()
        self.assertEqual(count, 0)


# ---------------------------------------------------------------------------
# Logo tests
# ---------------------------------------------------------------------------


def _make_test_image(width=100, height=100, fmt="PNG"):
    """Create a valid in-memory image file."""
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=(255, 0, 0))
    img.save(buf, format=fmt)
    buf.seek(0)
    buf.name = f"logo.{fmt.lower()}"
    return buf


def _make_fake_file(content=b"not an image", name="fake.txt", content_type="text/plain"):
    """Create a fake non-image file."""
    buf = io.BytesIO(content)
    buf.name = name
    return buf


class LogoUploadTests(APITestCase):
    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.owner_user = _create_user(email="owner@example.com")
        self.owner = _create_membership(
            self.owner_user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.owner_user, self.tenant)

    def test_has_logo_false_initially(self):
        resp = self.client.get(
            "/api/settings/logo/",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["has_logo"])

    def test_upload_valid_image(self):
        img = _make_test_image()
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["has_logo"])

    def test_has_logo_true_after_upload(self):
        img = _make_test_image()
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        resp = self.client.get(
            "/api/settings/logo/",
        )
        self.assertTrue(resp.data["has_logo"])

    def test_upload_rejects_non_image(self):
        fake = _make_fake_file()
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": fake},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_upload_rejects_oversized_file(self):
        # Create a valid image header but padded to > 1MB
        buf = io.BytesIO()
        img = Image.new("RGB", (100, 100))
        img.save(buf, format="PNG")
        buf.write(b"\x00" * (1024 * 1024 + 1))
        buf.seek(0)
        buf.name = "big.png"
        buf.size = buf.getbuffer().nbytes
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": buf},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("1 MB", resp.data["detail"])

    def test_upload_no_file_returns_400(self):
        resp = self.client.post(
            "/api/settings/logo/",
            {},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_delete_logo(self):
        img = _make_test_image()
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        resp = self.client.delete(
            "/api/settings/logo/",
        )
        self.assertEqual(resp.status_code, 204)
        # Verify it's gone
        resp2 = self.client.get(
            "/api/settings/logo/",
        )
        self.assertFalse(resp2.data["has_logo"])

    def test_delete_nonexistent_logo_204(self):
        resp = self.client.delete(
            "/api/settings/logo/",
        )
        self.assertEqual(resp.status_code, 204)

    def test_logo_content_serves_file(self):
        img = _make_test_image()
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        resp = self.client.get(
            "/api/settings/logo-content/",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "image/png")

    def test_logo_content_404_when_no_logo(self):
        resp = self.client.get(
            "/api/settings/logo-content/",
        )
        self.assertEqual(resp.status_code, 404)

    def test_upload_replaces_existing_logo(self):
        img1 = _make_test_image(width=50, height=50)
        self.client.post(
            "/api/settings/logo/",
            {"logo": img1},
            format="multipart",
        )
        img2 = _make_test_image(width=200, height=200)
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": img2},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)
        # Only one setting row
        self.assertEqual(
            AccountSetting.objects.filter(
                tenant=self.tenant, key="logo",
            ).count(),
            1,
        )


class LogoPermissionTests(APITestCase):
    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.member_user = _create_user(email="member@example.com")
        self.member = _create_membership(
            self.member_user, self.tenant, role=TenantRole.MEMBER,
        )
        login_as(self.client, self.member_user, self.tenant)

    def test_get_logo_status_denied_without_settings_view(self):
        resp = self.client.get(
            "/api/settings/logo/",
        )
        self.assertEqual(resp.status_code, 403)

    def test_get_logo_status_allowed_with_settings_view(self):
        _grant_permissions(self.member, ["tenant_settings.view"])
        resp = self.client.get(
            "/api/settings/logo/",
        )
        self.assertEqual(resp.status_code, 200)

    def test_upload_denied_without_settings_manage(self):
        _grant_permissions(self.member, ["tenant_settings.view"])
        img = _make_test_image()
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 403)

    def test_upload_allowed_with_settings_manage(self):
        _grant_permissions(self.member, ["tenant_settings.manage"])
        img = _make_test_image()
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)

    def test_delete_denied_without_settings_manage(self):
        _grant_permissions(self.member, ["tenant_settings.view"])
        resp = self.client.delete(
            "/api/settings/logo/",
        )
        self.assertEqual(resp.status_code, 403)

    def test_delete_allowed_with_settings_manage(self):
        _grant_permissions(self.member, ["tenant_settings.manage"])
        resp = self.client.delete(
            "/api/settings/logo/",
        )
        self.assertEqual(resp.status_code, 204)

    def test_logo_content_accessible_to_authenticated_user(self):
        # Upload as owner first
        owner_user = _create_user(email="owner@example.com")
        owner = _create_membership(owner_user, self.tenant, role=TenantRole.OWNER)
        login_as(self.client, owner_user, self.tenant)
        img = _make_test_image()
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        # Member (no special perms) can view logo content
        resp = self.client.get(
            "/api/settings/logo-content/",
        )
        self.assertEqual(resp.status_code, 200)


class LogoAuditTests(APITestCase):
    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.owner_user = _create_user(email="owner@example.com")
        self.owner = _create_membership(
            self.owner_user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.owner_user, self.tenant)

    def test_upload_creates_audit_log(self):
        img = _make_test_image()
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        log = AuditLog.objects.filter(
            resource_type="setting", resource_id="logo",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.action, "update")

    def test_delete_creates_audit_log(self):
        img = _make_test_image()
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        AuditLog.objects.all().delete()
        self.client.delete(
            "/api/settings/logo/",
        )
        log = AuditLog.objects.filter(
            resource_type="setting", action="delete",
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.resource_id, "logo")


class LogoSecurityTests(APITestCase):
    """Test image validation security (magic bytes + Pillow decode)."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.owner_user = _create_user(email="owner@example.com")
        self.owner = _create_membership(
            self.owner_user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.owner_user, self.tenant)

    def test_rejects_text_file_with_image_extension(self):
        buf = io.BytesIO(b"This is not an image at all")
        buf.name = "logo.png"
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": buf},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("image", resp.data["detail"].lower())

    def test_rejects_fake_png_header(self):
        # Valid PNG magic bytes but garbage after
        buf = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        buf.name = "fake.png"
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": buf},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_rejects_svg_file(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        buf = io.BytesIO(svg)
        buf.name = "logo.svg"
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": buf},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_accepts_valid_jpeg(self):
        img = _make_test_image(fmt="JPEG")
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)

    def test_accepts_valid_png(self):
        img = _make_test_image(fmt="PNG")
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)


# ---------------------------------------------------------------------------
# Gap tests — Logo (Category 2.2)
# ---------------------------------------------------------------------------


class LogoResizeTests(APITestCase):
    """#18 — Logo resized to max 512px wide on upload."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.owner_user = _create_user(email="owner@example.com")
        self.owner = _create_membership(
            self.owner_user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.owner_user, self.tenant)

    def test_large_image_resized_to_max_512_wide(self):
        """Upload a 1000x800 image and verify served content is <= 512px wide."""
        img = _make_test_image(width=1000, height=800)
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        resp = self.client.get(
            "/api/settings/logo-content/",
        )
        self.assertEqual(resp.status_code, 200)
        # Read the served image and check dimensions
        served_bytes = b"".join(resp.streaming_content)
        served_img = Image.open(io.BytesIO(served_bytes))
        self.assertLessEqual(served_img.width, 512)
        # Verify aspect ratio is preserved (1000:800 = 5:4 → 512:409)
        expected_height = int(800 * (512 / 1000))
        self.assertEqual(served_img.height, expected_height)

    def test_small_image_not_upscaled(self):
        """Upload a 200x150 image and verify it is NOT upscaled to 512."""
        img = _make_test_image(width=200, height=150)
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        resp = self.client.get(
            "/api/settings/logo-content/",
        )
        self.assertEqual(resp.status_code, 200)
        served_bytes = b"".join(resp.streaming_content)
        served_img = Image.open(io.BytesIO(served_bytes))
        self.assertEqual(served_img.width, 200)
        self.assertEqual(served_img.height, 150)

    def test_exactly_512_wide_not_resized(self):
        """Upload a 512x400 image; should remain 512x400."""
        img = _make_test_image(width=512, height=400)
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        resp = self.client.get(
            "/api/settings/logo-content/",
        )
        self.assertEqual(resp.status_code, 200)
        served_bytes = b"".join(resp.streaming_content)
        served_img = Image.open(io.BytesIO(served_bytes))
        self.assertEqual(served_img.width, 512)
        self.assertEqual(served_img.height, 400)


class LogoCrossTenantIsolationTests(APITestCase):
    """#21 — Cross-tenant logo isolation."""

    def setUp(self):
        seed_permissions()
        self.tenant_a = _create_tenant(name="Tenant A", slug="tenant-a")
        self.tenant_b = _create_tenant(name="Tenant B", slug="tenant-b")

        self.user_a = _create_user(email="usera@example.com")
        self.owner_a = _create_membership(
            self.user_a, self.tenant_a, role=TenantRole.OWNER,
        )


        self.user_b = _create_user(email="userb@example.com")
        self.owner_b = _create_membership(
            self.user_b, self.tenant_b, role=TenantRole.OWNER,
        )

    def test_tenant_b_cannot_see_tenant_a_logo(self):
        """Upload logo for tenant A, then verify tenant B gets 404."""
        login_as(self.client, self.user_a, self.tenant_a)
        img = _make_test_image()
        resp = self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201)

        # Tenant B should get 404 — no logo for their tenant
        login_as(self.client, self.user_b, self.tenant_b)
        resp = self.client.get("/api/settings/logo-content/")
        self.assertEqual(resp.status_code, 404)

    def test_tenant_b_has_logo_false_when_only_tenant_a_uploaded(self):
        """has_logo check for tenant B returns False when only A has a logo."""
        login_as(self.client, self.user_a, self.tenant_a)
        img = _make_test_image()
        self.client.post(
            "/api/settings/logo/",
            {"logo": img},
            format="multipart",
        )

        login_as(self.client, self.user_b, self.tenant_b)
        resp = self.client.get("/api/settings/logo/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["has_logo"])

    def test_each_tenant_gets_own_logo(self):
        """Upload different logos for A and B; each sees their own."""
        login_as(self.client, self.user_a, self.tenant_a)
        img_a = _make_test_image(width=100, height=100)
        self.client.post(
            "/api/settings/logo/",
            {"logo": img_a},
            format="multipart",
        )
        login_as(self.client, self.user_b, self.tenant_b)
        img_b = _make_test_image(width=200, height=200)
        self.client.post(
            "/api/settings/logo/",
            {"logo": img_b},
            format="multipart",
        )

        # Tenant A logo
        login_as(self.client, self.user_a, self.tenant_a)
        resp_a = self.client.get("/api/settings/logo-content/")
        self.assertEqual(resp_a.status_code, 200)
        bytes_a = b"".join(resp_a.streaming_content)
        img_served_a = Image.open(io.BytesIO(bytes_a))

        # Tenant B logo
        login_as(self.client, self.user_b, self.tenant_b)
        resp_b = self.client.get("/api/settings/logo-content/")
        self.assertEqual(resp_b.status_code, 200)
        bytes_b = b"".join(resp_b.streaming_content)
        img_served_b = Image.open(io.BytesIO(bytes_b))

        # They uploaded different sizes, so served dimensions differ
        self.assertEqual(img_served_a.width, 100)
        self.assertEqual(img_served_b.width, 200)


class LogoPathTraversalTests(TestCase):
    """#20 — Path traversal guard in LogoService.open()."""

    def test_open_rejects_path_outside_media_root(self):
        """LogoService.open() returns None for paths with traversal."""
        from .logo_service import LogoService

        service = LogoService()
        # Attempt to traverse outside MEDIA_ROOT
        result = service.open("/etc/passwd")
        self.assertIsNone(result)

    def test_open_rejects_relative_traversal(self):
        """LogoService.open() returns None for ../../../etc/passwd style paths."""
        from .logo_service import LogoService

        service = LogoService()
        result = service.open("../../../etc/passwd")
        self.assertIsNone(result)

    def test_save_rejects_traversal_in_tenant_id(self):
        """_save_to_storage raises ValueError if tenant_id contains traversal."""
        from .logo_service import LogoService

        buf = io.BytesIO(b"\x00" * 10)
        # A malicious tenant_id with path traversal
        with self.assertRaises((ValueError, OSError)):
            LogoService._save_to_storage("../../etc", buf)
