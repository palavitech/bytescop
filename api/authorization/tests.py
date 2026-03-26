from unittest.mock import patch, MagicMock

from django.test import TestCase
from rest_framework.test import APITestCase

from accounts.models import User
from authorization.models import Permission, TenantGroup
from authorization.permissions import (
    TenantPermission,
    get_tenant_member,
    get_user_permissions,
)
from authorization.seed import (
    PERMISSIONS,
    create_default_groups_for_tenant,
    seed_permissions,
)
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole


STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    kwargs.setdefault("email_verified", True)
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


def _setup_tenant_with_groups():
    """Create tenant, seed permissions, create default groups."""
    tenant = _create_tenant()
    seed_permissions()
    groups = create_default_groups_for_tenant(tenant)
    return tenant, groups




# ---------------------------------------------------------------------------
# Seed tests
# ---------------------------------------------------------------------------


class SeedPermissionsTests(TestCase):
    """Test seed_permissions() creates all expected permissions."""

    def test_creates_all_permissions(self):
        seed_permissions()
        self.assertEqual(Permission.objects.count(), len(PERMISSIONS))

    def test_all_codenames_present(self):
        seed_permissions()
        expected = {code for code, _, _, _ in PERMISSIONS}
        actual = set(Permission.objects.values_list("codename", flat=True))
        self.assertEqual(expected, actual)

    def test_idempotent(self):
        seed_permissions()
        seed_permissions()
        self.assertEqual(Permission.objects.count(), len(PERMISSIONS))

    def test_updates_existing_name(self):
        seed_permissions()
        perm = Permission.objects.get(codename="client.view")
        perm.name = "Old name"
        perm.save()
        seed_permissions()
        perm.refresh_from_db()
        self.assertEqual(perm.name, "View clients")


class CreateDefaultGroupsTests(TestCase):
    """Test create_default_groups_for_tenant()."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()

    def test_creates_three_groups(self):
        groups = create_default_groups_for_tenant(self.tenant)
        self.assertEqual(len(groups), 3)
        self.assertIn("Administrators", groups)
        self.assertIn("Analysts", groups)
        self.assertIn("Collaborators", groups)

    def test_groups_are_default(self):
        groups = create_default_groups_for_tenant(self.tenant)
        for group in groups.values():
            self.assertTrue(group.is_default)

    def test_administrators_exclude_owner_only_permissions(self):
        from authorization.seed import OWNER_ONLY_PERMISSIONS
        groups = create_default_groups_for_tenant(self.tenant)
        admin_group = groups["Administrators"]
        total = Permission.objects.count()
        expected = total - len(OWNER_ONLY_PERMISSIONS)
        self.assertEqual(admin_group.permissions.count(), expected)
        codes = set(admin_group.permissions.values_list("codename", flat=True))
        for owner_perm in OWNER_ONLY_PERMISSIONS:
            self.assertNotIn(owner_perm, codes)

    def test_analysts_have_scoped_permissions(self):
        groups = create_default_groups_for_tenant(self.tenant)
        analyst_group = groups["Analysts"]
        codes = set(analyst_group.permissions.values_list("codename", flat=True))
        # Full CRUD on findings and evidence
        for res in ("finding", "evidence"):
            for action in ("view", "create", "update", "delete"):
                self.assertIn(f"{res}.{action}", codes)
        # View-only on organizational resources
        for res in ("client", "asset", "engagement", "sow"):
            self.assertIn(f"{res}.view", codes)
            self.assertNotIn(f"{res}.create", codes)
            self.assertNotIn(f"{res}.delete", codes)
        self.assertIn("scope.view", codes)
        # Engagement settings — view only
        self.assertIn("engagement_settings.view", codes)
        # Collaboration
        self.assertIn("comment.create", codes)
        self.assertIn("comment.edit", codes)
        self.assertIn("feature_request.create", codes)
        # No audit access
        self.assertNotIn("audit.view", codes)
        self.assertEqual(analyst_group.permissions.count(), 17)

    def test_viewers_have_view_and_comment_permissions(self):
        groups = create_default_groups_for_tenant(self.tenant)
        viewer_group = groups["Collaborators"]
        codes = set(viewer_group.permissions.values_list("codename", flat=True))
        allowed = {"comment.create", "comment.edit", "feature_request.create"}
        for perm in viewer_group.permissions.all():
            if perm.codename not in allowed:
                self.assertEqual(perm.category, "model")
                self.assertTrue(perm.codename.endswith(".view"))
        # Collaborators must NOT see engagement settings
        self.assertNotIn("engagement_settings.view", codes)

    def test_idempotent(self):
        create_default_groups_for_tenant(self.tenant)
        create_default_groups_for_tenant(self.tenant)
        self.assertEqual(
            TenantGroup.objects.filter(tenant=self.tenant).count(), 3,
        )

    def test_different_tenants_get_separate_groups(self):
        tenant2 = _create_tenant(name="Beta Corp", slug="beta-corp")
        create_default_groups_for_tenant(self.tenant)
        create_default_groups_for_tenant(tenant2)
        self.assertEqual(TenantGroup.objects.filter(tenant=self.tenant).count(), 3)
        self.assertEqual(TenantGroup.objects.filter(tenant=tenant2).count(), 3)


# ---------------------------------------------------------------------------
# Permission checking tests
# ---------------------------------------------------------------------------


class GetUserPermissionsTests(TestCase):
    """Test get_user_permissions() returns correct codenames."""

    def test_returns_empty_for_none(self):
        self.assertEqual(get_user_permissions(None), set())

    def test_returns_permissions_from_groups(self):
        tenant, groups = _setup_tenant_with_groups()
        user = _create_user()
        member = _create_membership(user, tenant, role=TenantRole.MEMBER)
        member.groups.add(groups["Analysts"])

        perms = get_user_permissions(member)
        self.assertIn("client.view", perms)
        self.assertIn("finding.create", perms)
        self.assertNotIn("client.create", perms)
        self.assertNotIn("user.view", perms)

    def test_returns_admin_perms_for_administrators(self):
        from authorization.seed import OWNER_ONLY_PERMISSIONS
        tenant, groups = _setup_tenant_with_groups()
        user = _create_user()
        member = _create_membership(user, tenant, role=TenantRole.MEMBER)
        member.groups.add(groups["Administrators"])

        perms = get_user_permissions(member)
        all_codes = set(Permission.objects.values_list("codename", flat=True))
        expected = all_codes - OWNER_ONLY_PERMISSIONS
        self.assertEqual(perms, expected)

    def test_union_of_multiple_groups(self):
        tenant, groups = _setup_tenant_with_groups()
        user = _create_user()
        member = _create_membership(user, tenant, role=TenantRole.MEMBER)
        member.groups.add(groups["Collaborators"])

        # Create a custom group with user.view
        custom_group = TenantGroup.objects.create(
            tenant=tenant, name="Custom",
        )
        user_view = Permission.objects.get(codename="user.view")
        custom_group.permissions.add(user_view)
        member.groups.add(custom_group)

        perms = get_user_permissions(member)
        self.assertIn("client.view", perms)  # from Collaborators
        self.assertIn("user.view", perms)    # from Custom


class TenantPermissionTests(TestCase):
    """Test TenantPermission DRF permission class."""

    def _make_request(self, user, tenant):
        """Create a mock request-like object."""
        from types import SimpleNamespace
        request = SimpleNamespace()
        request.user = user
        request.tenant = tenant
        return request

    def _make_view(self, action, required_permissions=None):
        from types import SimpleNamespace
        view = SimpleNamespace()
        view.action = action
        view.required_permissions = required_permissions or {}
        return view

    def test_owner_bypasses_all_checks(self):
        tenant, groups = _setup_tenant_with_groups()
        user = _create_user()
        member = _create_membership(user, tenant, role=TenantRole.OWNER)
        # Owner has NO group assignments, but should still pass
        request = self._make_request(user, tenant)
        view = self._make_view("destroy", {"destroy": ["client.delete"]})

        perm = TenantPermission()
        self.assertTrue(perm.has_permission(request, view))

    def test_user_with_permission_allowed(self):
        tenant, groups = _setup_tenant_with_groups()
        user = _create_user()
        member = _create_membership(user, tenant, role=TenantRole.MEMBER)
        member.groups.add(groups["Analysts"])

        request = self._make_request(user, tenant)
        view = self._make_view("list", {"list": ["client.view"]})

        perm = TenantPermission()
        self.assertTrue(perm.has_permission(request, view))

    def test_user_without_permission_denied(self):
        tenant, groups = _setup_tenant_with_groups()
        user = _create_user()
        member = _create_membership(user, tenant, role=TenantRole.MEMBER)
        member.groups.add(groups["Collaborators"])

        request = self._make_request(user, tenant)
        view = self._make_view("create", {"create": ["client.create"]})

        perm = TenantPermission()
        self.assertFalse(perm.has_permission(request, view))

    def test_unmapped_action_denied(self):
        """Actions with no required_permissions entry are denied (fail-closed, M2)."""
        tenant, groups = _setup_tenant_with_groups()
        user = _create_user()
        member = _create_membership(user, tenant, role=TenantRole.MEMBER)

        request = self._make_request(user, tenant)
        view = self._make_view("list", {})

        perm = TenantPermission()
        self.assertFalse(perm.has_permission(request, view))

    def test_no_tenant_denies_access(self):
        user = _create_user()
        request = self._make_request(user, None)
        view = self._make_view("list", {"list": ["client.view"]})

        perm = TenantPermission()
        self.assertFalse(perm.has_permission(request, view))

    def test_no_membership_denies_access(self):
        tenant = _create_tenant()
        user = _create_user()
        # No membership created
        request = self._make_request(user, tenant)
        view = self._make_view("list", {"list": ["client.view"]})

        perm = TenantPermission()
        self.assertFalse(perm.has_permission(request, view))

    def test_requires_all_listed_permissions(self):
        tenant, groups = _setup_tenant_with_groups()
        user = _create_user()
        member = _create_membership(user, tenant, role=TenantRole.MEMBER)
        member.groups.add(groups["Collaborators"])

        request = self._make_request(user, tenant)
        view = self._make_view("update", {"update": ["client.view", "client.update"]})

        perm = TenantPermission()
        # Collaborators only have *.view, not *.update
        self.assertFalse(perm.has_permission(request, view))


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------


class PermissionListEndpointTests(APITestCase):
    """Test GET /api/authorization/permissions/."""

    URL = "/api/authorization/permissions/"

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.member = _create_membership(self.user, self.tenant)
        login_as(self.client, self.user, self.tenant)

    def test_returns_200(self):
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)

    def test_returns_all_permissions(self):
        response = self.client.get(self.URL)
        self.assertEqual(len(response.data), len(PERMISSIONS))

    def test_unauthenticated_returns_401(self):
        self.client.logout()
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 401)


class MyPermissionsEndpointTests(APITestCase):
    """Test GET /api/authorization/my-permissions/."""

    URL = "/api/authorization/my-permissions/"

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

    def _auth(self, user, tenant):
        login_as(self.client, user, tenant)

    def test_root_user_is_root(self):
        user = _create_user()
        member = _create_membership(user, self.tenant, role=TenantRole.OWNER)
        member.groups.add(self.groups["Administrators"])
        self._auth(user, self.tenant)

        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_root"])

    def test_root_user_gets_all_permissions(self):
        user = _create_user()
        member = _create_membership(user, self.tenant, role=TenantRole.OWNER)
        self._auth(user, self.tenant)

        response = self.client.get(self.URL)
        all_codenames = set(Permission.objects.values_list("codename", flat=True))
        self.assertEqual(set(response.data["permissions"]), all_codenames)

    def test_non_root_gets_group_permissions(self):
        user = _create_user()
        member = _create_membership(user, self.tenant, role=TenantRole.MEMBER)
        member.groups.add(self.groups["Collaborators"])
        self._auth(user, self.tenant)

        response = self.client.get(self.URL)
        self.assertFalse(response.data["is_root"])
        allowed_extras = {"comment.create", "comment.edit", "feature_request.create"}
        for perm in response.data["permissions"]:
            if perm not in allowed_extras:
                self.assertTrue(perm.endswith(".view"))

    def test_includes_groups(self):
        user = _create_user()
        member = _create_membership(user, self.tenant, role=TenantRole.MEMBER)
        member.groups.add(self.groups["Collaborators"])
        self._auth(user, self.tenant)

        response = self.client.get(self.URL)
        self.assertEqual(len(response.data["groups"]), 1)
        self.assertEqual(response.data["groups"][0]["name"], "Collaborators")


class GroupCRUDEndpointTests(APITestCase):
    """Test group CRUD endpoints."""

    LIST_URL = "/api/authorization/groups/"

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        # Owner user
        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)
        self.owner_member.groups.add(self.groups["Administrators"])

        # Viewer user (no group management permissions)
        self.viewer = _create_user(email="viewer@example.com")
        self.viewer_member = _create_membership(self.viewer, self.tenant, role=TenantRole.MEMBER)
        self.viewer_member.groups.add(self.groups["Collaborators"])

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def test_list_groups_as_owner(self):
        self._auth_as(self.owner)
        response = self.client.get(self.LIST_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)

    def test_list_groups_as_viewer_denied(self):
        self._auth_as(self.viewer)
        response = self.client.get(self.LIST_URL)
        self.assertEqual(response.status_code, 403)

    def test_create_custom_group(self):
        self._auth_as(self.owner)
        perm = Permission.objects.first()
        response = self.client.post(
            self.LIST_URL,
            {"name": "Custom Group", "description": "Test", "permission_ids": [str(perm.pk)]},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Custom Group")
        self.assertFalse(response.data["is_default"])

    def test_create_duplicate_name_rejected(self):
        self._auth_as(self.owner)
        response = self.client.post(
            self.LIST_URL,
            {"name": "Administrators", "description": "Dupe"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_get_group_detail(self):
        self._auth_as(self.owner)
        group = self.groups["Administrators"]
        response = self.client.get(f"{self.LIST_URL}{group.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Administrators")
        self.assertIn("permissions", response.data)

    def test_update_custom_group(self):
        self._auth_as(self.owner)
        custom = TenantGroup.objects.create(
            tenant=self.tenant, name="Custom", description="Original",
        )
        response = self.client.patch(
            f"{self.LIST_URL}{custom.pk}/",
            {"description": "Updated"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        custom.refresh_from_db()
        self.assertEqual(custom.description, "Updated")

    def test_update_default_group_rejected(self):
        self._auth_as(self.owner)
        group = self.groups["Administrators"]
        response = self.client.patch(
            f"{self.LIST_URL}{group.pk}/",
            {"description": "Modified"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_delete_custom_group(self):
        self._auth_as(self.owner)
        custom = TenantGroup.objects.create(
            tenant=self.tenant, name="Deletable",
        )
        response = self.client.delete(f"{self.LIST_URL}{custom.pk}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(TenantGroup.objects.filter(pk=custom.pk).exists())

    def test_delete_default_group_rejected(self):
        self._auth_as(self.owner)
        group = self.groups["Analysts"]
        response = self.client.delete(f"{self.LIST_URL}{group.pk}/")
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_create_group(self):
        self._auth_as(self.viewer)
        response = self.client.post(
            self.LIST_URL,
            {"name": "Blocked", "description": "Should fail"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)


class GroupMemberEndpointTests(APITestCase):
    """Test group member add/remove endpoints."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.analyst = _create_user(email="analyst@example.com")
        self.analyst_member = _create_membership(self.analyst, self.tenant, role=TenantRole.MEMBER)

        login_as(self.client, self.owner, self.tenant)

    def test_add_member_to_group(self):
        group = self.groups["Analysts"]
        response = self.client.post(
            f"/api/authorization/groups/{group.pk}/members/",
            {"member_id": str(self.analyst_member.pk)},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn(group, self.analyst_member.groups.all())

    def test_remove_member_from_group(self):
        group = self.groups["Analysts"]
        self.analyst_member.groups.add(group)

        response = self.client.delete(
            f"/api/authorization/groups/{group.pk}/members/{self.analyst_member.pk}/",
        )
        self.assertEqual(response.status_code, 204)
        self.assertNotIn(group, self.analyst_member.groups.all())

    def test_add_nonexistent_member_returns_404(self):
        import uuid
        group = self.groups["Analysts"]
        response = self.client.post(
            f"/api/authorization/groups/{group.pk}/members/",
            {"member_id": str(uuid.uuid4())},
            format="json",
        )
        self.assertEqual(response.status_code, 404)


# ---------------------------------------------------------------------------
# Auth response permissions tests
# ---------------------------------------------------------------------------


class LoginAuthorizationResponseTests(APITestCase):
    """Test that login step2 returns authorization data."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)
        self.user = _create_user(email="user@example.com")
        # Use Analysts group (not Administrators) to avoid MFA requirement
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.MEMBER)
        self.member.groups.add(self.groups["Analysts"])

    def test_login_includes_authorization(self):
        response = self.client.post(
            "/api/auth/login/select-tenant/",
            {
                "email": "user@example.com",
                "password": STRONG_PASSWORD,
                "tenant_id": str(self.tenant.id),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("authorization", response.data)
        auth_data = response.data["authorization"]
        self.assertFalse(auth_data["is_root"])
        self.assertGreater(len(auth_data["permissions"]), 0)


# ---------------------------------------------------------------------------
# Member (user) management endpoint tests
# ---------------------------------------------------------------------------


class MemberListCreateEndpointTests(APITestCase):
    """Test GET/POST /api/authorization/members/."""

    URL = "/api/authorization/members/"

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        # Raise subscription limits so they don't interfere with member tests
        from subscriptions.models import SubscriptionPlan
        SubscriptionPlan.objects.filter(code='free').update(max_members=100)

        # Owner
        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)
        self.owner_member.groups.add(self.groups["Administrators"])

        # Admin with user.* permissions
        self.admin = _create_user(email="admin@example.com")
        self.admin_member = _create_membership(self.admin, self.tenant, role=TenantRole.MEMBER)
        self.admin_member.groups.add(self.groups["Administrators"])

        # Viewer (no user management perms)
        self.viewer = _create_user(email="viewer@example.com")
        self.viewer_member = _create_membership(self.viewer, self.tenant, role=TenantRole.MEMBER)
        self.viewer_member.groups.add(self.groups["Collaborators"])

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def test_list_members_as_owner(self):
        self._auth_as(self.owner)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)

    def test_list_members_as_admin(self):
        self._auth_as(self.admin)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)

    def test_list_members_as_viewer_denied(self):
        self._auth_as(self.viewer)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 403)

    def test_create_member_new_user(self):
        self._auth_as(self.owner)
        response = self.client.post(
            self.URL,
            {
                "email": "new@example.com",
                "first_name": "New",
                "last_name": "User",
                "password": STRONG_PASSWORD,
                "password_confirm": STRONG_PASSWORD,
                "group_ids": [str(self.groups["Analysts"].pk)],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["email"], "new@example.com")
        self.assertEqual(response.data["role"], "member")
        self.assertEqual(len(response.data["groups"]), 1)

    def test_create_member_saves_phone_and_timezone(self):
        self._auth_as(self.owner)
        response = self.client.post(
            self.URL,
            {
                "email": "phonetz@example.com",
                "first_name": "Phone",
                "last_name": "TZ",
                "phone": "+9876543210",
                "timezone": "Asia/Kolkata",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["phone"], "+9876543210")
        self.assertEqual(response.data["user"]["timezone"], "Asia/Kolkata")

    def test_create_member_existing_user(self):
        """If user already exists in another tenant, reuse but update details."""
        other_tenant = _create_tenant(name="Other Corp", slug="other-corp")
        existing = _create_user(email="existing@example.com", first_name="Exists", last_name="Already")
        _create_membership(existing, other_tenant)

        self._auth_as(self.owner)
        response = self.client.post(
            self.URL,
            {
                "email": "existing@example.com",
                "first_name": "Updated",
                "last_name": "Name",
                "phone": "+1234567890",
                "timezone": "America/New_York",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        # Should update the existing user's details
        self.assertEqual(response.data["user"]["first_name"], "Updated")
        self.assertEqual(response.data["user"]["last_name"], "Name")
        self.assertEqual(response.data["user"]["phone"], "+1234567890")
        self.assertEqual(response.data["user"]["timezone"], "America/New_York")

    def test_create_duplicate_membership_rejected(self):
        self._auth_as(self.owner)
        response = self.client.post(
            self.URL,
            {
                "email": "admin@example.com",
                "first_name": "Admin",
                "last_name": "Again",
                "password": STRONG_PASSWORD,
                "password_confirm": STRONG_PASSWORD,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("already a member", response.data["detail"])

    def test_create_without_password_sets_unusable(self):
        """Invite flow: user created without password, gets unusable password."""
        self._auth_as(self.owner)
        response = self.client.post(
            self.URL,
            {
                "email": "invited@example.com",
                "first_name": "Invited",
                "last_name": "User",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        from accounts.models import User
        user = User.objects.get(email="invited@example.com")
        self.assertFalse(user.has_usable_password())

    def test_viewer_cannot_create(self):
        self._auth_as(self.viewer)
        response = self.client.post(
            self.URL,
            {
                "email": "nope@example.com",
                "first_name": "Nope",
                "last_name": "User",
                "password": STRONG_PASSWORD,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)


class MemberDetailEndpointTests(APITestCase):
    """Test GET/PATCH/DELETE /api/authorization/members/<id>/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.admin = _create_user(email="admin@example.com")
        self.admin_member = _create_membership(self.admin, self.tenant, role=TenantRole.MEMBER)
        self.admin_member.groups.add(self.groups["Administrators"])

        self.analyst = _create_user(email="analyst@example.com", first_name="Ana", last_name="Lyst")
        self.analyst_member = _create_membership(self.analyst, self.tenant, role=TenantRole.MEMBER)
        self.analyst_member.groups.add(self.groups["Analysts"])

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, member):
        return f"/api/authorization/members/{member.pk}/"

    def test_get_member_detail(self):
        self._auth_as(self.owner)
        response = self.client.get(self._url(self.analyst_member))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["email"], "analyst@example.com")
        self.assertEqual(response.data["role"], "member")

    def test_update_member_name(self):
        self._auth_as(self.owner)
        response = self.client.patch(
            self._url(self.analyst_member),
            {"first_name": "Updated", "last_name": "Name"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.analyst.refresh_from_db()
        self.assertEqual(self.analyst.first_name, "Updated")

    def test_update_member_groups(self):
        self._auth_as(self.owner)
        viewer_group = self.groups["Collaborators"]
        response = self.client.patch(
            self._url(self.analyst_member),
            {"group_ids": [str(viewer_group.pk)]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            list(self.analyst_member.groups.values_list("pk", flat=True)),
            [viewer_group.pk],
        )

    def test_admin_can_update_owner_profile_fields(self):
        """Admins can update owner's profile fields (name, phone, timezone)."""
        self._auth_as(self.admin)
        response = self.client.patch(
            self._url(self.owner_member),
            {"first_name": "NewFirst", "last_name": "NewLast", "phone": "+1234", "timezone": "US/Eastern"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.first_name, "NewFirst")
        self.assertEqual(self.owner.last_name, "NewLast")
        self.assertEqual(self.owner.phone, "+1234")
        self.assertEqual(self.owner.timezone, "US/Eastern")

    def test_admin_update_owner_groups_silently_ignored(self):
        """Group assignments on the owner are silently ignored (owner bypasses RBAC)."""
        self._auth_as(self.admin)
        viewer_group = self.groups["Collaborators"]
        response = self.client.patch(
            self._url(self.owner_member),
            {"group_ids": [str(viewer_group.pk)]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        # Groups should remain unchanged
        self.assertEqual(list(self.owner_member.groups.all()), [])

    def test_owner_can_update_own_profile_fields(self):
        """Owner can update their own profile fields via admin endpoint."""
        self._auth_as(self.owner)
        response = self.client.patch(
            self._url(self.owner_member),
            {"phone": "+9876", "timezone": "Asia/Kolkata"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.owner.refresh_from_db()
        self.assertEqual(self.owner.phone, "+9876")
        self.assertEqual(self.owner.timezone, "Asia/Kolkata")

    def test_owner_update_own_groups_silently_ignored(self):
        """Owner's own group assignments are silently ignored."""
        self._auth_as(self.owner)
        viewer_group = self.groups["Collaborators"]
        response = self.client.patch(
            self._url(self.owner_member),
            {"group_ids": [str(viewer_group.pk)]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(self.owner_member.groups.all()), [])

    def test_non_owner_cannot_update_self(self):
        self._auth_as(self.admin)
        response = self.client.patch(
            self._url(self.admin_member),
            {"first_name": "Changed"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("your own", response.data["detail"].lower())

    def test_delete_member(self):
        self._auth_as(self.owner)
        response = self.client.delete(self._url(self.analyst_member))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(TenantMember.objects.filter(pk=self.analyst_member.pk).exists())

    def test_cannot_delete_owner(self):
        self._auth_as(self.admin)
        response = self.client.delete(self._url(self.owner_member))
        self.assertEqual(response.status_code, 403)

    def test_cannot_delete_self(self):
        self._auth_as(self.admin)
        response = self.client.delete(self._url(self.admin_member))
        self.assertEqual(response.status_code, 403)

    def test_delete_and_recreate_updates_user_details(self):
        """Deleting a member and recreating should update phone/timezone."""
        self._auth_as(self.owner)

        # Delete the analyst member
        response = self.client.delete(self._url(self.analyst_member))
        self.assertEqual(response.status_code, 204)

        # User record still exists
        user = User.objects.get(pk=self.analyst.pk)
        self.assertEqual(user.phone, "")

        # Recreate with phone and timezone
        response = self.client.post(
            "/api/authorization/members/",
            {
                "email": self.analyst.email,
                "first_name": "Updated",
                "last_name": "Analyst",
                "phone": "+5551234567",
                "timezone": "Europe/London",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user"]["first_name"], "Updated")
        self.assertEqual(response.data["user"]["phone"], "+5551234567")
        self.assertEqual(response.data["user"]["timezone"], "Europe/London")

    def test_get_nonexistent_member(self):
        import uuid
        self._auth_as(self.owner)
        response = self.client.get(f"/api/authorization/members/{uuid.uuid4()}/")
        self.assertEqual(response.status_code, 404)


class MemberToggleActiveEndpointTests(APITestCase):
    """Test POST /api/authorization/members/<id>/toggle-active/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.admin = _create_user(email="admin@example.com")
        self.admin_member = _create_membership(self.admin, self.tenant, role=TenantRole.MEMBER)
        self.admin_member.groups.add(self.groups["Administrators"])

        self.analyst = _create_user(email="analyst@example.com")
        self.analyst_member = _create_membership(self.analyst, self.tenant, role=TenantRole.MEMBER)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, member):
        return f"/api/authorization/members/{member.pk}/toggle-active/"

    def test_lock_member(self):
        self._auth_as(self.owner)
        self.assertTrue(self.analyst_member.is_active)
        response = self.client.post(self._url(self.analyst_member))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])
        self.analyst_member.refresh_from_db()
        self.assertFalse(self.analyst_member.is_active)

    def test_unlock_member(self):
        self.analyst_member.is_active = False
        self.analyst_member.save()

        self._auth_as(self.owner)
        response = self.client.post(self._url(self.analyst_member))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_active"])

    def test_cannot_lock_owner(self):
        self._auth_as(self.admin)
        response = self.client.post(self._url(self.owner_member))
        self.assertEqual(response.status_code, 403)

    def test_cannot_lock_self(self):
        self._auth_as(self.admin)
        response = self.client.post(self._url(self.admin_member))
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Owner promote tests
# ---------------------------------------------------------------------------


class OwnerPromoteTests(APITestCase):
    """Test POST /api/authorization/members/<id>/promote/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        # Owner (must have mfa_enabled=True on the User model for promote endpoint)
        self.owner = _create_user(email="owner@example.com")
        self.owner.mfa_enabled = True
        self.owner.save(update_fields=["mfa_enabled"])
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        # Regular member (target for promotion)
        self.member_user = _create_user(email="member@example.com")
        self.member_tm = _create_membership(self.member_user, self.tenant, role=TenantRole.MEMBER)
        self.member_tm.invite_status = "accepted"
        self.member_tm.save(update_fields=["invite_status"])
        self.member_tm.groups.add(self.groups["Analysts"])

        # Admin member with user.update perm (non-owner)
        self.admin = _create_user(email="admin@example.com")
        self.admin_member = _create_membership(self.admin, self.tenant, role=TenantRole.MEMBER)
        self.admin_member.groups.add(self.groups["Administrators"])

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, member):
        return f"/api/authorization/members/{member.pk}/promote/"

    @patch("authorization.views_users.get_event_publisher")
    @patch("authorization.views_users.verify_mfa", return_value=True)
    def test_promote_success(self, mock_mfa, mock_publisher):
        mock_publisher.return_value = MagicMock()
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.member_tm), {"mfa_code": "123456"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.member_tm.refresh_from_db()
        self.assertEqual(self.member_tm.role, TenantRole.OWNER)
        self.assertEqual(response.data["role"], "owner")

    def test_promote_requires_owner(self):
        self._auth_as(self.admin)
        response = self.client.post(self._url(self.member_tm), {"mfa_code": "123456"}, format="json")
        self.assertEqual(response.status_code, 403)

    @patch("authorization.views_users.verify_mfa", return_value=True)
    def test_promote_self_rejected(self, mock_mfa):
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.owner_member), {"mfa_code": "123456"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("yourself", response.data["detail"].lower())

    @patch("authorization.views_users.verify_mfa", return_value=True)
    def test_promote_already_owner(self, mock_mfa):
        # Make a second owner with accepted invite
        user2 = _create_user(email="owner2@example.com")
        member2 = _create_membership(user2, self.tenant, role=TenantRole.OWNER)
        member2.invite_status = "accepted"
        member2.save(update_fields=["invite_status"])
        self._auth_as(self.owner)
        response = self.client.post(self._url(member2), {"mfa_code": "123456"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("already an owner", response.data["detail"].lower())

    @patch("authorization.views_users.verify_mfa", return_value=True)
    def test_promote_inactive_member(self, mock_mfa):
        self.member_tm.is_active = False
        self.member_tm.save(update_fields=["is_active"])
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.member_tm), {"mfa_code": "123456"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("inactive", response.data["detail"].lower())

    @patch("authorization.views_users.verify_mfa", return_value=True)
    def test_promote_pending_invite(self, mock_mfa):
        self.member_tm.invite_status = "pending"
        self.member_tm.save(update_fields=["invite_status"])
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.member_tm), {"mfa_code": "123456"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("invitation", response.data["detail"].lower())

    def test_promote_mfa_not_enabled(self):
        # Disable MFA on the owner user — but we need to auth first with MFA enabled
        # so auth the owner, then disable MFA
        self._auth_as(self.owner)
        self.owner.mfa_enabled = False
        self.owner.save(update_fields=["mfa_enabled"])
        response = self.client.post(self._url(self.member_tm), {"mfa_code": "123456"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("mfa", response.data["detail"].lower())

    @patch("authorization.views_users.verify_mfa", return_value=True)
    def test_promote_missing_mfa_code(self, mock_mfa):
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.member_tm), {}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("mfa code is required", response.data["detail"].lower())

    @patch("authorization.views_users.verify_mfa", return_value=False)
    def test_promote_invalid_mfa_code(self, mock_mfa):
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.member_tm), {"mfa_code": "000000"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid mfa", response.data["detail"].lower())

    @patch("authorization.views_users.get_event_publisher")
    @patch("authorization.views_users.verify_mfa", return_value=True)
    def test_promote_creates_audit_log(self, mock_mfa, mock_publisher):
        mock_publisher.return_value = MagicMock()
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.member_tm), {"mfa_code": "123456"}, format="json")
        self.assertEqual(response.status_code, 200)
        from audit.models import AuditLog
        entry = AuditLog.objects.filter(
            resource_type="member", resource_id=self.member_tm.pk,
        ).latest("timestamp")
        self.assertIn("Promoted", entry.resource_repr)
        self.assertEqual(entry.after["role"], "owner")

    def test_promote_unauthenticated(self):
        self.client.logout()
        response = self.client.post(self._url(self.member_tm), {"mfa_code": "123456"}, format="json")
        self.assertEqual(response.status_code, 401)


# ---------------------------------------------------------------------------
# Owner demote tests
# ---------------------------------------------------------------------------


class OwnerDemoteTests(APITestCase):
    """Test POST /api/authorization/members/<id>/demote/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        # Owner 1
        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        # Owner 2 (co-owner, target for demotion)
        self.owner2 = _create_user(email="owner2@example.com")
        self.owner2_member = _create_membership(self.owner2, self.tenant, role=TenantRole.OWNER)

        # Regular member
        self.member_user = _create_user(email="member@example.com")
        self.member_tm = _create_membership(self.member_user, self.tenant, role=TenantRole.MEMBER)
        self.member_tm.groups.add(self.groups["Administrators"])

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, member):
        return f"/api/authorization/members/{member.pk}/demote/"

    @patch("authorization.views_users.get_event_publisher")
    def test_demote_success(self, mock_publisher):
        mock_publisher.return_value = MagicMock()
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.owner2_member))
        self.assertEqual(response.status_code, 200)
        self.owner2_member.refresh_from_db()
        self.assertEqual(self.owner2_member.role, TenantRole.MEMBER)
        self.assertEqual(response.data["role"], "member")

    def test_demote_requires_owner(self):
        self._auth_as(self.member_user)
        response = self.client.post(self._url(self.owner2_member))
        self.assertEqual(response.status_code, 403)

    def test_demote_self_rejected(self):
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.owner_member))
        self.assertEqual(response.status_code, 400)
        self.assertIn("yourself", response.data["detail"].lower())

    def test_demote_target_not_owner(self):
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.member_tm))
        self.assertEqual(response.status_code, 400)
        self.assertIn("not an owner", response.data["detail"].lower())

    def test_demote_last_owner_blocked(self):
        """When only one active owner exists, demotion is blocked."""
        # Deactivate owner2 so only owner is active
        # owner2 keeps role=OWNER but is_active=False → _owner_count = 1
        self.owner2_member.is_active = False
        self.owner2_member.save(update_fields=["is_active"])
        self._auth_as(self.owner)
        # Target is owner2 (inactive but still role=OWNER). _owner_count = 1 → blocked.
        response = self.client.post(self._url(self.owner2_member))
        self.assertEqual(response.status_code, 400)
        self.assertIn("last owner", response.data["detail"].lower())

    @patch("authorization.views_users.get_event_publisher")
    def test_demote_creates_audit_log(self, mock_publisher):
        mock_publisher.return_value = MagicMock()
        self._auth_as(self.owner)
        response = self.client.post(self._url(self.owner2_member))
        self.assertEqual(response.status_code, 200)
        from audit.models import AuditLog
        entry = AuditLog.objects.filter(
            resource_type="member", resource_id=self.owner2_member.pk,
        ).latest("timestamp")
        self.assertIn("Demoted", entry.resource_repr)
        self.assertEqual(entry.after["role"], "member")

    def test_demote_unauthenticated(self):
        self.client.logout()
        response = self.client.post(self._url(self.owner2_member))
        self.assertEqual(response.status_code, 401)


# ---------------------------------------------------------------------------
# Owner guard tests (updated delete/lock behavior)
# ---------------------------------------------------------------------------


class OwnerGuardTests(APITestCase):
    """Test updated owner guards for delete and lock operations."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        # Two owners
        self.owner1 = _create_user(email="owner1@example.com")
        self.owner1_member = _create_membership(self.owner1, self.tenant, role=TenantRole.OWNER)

        self.owner2 = _create_user(email="owner2@example.com")
        self.owner2_member = _create_membership(self.owner2, self.tenant, role=TenantRole.OWNER)

        # Admin member with full perms
        self.admin = _create_user(email="admin@example.com")
        self.admin_member = _create_membership(self.admin, self.tenant, role=TenantRole.MEMBER)
        self.admin_member.groups.add(self.groups["Administrators"])

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def test_delete_co_owner_allowed(self):
        """With 2 owners, one owner can delete the other."""
        self._auth_as(self.owner1)
        response = self.client.delete(f"/api/authorization/members/{self.owner2_member.pk}/")
        self.assertEqual(response.status_code, 204)

    def test_delete_last_owner_blocked(self):
        """Cannot delete the last active owner."""
        # Remove owner2 first so only owner1 remains
        self.owner2_member.delete()
        self._auth_as(self.owner1)
        # Owner1 can't delete themselves (self-delete guard), so create another
        # owner to test with. Actually with 1 owner, deleting them is blocked.
        # But we need a different caller. Let's use admin to try to delete owner1.
        # But admin is not an owner, so "only an owner can remove another owner" → 403.
        # The "last owner" guard is behind the "only owner can delete owner" guard.
        # So let's test: create a member and try to delete the sole owner.
        self._auth_as(self.admin)
        response = self.client.delete(f"/api/authorization/members/{self.owner1_member.pk}/")
        self.assertEqual(response.status_code, 403)
        # Also test: create a new owner, then try to delete with only 1 left
        user3 = _create_user(email="owner3@example.com")
        member3 = _create_membership(user3, self.tenant, role=TenantRole.OWNER)
        # Now 2 owners: owner1 + owner3. Delete owner3 → 1 left. Then try to delete owner1.
        self._auth_as(user3)
        # owner3 tries to delete owner1, but after this there'd be 1 owner (owner3).
        # _owner_count before delete = 2, so it should pass. Let's test the actual "last owner" case.
        # Deactivate owner3 so _owner_count = 1 (only owner1 is active)
        member3.is_active = False
        member3.save(update_fields=["is_active"])
        self._auth_as(self.owner1)
        # owner1 tries to delete owner3 (inactive but still OWNER role)
        # _owner_count(tenant) = 1 (only owner1 active) → blocked
        response = self.client.delete(f"/api/authorization/members/{member3.pk}/")
        self.assertEqual(response.status_code, 403)
        self.assertIn("last owner", response.data["detail"].lower())

    def test_lock_co_owner_allowed(self):
        """With 2 owners, one owner can lock the other."""
        self._auth_as(self.owner1)
        response = self.client.post(f"/api/authorization/members/{self.owner2_member.pk}/toggle-active/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_active"])

    @patch("authorization.views_users._owner_count", return_value=1)
    def test_lock_last_owner_blocked(self, mock_count):
        """Cannot lock when it would leave zero active owners (race condition guard)."""
        self._auth_as(self.owner1)
        response = self.client.post(f"/api/authorization/members/{self.owner2_member.pk}/toggle-active/")
        self.assertEqual(response.status_code, 403)
        self.assertIn("last owner", response.data["detail"].lower())

    def test_admin_cannot_delete_any_user(self):
        """Administrators no longer have user.delete — blocked by permission check."""
        self._auth_as(self.admin)
        response = self.client.delete(f"/api/authorization/members/{self.owner1_member.pk}/")
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# Engagement-scoped visibility tests
# ---------------------------------------------------------------------------

class EngagementScopingTests(APITestCase):
    """Test that Analysts only see data from their assigned engagements."""

    def setUp(self):
        from clients.models import Client
        from engagements.models import Engagement, EngagementStakeholder, Sow, SowAsset
        from assets.models import Asset
        from findings.models import Finding

        seed_permissions()
        self.tenant = _create_tenant()
        groups = create_default_groups_for_tenant(self.tenant)

        # Owner — sees everything
        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        # Admin — sees everything (has user.view)
        self.admin = _create_user(email="admin@example.com")
        self.admin_member = _create_membership(self.admin, self.tenant, role=TenantRole.MEMBER)
        self.admin_member.groups.add(groups["Administrators"])

        # Analyst — engagement-scoped
        self.analyst = _create_user(email="analyst@example.com")
        self.analyst_member = _create_membership(self.analyst, self.tenant, role=TenantRole.MEMBER)
        self.analyst_member.groups.add(groups["Analysts"])

        # Collaborator — engagement-scoped
        self.collaborator = _create_user(email="collab@example.com")
        self.collab_member = _create_membership(self.collaborator, self.tenant, role=TenantRole.MEMBER)
        self.collab_member.groups.add(groups["Collaborators"])

        # Create two clients
        self.client_a = Client.objects.create(tenant=self.tenant, name="Client A")
        self.client_b = Client.objects.create(tenant=self.tenant, name="Client B")

        # Create assets for each client
        self.asset_a = Asset.objects.create(
            tenant=self.tenant, client=self.client_a, name="Asset A",
        )
        self.asset_b = Asset.objects.create(
            tenant=self.tenant, client=self.client_b, name="Asset B",
        )

        # Create two engagements
        self.eng_a = Engagement.objects.create(
            tenant=self.tenant, name="Eng A", client=self.client_a,
        )
        self.eng_b = Engagement.objects.create(
            tenant=self.tenant, name="Eng B", client=self.client_b,
        )

        # Create SOWs and add assets to scope
        sow_a = Sow.objects.create(engagement=self.eng_a)
        sow_b = Sow.objects.create(engagement=self.eng_b)
        SowAsset.objects.create(sow=sow_a, asset=self.asset_a)
        SowAsset.objects.create(sow=sow_b, asset=self.asset_b)

        # Create findings
        self.finding_a = Finding.objects.create(
            tenant=self.tenant, engagement=self.eng_a, asset=self.asset_a,
            title="Finding A", severity="high",
        )
        self.finding_b = Finding.objects.create(
            tenant=self.tenant, engagement=self.eng_b, asset=self.asset_b,
            title="Finding B", severity="medium",
        )

        # Assign analyst to Eng A only
        EngagementStakeholder.objects.create(
            engagement=self.eng_a, member=self.analyst_member,
        )
        # Assign collaborator to Eng B only
        EngagementStakeholder.objects.create(
            engagement=self.eng_b, member=self.collab_member,
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    # -- Engagement visibility --

    def test_owner_sees_all_engagements(self):
        self._auth_as(self.owner)
        response = self.client.get("/api/engagements/")
        self.assertEqual(response.status_code, 200)
        names = {e["name"] for e in response.data}
        self.assertEqual(names, {"Eng A", "Eng B"})

    def test_admin_sees_all_engagements(self):
        self._auth_as(self.admin)
        response = self.client.get("/api/engagements/")
        self.assertEqual(response.status_code, 200)
        names = {e["name"] for e in response.data}
        self.assertEqual(names, {"Eng A", "Eng B"})

    def test_analyst_sees_only_assigned_engagement(self):
        self._auth_as(self.analyst)
        response = self.client.get("/api/engagements/")
        self.assertEqual(response.status_code, 200)
        names = {e["name"] for e in response.data}
        self.assertEqual(names, {"Eng A"})

    def test_collaborator_sees_only_assigned_engagement(self):
        self._auth_as(self.collaborator)
        response = self.client.get("/api/engagements/")
        self.assertEqual(response.status_code, 200)
        names = {e["name"] for e in response.data}
        self.assertEqual(names, {"Eng B"})

    def test_analyst_cannot_retrieve_unassigned_engagement(self):
        self._auth_as(self.analyst)
        response = self.client.get(f"/api/engagements/{self.eng_b.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_analyst_can_retrieve_assigned_engagement(self):
        self._auth_as(self.analyst)
        response = self.client.get(f"/api/engagements/{self.eng_a.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Eng A")

    # -- Client visibility --

    def test_analyst_sees_only_clients_from_assigned_engagements(self):
        self._auth_as(self.analyst)
        response = self.client.get("/api/clients/")
        self.assertEqual(response.status_code, 200)
        names = {c["name"] for c in response.data}
        self.assertEqual(names, {"Client A"})

    def test_admin_sees_all_clients(self):
        self._auth_as(self.admin)
        response = self.client.get("/api/clients/")
        self.assertEqual(response.status_code, 200)
        names = {c["name"] for c in response.data}
        self.assertEqual(names, {"Client A", "Client B"})

    # -- Asset visibility --

    def test_analyst_sees_only_assets_from_assigned_engagements(self):
        self._auth_as(self.analyst)
        response = self.client.get("/api/assets/")
        self.assertEqual(response.status_code, 200)
        names = {a["name"] for a in response.data}
        self.assertEqual(names, {"Asset A"})

    def test_admin_sees_all_assets(self):
        self._auth_as(self.admin)
        response = self.client.get("/api/assets/")
        self.assertEqual(response.status_code, 200)
        names = {a["name"] for a in response.data}
        self.assertEqual(names, {"Asset A", "Asset B"})

    # -- Nested findings --

    def test_analyst_can_list_findings_in_assigned_engagement(self):
        self._auth_as(self.analyst)
        response = self.client.get(f"/api/engagements/{self.eng_a.pk}/findings/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], "Finding A")

    def test_analyst_cannot_list_findings_in_unassigned_engagement(self):
        self._auth_as(self.analyst)
        response = self.client.get(f"/api/engagements/{self.eng_b.pk}/findings/")
        self.assertEqual(response.status_code, 404)

    # -- Direct-link access (analyst has exact ID but no assignment) --

    def test_analyst_cannot_retrieve_finding_in_unassigned_engagement(self):
        """Analyst with a direct link to a finding in an unassigned engagement gets 404."""
        self._auth_as(self.analyst)
        response = self.client.get(
            f"/api/engagements/{self.eng_b.pk}/findings/{self.finding_b.pk}/",
        )
        self.assertEqual(response.status_code, 404)

    def test_analyst_cannot_retrieve_unassigned_client(self):
        """Analyst with a direct link to a client from an unassigned engagement gets 404."""
        self._auth_as(self.analyst)
        response = self.client.get(f"/api/clients/{self.client_b.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_analyst_cannot_retrieve_unassigned_asset(self):
        """Analyst with a direct link to an asset from an unassigned engagement gets 404."""
        self._auth_as(self.analyst)
        response = self.client.get(f"/api/assets/{self.asset_b.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_analyst_can_retrieve_assigned_finding(self):
        """Analyst can retrieve a finding in an assigned engagement."""
        self._auth_as(self.analyst)
        response = self.client.get(
            f"/api/engagements/{self.eng_a.pk}/findings/{self.finding_a.pk}/",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Finding A")

    def test_analyst_can_retrieve_assigned_client(self):
        """Analyst can retrieve a client from an assigned engagement."""
        self._auth_as(self.analyst)
        response = self.client.get(f"/api/clients/{self.client_a.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Client A")

    def test_analyst_can_retrieve_assigned_asset(self):
        """Analyst can retrieve an asset from an assigned engagement."""
        self._auth_as(self.analyst)
        response = self.client.get(f"/api/assets/{self.asset_a.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Asset A")

    # -- Scoping helper unit tests --

    def test_is_engagement_scoped_owner(self):
        from authorization.scoping import is_engagement_scoped
        request = MagicMock()
        request.tenant = self.tenant
        request.user = self.owner
        request._cached_tenant_member = self.owner_member
        self.assertFalse(is_engagement_scoped(request))

    def test_is_engagement_scoped_admin(self):
        from authorization.scoping import is_engagement_scoped
        request = MagicMock()
        request.tenant = self.tenant
        request.user = self.admin
        request._cached_tenant_member = self.admin_member
        self.assertFalse(is_engagement_scoped(request))

    def test_is_engagement_scoped_analyst(self):
        from authorization.scoping import is_engagement_scoped
        request = MagicMock()
        request.tenant = self.tenant
        request.user = self.analyst
        request._cached_tenant_member = self.analyst_member
        self.assertTrue(is_engagement_scoped(request))

    def test_is_engagement_scoped_collaborator(self):
        from authorization.scoping import is_engagement_scoped
        request = MagicMock()
        request.tenant = self.tenant
        request.user = self.collaborator
        request._cached_tenant_member = self.collab_member
        self.assertTrue(is_engagement_scoped(request))
