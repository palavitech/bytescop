from django.test import TestCase, RequestFactory
from rest_framework.test import APITestCase

from accounts.models import User
from audit.models import AuditAction, AuditLog
from audit.service import compute_diff, log_audit
from audit.registry import AUDIT_REGISTRY
from authorization.seed import seed_permissions, create_default_groups_for_tenant
from core.test_utils import login_as
from engagements.models import Engagement
from tenancy.models import Tenant, TenantMember, TenantRole


STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="audit@example.com", password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Audit Corp", slug="audit-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


def _setup_tenant_with_groups():
    tenant = _create_tenant()
    seed_permissions()
    groups = create_default_groups_for_tenant(tenant)
    return tenant, groups




# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


class AuditLogModelTests(TestCase):
    def test_create_basic_entry(self):
        tenant = _create_tenant()
        user = _create_user()
        entry = AuditLog.objects.create(
            tenant=tenant,
            actor=user,
            actor_email=user.email,
            action=AuditAction.CREATE,
            resource_type="client",
            resource_id="abc-123",
            resource_repr="Client: Acme",
        )
        self.assertIsNotNone(entry.pk)
        self.assertIsNotNone(entry.timestamp)
        self.assertEqual(entry.action, "create")
        self.assertEqual(entry.resource_type, "client")

    def test_ordering_is_descending_id(self):
        tenant = _create_tenant()
        e1 = AuditLog.objects.create(
            tenant=tenant, action=AuditAction.CREATE,
            resource_type="a", actor_email="x@x.example.com",
        )
        e2 = AuditLog.objects.create(
            tenant=tenant, action=AuditAction.UPDATE,
            resource_type="b", actor_email="x@x.example.com",
        )
        entries = list(AuditLog.objects.all())
        self.assertEqual(entries[0].pk, e2.pk)
        self.assertEqual(entries[1].pk, e1.pk)

    def test_nullable_tenant_and_actor(self):
        entry = AuditLog.objects.create(
            tenant=None,
            actor=None,
            actor_email="unknown@test.example.com",
            action=AuditAction.LOGIN_FAILED,
            resource_type="auth",
        )
        self.assertIsNone(entry.tenant)
        self.assertIsNone(entry.actor)

    def test_str_representation(self):
        entry = AuditLog(action="create", resource_type="client", resource_id="123")
        self.assertEqual(str(entry), "[create] client 123")

    def test_actor_survives_user_deletion(self):
        tenant = _create_tenant()
        user = _create_user()
        entry = AuditLog.objects.create(
            tenant=tenant,
            actor=user,
            actor_email=user.email,
            action=AuditAction.CREATE,
            resource_type="client",
        )
        user.delete()
        entry.refresh_from_db()
        self.assertIsNone(entry.actor)
        self.assertEqual(entry.actor_email, "audit@example.com")


# ---------------------------------------------------------------------------
# Service tests
# ---------------------------------------------------------------------------


class ComputeDiffTests(TestCase):
    def test_basic_diff(self):
        before = {"name": "Old", "status": "active"}
        after = {"name": "New", "status": "active"}
        diff = compute_diff(before, after)
        self.assertEqual(diff, {"name": {"old": "Old", "new": "New"}})

    def test_no_changes(self):
        data = {"name": "Same", "status": "active"}
        diff = compute_diff(data, data)
        self.assertIsNone(diff)

    def test_none_inputs(self):
        self.assertIsNone(compute_diff(None, None))
        self.assertIsNone(compute_diff(None, {"a": 1}))
        self.assertIsNone(compute_diff({"a": 1}, None))

    def test_added_field(self):
        before = {"name": "Test"}
        after = {"name": "Test", "status": "active"}
        diff = compute_diff(before, after)
        self.assertEqual(diff, {"status": {"old": None, "new": "active"}})

    def test_removed_field(self):
        before = {"name": "Test", "status": "active"}
        after = {"name": "Test"}
        diff = compute_diff(before, after)
        self.assertEqual(diff, {"status": {"old": "active", "new": None}})


class LogAuditServiceTests(TestCase):
    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        self.factory = RequestFactory()

    def _make_request(self, path="/api/clients/", user=None):
        request = self.factory.post(path)
        request.tenant = self.tenant
        request.user = user or self.user
        request.request_id = "test-req-123"
        request.META["HTTP_USER_AGENT"] = "TestAgent/1.0"
        request.META["REMOTE_ADDR"] = "192.168.1.1"
        return request

    def test_creates_entry(self):
        request = self._make_request()
        entry = log_audit(
            request=request,
            action=AuditAction.CREATE,
            resource_type="client",
            resource_id="abc",
            resource_repr="Client: Acme",
            after={"name": "Acme"},
        )
        self.assertIsNotNone(entry)
        self.assertEqual(entry.action, "create")
        self.assertEqual(entry.resource_type, "client")
        self.assertEqual(entry.resource_id, "abc")
        self.assertEqual(entry.actor, self.user)
        self.assertEqual(entry.actor_email, self.user.email)
        self.assertEqual(entry.tenant, self.tenant)
        self.assertEqual(entry.ip_address, "192.168.1.1")
        self.assertEqual(entry.user_agent, "TestAgent/1.0")
        self.assertEqual(entry.request_id, "test-req-123")

    def test_ip_from_x_forwarded_for(self):
        request = self._make_request()
        request.META["HTTP_X_FORWARDED_FOR"] = "10.0.0.1, 10.0.0.2"
        entry = log_audit(
            request=request,
            action=AuditAction.READ,
            resource_type="finding",
        )
        self.assertEqual(entry.ip_address, "10.0.0.1")

    def test_computes_diff_for_update(self):
        request = self._make_request()
        entry = log_audit(
            request=request,
            action=AuditAction.UPDATE,
            resource_type="client",
            resource_id="abc",
            before={"name": "Old", "status": "active"},
            after={"name": "New", "status": "active"},
        )
        self.assertEqual(entry.diff, {"name": {"old": "Old", "new": "New"}})

    def test_unauthenticated_user(self):
        request = self._make_request()
        from django.contrib.auth.models import AnonymousUser
        request.user = AnonymousUser()
        entry = log_audit(
            request=request,
            action=AuditAction.LOGIN_FAILED,
            resource_type="auth",
        )
        self.assertIsNone(entry.actor)
        self.assertEqual(entry.actor_email, "")


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------


class AuditAPITests(APITestCase):
    def setUp(self):
        self.tenant, self.groups = _setup_tenant_with_groups()
        # Admin user (owner = root bypass)
        self.admin_user = _create_user(email="admin@audit.example.com")
        self.admin_member = _create_membership(
            self.admin_user, self.tenant, role=TenantRole.OWNER,
        )
        # Regular user (no audit.view)
        self.viewer_user = _create_user(email="viewer@audit.example.com")
        self.viewer_member = _create_membership(
            self.viewer_user, self.tenant, role=TenantRole.MEMBER,
        )
        self.viewer_member.groups.add(self.groups["Collaborators"])

        # Create some audit entries
        for i in range(5):
            AuditLog.objects.create(
                tenant=self.tenant,
                actor=self.admin_user,
                actor_email=self.admin_user.email,
                action=AuditAction.CREATE,
                resource_type="client",
                resource_id=f"client-{i}",
                resource_repr=f"Client {i}",
                ip_address="192.168.1.1",
            )
        AuditLog.objects.create(
            tenant=self.tenant,
            actor=self.admin_user,
            actor_email=self.admin_user.email,
            action=AuditAction.UPDATE,
            resource_type="engagement",
            resource_id="eng-1",
            resource_repr="Engagement 1",
            before={"status": "planned"},
            after={"status": "active"},
            diff={"status": {"old": "planned", "new": "active"}},
            ip_address="10.0.0.1",
        )

    def test_list_requires_audit_view_permission(self):
        """Non-admin user without audit.view should get 403."""
        login_as(self.client, self.viewer_user, self.tenant)
        resp = self.client.get("/api/audit/")
        self.assertEqual(resp.status_code, 403)

    def test_list_as_admin(self):
        """Admin (owner) should see all audit entries."""
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get("/api/audit/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["results"]), 6)
        self.assertEqual(data["count"], 6)
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["page_size"], 50)
        self.assertEqual(data["num_pages"], 1)

    def test_list_filter_by_action(self):
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get("/api/audit/?action=update")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["results"]), 1)
        self.assertEqual(data["results"][0]["action"], "update")

    def test_list_filter_by_resource_type(self):
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get("/api/audit/?resource_type=engagement")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["results"]), 1)

    def test_page_pagination(self):
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get("/api/audit/?page_size=3")
        data = resp.json()
        self.assertEqual(len(data["results"]), 3)
        self.assertEqual(data["count"], 6)
        self.assertEqual(data["page"], 1)
        self.assertEqual(data["page_size"], 3)
        self.assertEqual(data["num_pages"], 2)

        # Fetch page 2
        resp2 = self.client.get("/api/audit/?page_size=3&page=2")
        data2 = resp2.json()
        self.assertEqual(len(data2["results"]), 3)
        self.assertEqual(data2["page"], 2)
        self.assertEqual(data2["num_pages"], 2)

        # No overlap between pages
        ids_page1 = {r["id"] for r in data["results"]}
        ids_page2 = {r["id"] for r in data2["results"]}
        self.assertEqual(len(ids_page1 & ids_page2), 0)

    def test_page_clamping(self):
        """Requesting a page beyond num_pages should clamp to last page."""
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get("/api/audit/?page=999&page_size=3")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["page"], 2)  # 6 entries / 3 per page = 2 pages
        self.assertEqual(data["num_pages"], 2)
        self.assertEqual(len(data["results"]), 3)

    def test_detail_endpoint(self):
        entry = AuditLog.objects.filter(tenant=self.tenant, action="update").first()
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get(f"/api/audit/{entry.pk}/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["action"], "update")
        self.assertIsNotNone(data["before"])
        self.assertIsNotNone(data["after"])
        self.assertIsNotNone(data["diff"])
        self.assertIn("user_agent", data)
        self.assertIn("request_path", data)

    def test_detail_not_found(self):
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get("/api/audit/999999/")
        self.assertEqual(resp.status_code, 404)

    # -- Summary endpoint tests --

    def test_summary_as_admin(self):
        """Admin (owner) should get aggregated summary with all 5 keys."""
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get("/api/audit/summary/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # All 5 keys present
        for key in ("total", "by_action", "by_resource_type", "by_actor", "by_date"):
            self.assertIn(key, data)
        # Total matches setUp entries (5 create + 1 update = 6)
        self.assertEqual(data["total"], 6)
        self.assertEqual(data["by_action"]["create"], 5)
        self.assertEqual(data["by_action"]["update"], 1)
        self.assertEqual(data["by_resource_type"]["client"], 5)
        self.assertEqual(data["by_resource_type"]["engagement"], 1)
        # by_actor: all entries from admin_user
        self.assertEqual(len(data["by_actor"]), 1)
        self.assertEqual(data["by_actor"][0]["actor_email"], self.admin_user.email)
        self.assertEqual(data["by_actor"][0]["count"], 6)
        # by_date: at least one date bucket
        self.assertGreaterEqual(len(data["by_date"]), 1)

    def test_summary_respects_filters(self):
        """Filtering by action should narrow summary results."""
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get("/api/audit/summary/?action=update")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total"], 1)
        self.assertEqual(list(data["by_action"].keys()), ["update"])
        self.assertEqual(data["by_action"]["update"], 1)

    def test_summary_requires_permission(self):
        """Non-admin user without audit.view should get 403."""
        login_as(self.client, self.viewer_user, self.tenant)
        resp = self.client.get("/api/audit/summary/")
        self.assertEqual(resp.status_code, 403)

    def test_tenant_isolation(self):
        """Entries from another tenant should not be visible."""
        other_tenant = Tenant.objects.create(name="Other", slug="other-corp")
        AuditLog.objects.create(
            tenant=other_tenant,
            action=AuditAction.CREATE,
            resource_type="client",
            actor_email="other@test.example.com",
        )
        login_as(self.client, self.admin_user, self.tenant)
        resp = self.client.get("/api/audit/")
        data = resp.json()
        # Should only see our tenant's 6 entries
        self.assertEqual(len(data["results"]), 6)


class AuditIntegrationTests(APITestCase):
    """End-to-end: CUD a client via API, verify audit log entries."""

    def setUp(self):
        self.tenant, self.groups = _setup_tenant_with_groups()
        self.user = _create_user(email="e2e@audit.example.com")
        self.member = _create_membership(
            self.user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.user, self.tenant)

    def test_client_crud_creates_audit_entries(self):
        # Create
        resp = self.client.post(
            "/api/clients/",
            {"name": "Audit Client", "status": "active"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        client_id = resp.json()["id"]

        create_logs = AuditLog.objects.filter(
            tenant=self.tenant, action="create", resource_type="client",
        )
        self.assertEqual(create_logs.count(), 1)
        self.assertIsNotNone(create_logs.first().after)

        # Update
        resp = self.client.patch(
            f"/api/clients/{client_id}/",
            {"name": "Renamed Client"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        update_logs = AuditLog.objects.filter(
            tenant=self.tenant, action="update", resource_type="client",
        )
        self.assertEqual(update_logs.count(), 1)
        log_entry = update_logs.first()
        self.assertIsNotNone(log_entry.before)
        self.assertIsNotNone(log_entry.after)
        self.assertIn("name", log_entry.diff)

        # Delete
        resp = self.client.delete(
            f"/api/clients/{client_id}/",
        )
        self.assertEqual(resp.status_code, 204)

        delete_logs = AuditLog.objects.filter(
            tenant=self.tenant, action="delete", resource_type="client",
        )
        self.assertEqual(delete_logs.count(), 1)
        self.assertIsNotNone(delete_logs.first().before)


# ---------------------------------------------------------------------------
# AuditedModelViewSet tests
# ---------------------------------------------------------------------------


class AuditedModelViewSetTests(APITestCase):
    """Test that AuditedModelViewSet auto-generates correct audit entries."""

    def setUp(self):
        self.tenant, self.groups = _setup_tenant_with_groups()
        self.user = _create_user(email="viewset@audit.example.com")
        self.member = _create_membership(
            self.user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.user, self.tenant)

    def _api(self, method, url, data=None):
        fn = getattr(self.client, method)
        kwargs = {}
        if data is not None:
            return fn(url, data, format="json", **kwargs)
        return fn(url, **kwargs)

    # --- Client (uses AuditedModelViewSet) ---

    def test_create_generates_audit_with_after(self):
        resp = self._api("post", "/api/clients/", {"name": "New Client", "status": "active"})
        self.assertEqual(resp.status_code, 201)
        log = AuditLog.objects.get(
            tenant=self.tenant, action="create", resource_type="client",
        )
        self.assertIsNotNone(log.after)
        self.assertEqual(log.after["name"], "New Client")
        self.assertEqual(log.resource_repr, "New Client")
        self.assertEqual(log.resource_id, resp.json()["id"])

    def test_update_generates_audit_with_before_after_diff(self):
        resp = self._api("post", "/api/clients/", {"name": "Original", "status": "active"})
        cid = resp.json()["id"]

        resp = self._api("patch", f"/api/clients/{cid}/", {"name": "Updated"})
        self.assertEqual(resp.status_code, 200)

        log = AuditLog.objects.get(
            tenant=self.tenant, action="update", resource_type="client",
        )
        self.assertEqual(log.before["name"], "Original")
        self.assertEqual(log.after["name"], "Updated")
        self.assertIn("name", log.diff)
        self.assertEqual(log.diff["name"]["old"], "Original")
        self.assertEqual(log.diff["name"]["new"], "Updated")

    def test_destroy_generates_audit_with_before(self):
        resp = self._api("post", "/api/clients/", {"name": "Doomed", "status": "active"})
        cid = resp.json()["id"]

        resp = self._api("delete", f"/api/clients/{cid}/")
        self.assertEqual(resp.status_code, 204)

        log = AuditLog.objects.get(
            tenant=self.tenant, action="delete", resource_type="client",
        )
        self.assertIsNotNone(log.before)
        self.assertEqual(log.before["name"], "Doomed")
        self.assertEqual(log.resource_repr, "Doomed")
        self.assertIsNone(log.after)

    def test_failed_create_does_not_audit(self):
        """Missing required field → 400, no audit entry."""
        resp = self._api("post", "/api/clients/", {})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(
            AuditLog.objects.filter(resource_type="client").count(), 0,
        )

    # --- Asset (also uses AuditedModelViewSet) ---

    def test_asset_crud_generates_audit(self):
        from clients.models import Client
        c = Client.objects.create(tenant=self.tenant, name="TestCo")

        resp = self._api("post", "/api/assets/", {
            "name": "prod-web", "asset_type": "webapp", "client": str(c.pk),
        })
        self.assertEqual(resp.status_code, 201)
        aid = resp.json()["id"]

        self.assertEqual(
            AuditLog.objects.filter(resource_type="asset", action="create").count(), 1,
        )

        self._api("patch", f"/api/assets/{aid}/", {"name": "prod-web-v2"})
        self.assertEqual(
            AuditLog.objects.filter(resource_type="asset", action="update").count(), 1,
        )

        self._api("delete", f"/api/assets/{aid}/")
        self.assertEqual(
            AuditLog.objects.filter(resource_type="asset", action="delete").count(), 1,
        )

    # --- Engagement (also uses AuditedModelViewSet) ---

    def test_engagement_crud_generates_audit(self):
        resp = self._api("post", "/api/engagements/", {
            "name": "Pentest Q1", "status": "planned",
        })
        self.assertEqual(resp.status_code, 201)
        eid = resp.json()["id"]

        self.assertEqual(
            AuditLog.objects.filter(resource_type="engagement", action="create").count(), 1,
        )

        self._api("patch", f"/api/engagements/{eid}/", {"name": "Pentest Q2"})
        log = AuditLog.objects.get(resource_type="engagement", action="update")
        self.assertEqual(log.before["name"], "Pentest Q1")
        self.assertEqual(log.after["name"], "Pentest Q2")

        self._api("delete", f"/api/engagements/{eid}/")
        self.assertEqual(
            AuditLog.objects.filter(resource_type="engagement", action="delete").count(), 1,
        )


# ---------------------------------------------------------------------------
# @audited decorator tests
# ---------------------------------------------------------------------------


class AuditDecoratorTests(APITestCase):
    """Test that @audited decorator generates audit entries for nested actions."""

    def setUp(self):
        self.tenant, self.groups = _setup_tenant_with_groups()
        self.user = _create_user(email="decorator@audit.example.com")
        self.member = _create_membership(
            self.user, self.tenant, role=TenantRole.OWNER,
        )
        login_as(self.client, self.user, self.tenant)

        from clients.models import Client
        self.org = Client.objects.create(tenant=self.tenant, name="DecoCo")

        from assets.models import Asset
        self.asset = Asset.objects.create(
            tenant=self.tenant, client=self.org, name="web-app",
            asset_type="webapp",
        )

        resp = self.client.post(
            "/api/engagements/",
            {"name": "Deco Eng", "status": "active", "client_id": str(self.org.pk)},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.eng_id = resp.json()["id"]
        # Clear audit logs from setup
        AuditLog.objects.all().delete()

    def _api(self, method, url, data=None):
        fn = getattr(self.client, method)
        kwargs = {}
        if data is not None:
            return fn(url, data, format="json", **kwargs)
        return fn(url, **kwargs)

    def test_sow_patch_creates_audit(self):
        resp = self._api("patch", f"/api/engagements/{self.eng_id}/sow/", {
            "title": "Updated SoW",
        })
        self.assertEqual(resp.status_code, 200)
        log = AuditLog.objects.get(resource_type="sow", action="update")
        self.assertIsNotNone(log.before)
        self.assertIsNotNone(log.after)
        self.assertIn("SoW:", log.resource_repr)

    def test_sow_delete_creates_audit(self):
        resp = self._api("delete", f"/api/engagements/{self.eng_id}/sow/")
        self.assertEqual(resp.status_code, 204)
        log = AuditLog.objects.get(resource_type="sow", action="delete")
        self.assertIsNotNone(log.before)
        self.assertIn("SoW:", log.resource_repr)

    def test_sow_post_creates_audit(self):
        # Delete existing SoW first
        self._api("delete", f"/api/engagements/{self.eng_id}/sow/")
        AuditLog.objects.all().delete()

        resp = self._api("post", f"/api/engagements/{self.eng_id}/sow/", {
            "title": "New SoW", "status": "draft",
        })
        self.assertEqual(resp.status_code, 201)
        log = AuditLog.objects.get(resource_type="sow", action="create")
        self.assertIsNotNone(log.after)
        self.assertIn("SoW:", log.resource_repr)

    def test_scope_add_creates_audit(self):
        resp = self._api("post", f"/api/engagements/{self.eng_id}/scope/", {
            "asset_id": str(self.asset.pk),
        })
        self.assertEqual(resp.status_code, 201)
        log = AuditLog.objects.get(resource_type="scope", action="create")
        self.assertIn("Scope add:", log.resource_repr)

    def test_scope_remove_creates_audit(self):
        # Add scope first
        self._api("post", f"/api/engagements/{self.eng_id}/scope/", {
            "asset_id": str(self.asset.pk),
        })
        AuditLog.objects.all().delete()

        resp = self._api("delete", f"/api/engagements/{self.eng_id}/scope/{self.asset.pk}/")
        self.assertEqual(resp.status_code, 204)
        log = AuditLog.objects.get(resource_type="scope", action="delete")
        self.assertIn("Scope remove:", log.resource_repr)
        self.assertEqual(log.resource_id, str(self.asset.pk))

    def test_finding_create_creates_audit(self):
        # Add asset to scope, then approve SoW so findings can be created
        self._api("post", f"/api/engagements/{self.eng_id}/scope/", {
            "asset_id": str(self.asset.pk),
        })
        self._api("patch", f"/api/engagements/{self.eng_id}/sow/", {
            "status": "approved",
        })
        AuditLog.objects.all().delete()

        resp = self._api("post", f"/api/engagements/{self.eng_id}/findings/", {
            "title": "XSS in login", "severity": "high",
            "asset_id": str(self.asset.pk),
        })
        self.assertEqual(resp.status_code, 201)
        log = AuditLog.objects.get(resource_type="finding", action="create")
        self.assertIsNotNone(log.after)
        self.assertIn("Finding:", log.resource_repr)

    def test_finding_update_creates_audit(self):
        # Setup: add scope, approve SoW, create finding
        self._api("post", f"/api/engagements/{self.eng_id}/scope/", {
            "asset_id": str(self.asset.pk),
        })
        self._api("patch", f"/api/engagements/{self.eng_id}/sow/", {
            "status": "approved",
        })
        resp = self._api("post", f"/api/engagements/{self.eng_id}/findings/", {
            "title": "SQLi", "severity": "critical",
            "asset_id": str(self.asset.pk),
        })
        fid = resp.json()["id"]
        AuditLog.objects.all().delete()

        resp = self._api("patch", f"/api/engagements/{self.eng_id}/findings/{fid}/", {
            "severity": "high",
        })
        self.assertEqual(resp.status_code, 200)
        log = AuditLog.objects.get(resource_type="finding", action="update")
        self.assertIsNotNone(log.before)
        self.assertIsNotNone(log.after)
        self.assertIn("Finding:", log.resource_repr)

    def test_finding_destroy_creates_audit(self):
        # Setup: add scope, approve SoW, create finding
        self._api("post", f"/api/engagements/{self.eng_id}/scope/", {
            "asset_id": str(self.asset.pk),
        })
        self._api("patch", f"/api/engagements/{self.eng_id}/sow/", {
            "status": "approved",
        })
        resp = self._api("post", f"/api/engagements/{self.eng_id}/findings/", {
            "title": "IDOR", "severity": "medium",
            "asset_id": str(self.asset.pk),
        })
        fid = resp.json()["id"]
        AuditLog.objects.all().delete()

        resp = self._api("delete", f"/api/engagements/{self.eng_id}/findings/{fid}/")
        self.assertEqual(resp.status_code, 204)
        log = AuditLog.objects.get(resource_type="finding", action="delete")
        self.assertIsNotNone(log.before)
        self.assertIn("Finding:", log.resource_repr)
        self.assertEqual(log.resource_id, str(fid))

    def test_failed_nested_action_does_not_audit(self):
        """409 on duplicate scope add → no audit entry."""
        self._api("post", f"/api/engagements/{self.eng_id}/scope/", {
            "asset_id": str(self.asset.pk),
        })
        AuditLog.objects.all().delete()

        resp = self._api("post", f"/api/engagements/{self.eng_id}/scope/", {
            "asset_id": str(self.asset.pk),
        })
        self.assertEqual(resp.status_code, 409)
        self.assertEqual(AuditLog.objects.filter(resource_type="scope").count(), 0)


# ---------------------------------------------------------------------------
# Registry tests
# ---------------------------------------------------------------------------


class AuditRegistryTests(TestCase):
    """Verify the audit registry is well-formed and non-empty."""

    def test_registry_is_non_empty(self):
        self.assertGreater(len(AUDIT_REGISTRY), 0)

    def test_all_entries_are_tuples(self):
        for entry in AUDIT_REGISTRY:
            self.assertIsInstance(entry, tuple)
            self.assertEqual(len(entry), 2)

    def test_all_actions_are_valid(self):
        valid_actions = {choice[0] for choice in AuditAction.choices}
        for resource_type, action in AUDIT_REGISTRY:
            self.assertIn(action, valid_actions, f"Invalid action {action} for {resource_type}")

    def test_expected_resource_types_present(self):
        resource_types = {rt for rt, _ in AUDIT_REGISTRY}
        for expected in ("client", "asset", "engagement", "sow", "scope", "finding", "attachment", "group", "member", "auth"):
            self.assertIn(expected, resource_types, f"Missing resource type: {expected}")

    def test_crud_resources_have_full_coverage(self):
        """Resources that should have full CUD coverage."""
        crud_resources = ("client", "asset", "engagement")
        for rt in crud_resources:
            actions = {a for r, a in AUDIT_REGISTRY if r == rt}
            for expected_action in (AuditAction.CREATE, AuditAction.UPDATE, AuditAction.DELETE):
                self.assertIn(
                    expected_action, actions,
                    f"{rt} missing {expected_action} in registry",
                )


# ---------------------------------------------------------------------------
# Summary chart tests
# ---------------------------------------------------------------------------


class AuditSummaryChartsTests(APITestCase):
    """Test the 5 new chart data fields in the audit summary endpoint."""

    def setUp(self):
        self.tenant, self.groups = _setup_tenant_with_groups()
        self.user = _create_user(email="admin@charts.example.com")
        self.member = _create_membership(self.user, self.tenant, role=TenantRole.OWNER)

        self.user2 = _create_user(email="analyst@charts.example.com")
        _create_membership(self.user2, self.tenant, role=TenantRole.MEMBER)

        # Create engagements for name lookup
        self.eng1 = Engagement.objects.create(
            tenant=self.tenant, name="Pentest Q1", status="active",
            created_by=self.user,
        )
        self.eng2 = Engagement.objects.create(
            tenant=self.tenant, name="Pentest Q2", status="planned",
            created_by=self.user,
        )

        eng1_id = str(self.eng1.pk)
        eng2_id = str(self.eng2.pk)

        # Chart 1 data: finding creates under engagements
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user, actor_email=self.user.email,
            action='create', resource_type='finding', resource_id='f1',
            request_path=f'/api/engagements/{eng1_id}/findings/',
            ip_address='10.0.0.1',
        )
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user, actor_email=self.user.email,
            action='create', resource_type='finding', resource_id='f2',
            request_path=f'/api/engagements/{eng1_id}/findings/',
            ip_address='10.0.0.1',
        )
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user2, actor_email=self.user2.email,
            action='create', resource_type='finding', resource_id='f3',
            request_path=f'/api/engagements/{eng2_id}/findings/',
            ip_address='10.0.0.2',
        )

        # Chart 2 data: disruptive deletes
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user, actor_email=self.user.email,
            action='delete', resource_type='finding', resource_id='f4',
            request_path=f'/api/engagements/{eng1_id}/findings/f4/',
            ip_address='10.0.0.1',
        )
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user2, actor_email=self.user2.email,
            action='delete', resource_type='scope', resource_id='s1',
            request_path=f'/api/engagements/{eng2_id}/scope/s1/',
            ip_address='10.0.0.2',
        )
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user, actor_email=self.user.email,
            action='delete', resource_type='sow', resource_id='sow1',
            request_path=f'/api/engagements/{eng1_id}/sow/',
            ip_address='10.0.0.1',
        )

        # Chart 3 data: engagement actions
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user, actor_email=self.user.email,
            action='create', resource_type='engagement', resource_id=eng1_id,
            ip_address='10.0.0.1',
        )
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user, actor_email=self.user.email,
            action='update', resource_type='engagement', resource_id=eng1_id,
            ip_address='10.0.0.1',
        )
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user2, actor_email=self.user2.email,
            action='create', resource_type='engagement', resource_id=eng2_id,
            ip_address='10.0.0.2',
        )

        # Chart 4 data: finding actions (update + delete beyond what's above)
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user, actor_email=self.user.email,
            action='update', resource_type='finding', resource_id='f1',
            request_path=f'/api/engagements/{eng1_id}/findings/f1/',
            ip_address='10.0.0.1',
        )

        # Chart 5: extra entries with different IPs
        AuditLog.objects.create(
            tenant=self.tenant, actor=self.user, actor_email=self.user.email,
            action='read', resource_type='client', resource_id='c1',
            ip_address='10.0.0.3',
        )

        login_as(self.client, self.user, self.tenant)

    def _get_summary(self, params=''):
        return self.client.get(
            f'/api/audit/summary/{params}',
        )

    def test_findings_by_user_eng(self):
        resp = self._get_summary()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()['findings_by_user_eng']

        self.assertIn('actors', data)
        self.assertIn('engagements', data)
        self.assertIn('matrix', data)

        # 2 actors created findings
        self.assertEqual(len(data['actors']), 2)
        self.assertIn(self.user.email, data['actors'])
        self.assertIn(self.user2.email, data['actors'])

        # 2 engagements
        self.assertEqual(len(data['engagements']), 2)
        self.assertIn('Pentest Q1', data['engagements'])
        self.assertIn('Pentest Q2', data['engagements'])

        # Total finding creates = 3
        total = sum(c for row in data['matrix'] for c in row)
        self.assertEqual(total, 3)

    def test_disruptive_by_user_eng(self):
        resp = self._get_summary()
        data = resp.json()['disruptive_by_user_eng']

        self.assertIn('actors', data)
        self.assertIn('engagements', data)
        self.assertIn('matrix', data)

        # Only delete actions on finding/scope/sow should be included
        total = sum(c for row in data['matrix'] for c in row)
        self.assertEqual(total, 3)

        # Both users have disruptive actions
        self.assertEqual(len(data['actors']), 2)

    def test_engagement_actions_by_user(self):
        resp = self._get_summary()
        data = resp.json()['engagement_actions_by_user']

        self.assertIn('actors', data)
        self.assertIn('actions', data)
        self.assertIn('matrix', data)

        # 2 actors with engagement actions
        self.assertEqual(len(data['actors']), 2)
        # create and update actions
        self.assertIn('create', data['actions'])
        self.assertIn('update', data['actions'])

        # Total engagement actions = 3
        total = sum(c for row in data['matrix'] for c in row)
        self.assertEqual(total, 3)

    def test_finding_actions_by_user(self):
        resp = self._get_summary()
        data = resp.json()['finding_actions_by_user']

        self.assertIn('actors', data)
        self.assertIn('actions', data)
        self.assertIn('matrix', data)

        # Finding actions: 3 creates + 1 delete + 1 update = 5
        total = sum(c for row in data['matrix'] for c in row)
        self.assertEqual(total, 5)

        # Should have create, delete, update
        self.assertIn('create', data['actions'])
        self.assertIn('delete', data['actions'])
        self.assertIn('update', data['actions'])

    def test_actions_by_ip(self):
        resp = self._get_summary()
        data = resp.json()['actions_by_ip']

        self.assertIn('ips', data)
        self.assertIn('counts', data)
        self.assertEqual(len(data['ips']), len(data['counts']))

        # 3 distinct IPs
        self.assertEqual(len(data['ips']), 3)
        # Ordered by count desc — 10.0.0.1 has the most
        self.assertEqual(data['ips'][0], '10.0.0.1')
        self.assertGreaterEqual(data['counts'][0], data['counts'][1])

    def test_charts_respect_filters(self):
        """Filtering by action=create should narrow chart results."""
        resp = self._get_summary('?action=create')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        # disruptive chart should be empty (no deletes in filtered set)
        disruptive = data['disruptive_by_user_eng']
        self.assertEqual(disruptive['actors'], [])
        self.assertEqual(disruptive['engagements'], [])
        self.assertEqual(disruptive['matrix'], [])

        # findings_by_user_eng should still have data (finding creates exist)
        self.assertGreater(len(data['findings_by_user_eng']['actors']), 0)

    def test_charts_empty_data(self):
        """When no entries match, all chart fields return empty arrays."""
        resp = self._get_summary('?resource_type=nonexistent')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        for key in ('findings_by_user_eng', 'disruptive_by_user_eng'):
            self.assertEqual(data[key]['actors'], [])
            self.assertEqual(data[key]['engagements'], [])
            self.assertEqual(data[key]['matrix'], [])

        for key in ('engagement_actions_by_user', 'finding_actions_by_user'):
            self.assertEqual(data[key]['actors'], [])
            self.assertEqual(data[key]['actions'], [])
            self.assertEqual(data[key]['matrix'], [])

        self.assertEqual(data['actions_by_ip']['ips'], [])
        self.assertEqual(data['actions_by_ip']['counts'], [])

    def test_filter_by_engagement(self):
        """Filtering by engagement UUID narrows list and summary to matching paths."""
        eng1_id = str(self.eng1.pk)
        login_as(self.client, self.user, self.tenant)

        # Count entries that have eng1 in their request_path (from setUp)
        expected_count = AuditLog.objects.filter(
            tenant=self.tenant,
            request_path__contains=f'/api/engagements/{eng1_id}/',
        ).count()
        self.assertGreater(expected_count, 0)

        # List endpoint
        resp = self.client.get(f'/api/audit/?engagement={eng1_id}')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['count'], expected_count)

        # Summary endpoint
        resp = self._get_summary(f'?engagement={eng1_id}')
        self.assertEqual(resp.status_code, 200)
        summary = resp.json()
        self.assertEqual(summary['total'], expected_count)

    def test_filter_by_ip_address(self):
        """Filtering by ip_address returns only matching entries."""
        login_as(self.client, self.user, self.tenant)

        # List endpoint
        resp = self.client.get('/api/audit/?ip_address=10.0.0.2')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        for entry in data['results']:
            self.assertEqual(entry['ip_address'], '10.0.0.2')
        self.assertGreater(len(data['results']), 0)

        # Summary endpoint
        resp = self._get_summary('?ip_address=10.0.0.2')
        self.assertEqual(resp.status_code, 200)
        summary = resp.json()
        self.assertGreater(summary['total'], 0)

    def test_eng_id_map_in_summary(self):
        """Summary response includes eng_id_map with name→ID mapping."""
        resp = self._get_summary()
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertIn('eng_id_map', data)
        eng_id_map = data['eng_id_map']

        # Both engagements should be in the map
        self.assertIn('Pentest Q1', eng_id_map)
        self.assertIn('Pentest Q2', eng_id_map)
        self.assertEqual(eng_id_map['Pentest Q1'], str(self.eng1.pk))
        self.assertEqual(eng_id_map['Pentest Q2'], str(self.eng2.pk))
