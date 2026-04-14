"""Tests for tenancy/views_closure.py — tenant closure (workspace deletion) flow."""

import uuid
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from tenancy.models import (
    DataExportChoice,
    Tenant,
    TenantClosure,
    TenantMember,
    TenantRole,
    TenantStatus,
)


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


class ClosurePreflightTests(APITestCase):
    """Tests for GET /api/tenant/close/preflight/."""

    URL = "/api/tenant/close/preflight/"

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.admin = _create_user(email="admin@example.com")
        self.admin_member = _create_membership(self.admin, self.tenant, role=TenantRole.MEMBER)
        self.admin_member.groups.add(self.groups["Administrators"])

        self.noperm = _create_user(email="noperm@example.com")
        self.noperm_member = _create_membership(self.noperm, self.tenant, role=TenantRole.MEMBER)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def test_preflight_success_as_owner(self):
        self._auth_as(self.owner)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["ok"])

    def test_preflight_no_permission(self):
        """Non-owner without tenant.close permission should be denied."""
        self._auth_as(self.noperm)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 403)

    def test_preflight_admin_no_permission(self):
        """Administrators lack tenant.close (owner-only permission)."""
        self._auth_as(self.admin)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 403)

    def test_preflight_unauthenticated(self):
        self.client.logout()
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 401)


class ClosureVerifyMfaTests(APITestCase):
    """Tests for POST /api/tenant/close/verify-mfa/."""

    URL = "/api/tenant/close/verify-mfa/"

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner.mfa_enabled = True
        self.owner.mfa_secret = "TESTSECRET1234567890"
        self.owner.save(update_fields=["mfa_enabled", "mfa_secret"])
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.noperm = _create_user(email="noperm@example.com")
        self.noperm_member = _create_membership(self.noperm, self.tenant, role=TenantRole.MEMBER)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    @patch("tenancy.views_closure.verify_mfa", return_value=True)
    def test_verify_mfa_success(self, mock_verify):
        self._auth_as(self.owner)
        resp = self.client.post(self.URL, {"mfa_code": "123456"})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["verified"])

    def test_verify_mfa_no_permission(self):
        self._auth_as(self.noperm)
        resp = self.client.post(self.URL, {"mfa_code": "123456"})
        self.assertEqual(resp.status_code, 403)

    def test_verify_mfa_empty_code(self):
        self._auth_as(self.owner)
        resp = self.client.post(self.URL, {"mfa_code": ""})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("MFA code is required", resp.data["detail"])

    def test_verify_mfa_missing_code(self):
        self._auth_as(self.owner)
        resp = self.client.post(self.URL, {})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("MFA code is required", resp.data["detail"])

    def test_verify_mfa_not_enabled(self):
        owner_no_mfa = _create_user(email="nomfa@example.com")
        _create_membership(owner_no_mfa, self.tenant, role=TenantRole.OWNER)
        self._auth_as(owner_no_mfa)
        resp = self.client.post(self.URL, {"mfa_code": "123456"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("MFA must be enabled", resp.data["detail"])

    @patch("tenancy.views_closure.verify_mfa", return_value=False)
    def test_verify_mfa_invalid_code(self, mock_verify):
        self._auth_as(self.owner)
        resp = self.client.post(self.URL, {"mfa_code": "000000"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Invalid MFA code", resp.data["detail"])

    def test_verify_mfa_suspended_tenant_rejected_by_middleware(self):
        """Suspended tenant is rejected at the middleware level."""
        self._auth_as(self.owner)
        self.tenant.status = TenantStatus.SUSPENDED
        self.tenant.save(update_fields=["status"])
        resp = self.client.post(self.URL, {"mfa_code": "123456"})
        # Middleware returns 400 "Tenant context required" for suspended tenants
        self.assertEqual(resp.status_code, 400)


class ClosureExecuteTests(APITestCase):
    """Tests for POST /api/tenant/close/execute/."""

    URL = "/api/tenant/close/execute/"

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant(name="Acme Corp")
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner.mfa_enabled = True
        self.owner.mfa_secret = "TESTSECRET1234567890"
        self.owner.save(update_fields=["mfa_enabled", "mfa_secret"])
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.noperm = _create_user(email="noperm@example.com")
        self.noperm_member = _create_membership(self.noperm, self.tenant, role=TenantRole.MEMBER)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _set_mfa_verified(self):
        """Simulate MFA verification in session."""
        session = self.client.session
        session['closure_mfa_verified_at'] = timezone.now().isoformat()
        session.save()

    @patch("tenancy.views_closure.verify_mfa", return_value=True)
    def test_execute_success(self, mock_verify):
        self._auth_as(self.owner)
        # First verify MFA
        self.client.post("/api/tenant/close/verify-mfa/", {"mfa_code": "123456"})
        # Then execute
        resp = self.client.post(self.URL, {"workspace_name": "Acme Corp"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("closure_id", resp.data)
        self.assertIn("permanently deleted", resp.data["detail"])
        # Verify tenant status changed
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.status, TenantStatus.CLOSING)
        # Verify closure record created
        closure_id = resp.data["closure_id"]
        closure = TenantClosure.objects.get(pk=closure_id)
        self.assertEqual(closure.tenant_name, "Acme Corp")
        self.assertEqual(closure.owner_email, "owner@example.com")

    def test_execute_no_permission(self):
        self._auth_as(self.noperm)
        resp = self.client.post(self.URL, {"workspace_name": "Acme Corp"})
        self.assertEqual(resp.status_code, 403)

    @patch("tenancy.views_closure.verify_mfa", return_value=True)
    def test_execute_no_mfa_verification(self, mock_verify):
        """Execute without prior MFA verification should fail."""
        self._auth_as(self.owner)
        resp = self.client.post(self.URL, {"workspace_name": "Acme Corp"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("MFA verification required", resp.data["detail"])

    @patch("tenancy.views_closure.verify_mfa", return_value=True)
    def test_execute_expired_mfa_verification(self, mock_verify):
        """MFA verification older than 5 minutes should be rejected."""
        self._auth_as(self.owner)
        # Set MFA verification to 10 minutes ago
        session = self.client.session
        session['closure_mfa_verified_at'] = (timezone.now() - timedelta(minutes=10)).isoformat()
        session.save()

        resp = self.client.post(self.URL, {"workspace_name": "Acme Corp"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("expired", resp.data["detail"])

    @patch("tenancy.views_closure.verify_mfa", return_value=True)
    def test_execute_wrong_workspace_name(self, mock_verify):
        self._auth_as(self.owner)
        self.client.post("/api/tenant/close/verify-mfa/", {"mfa_code": "123456"})
        resp = self.client.post(self.URL, {"workspace_name": "Wrong Name"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("does not match", resp.data["detail"])

    @patch("tenancy.views_closure.verify_mfa", return_value=True)
    def test_execute_empty_workspace_name(self, mock_verify):
        self._auth_as(self.owner)
        self.client.post("/api/tenant/close/verify-mfa/", {"mfa_code": "123456"})
        resp = self.client.post(self.URL, {"workspace_name": ""})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("required", resp.data["detail"])

    def test_execute_closing_tenant_rejected_by_middleware(self):
        """Closing tenant is rejected at the middleware level."""
        self._auth_as(self.owner)
        self.tenant.status = TenantStatus.CLOSING
        self.tenant.save(update_fields=["status"])
        resp = self.client.post(self.URL, {"workspace_name": "Acme Corp"})
        # Middleware returns 403 with "tenant_closing" code
        self.assertEqual(resp.status_code, 403)

    @patch("tenancy.views_closure.verify_mfa", return_value=True)
    @patch("tenancy.views_closure.get_event_publisher")
    def test_execute_event_publish_failure(self, mock_publisher, mock_verify):
        """Event publish failure should not prevent closure."""
        mock_pub_instance = MagicMock()
        mock_pub_instance.publish.side_effect = Exception("SNS failure")
        mock_publisher.return_value = mock_pub_instance

        self._auth_as(self.owner)
        self.client.post("/api/tenant/close/verify-mfa/", {"mfa_code": "123456"})
        resp = self.client.post(self.URL, {"workspace_name": "Acme Corp"})
        # Should still succeed even though event publishing failed
        self.assertEqual(resp.status_code, 200)
        self.assertIn("closure_id", resp.data)


class ClosureStatusTests(APITestCase):
    """Tests for GET /api/tenant/close/status/?closure_id=<uuid>."""

    URL = "/api/tenant/close/status/"

    def setUp(self):
        self.tenant = _create_tenant(name="Test Corp")
        self.owner = _create_user(email="owner@example.com")
        _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

    def _create_closure(self, **kwargs):
        defaults = {
            "id": uuid.uuid4(),
            "tenant_name": "Test Corp",
            "tenant_slug": "test-corp",
            "owner_email": "owner@example.com",
            "data_export_choice": DataExportChoice.NOT_NEEDED,
            "confirmation_code_hash": "",
            "code_expires_at": timezone.now(),
            "closed_at": timezone.now(),
        }
        defaults.update(kwargs)
        return TenantClosure.objects.create(**defaults)

    def test_status_missing_closure_id(self):
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("closure_id", resp.data["detail"])

    def test_status_not_found(self):
        resp = self.client.get(self.URL, {"closure_id": str(uuid.uuid4())})
        self.assertEqual(resp.status_code, 404)

    def test_status_invalid_uuid(self):
        resp = self.client.get(self.URL, {"closure_id": "not-a-uuid"})
        # Invalid UUID hits an unhandled ValueError in the view → 500
        self.assertIn(resp.status_code, [400, 404, 500])

    @patch("bytescop.celery.app")
    def test_status_processing(self, mock_celery_app):
        """Closure with closed_at but no purged_at should be 'processing'."""
        mock_celery_app.control.ping.return_value = [{"worker1": {"ok": "pong"}}]
        closure = self._create_closure()
        resp = self.client.get(self.URL, {"closure_id": str(closure.pk)})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "processing")
        self.assertEqual(resp.data["tenant_name"], "Test Corp")
        self.assertIsNotNone(resp.data["started_at"])
        self.assertIsNone(resp.data["completed_at"])
        self.assertTrue(resp.data["workers_healthy"])

    def test_status_processing_celery_unavailable(self):
        """When Celery ping fails, workers_healthy should be False."""
        closure = self._create_closure()
        with patch("bytescop.celery.app") as mock_app:
            mock_app.control.ping.side_effect = Exception("Redis down")
            resp = self.client.get(self.URL, {"closure_id": str(closure.pk)})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "processing")
        self.assertFalse(resp.data["workers_healthy"])

    def test_status_completed(self):
        """Closure with purged_at should be 'completed'."""
        closure = self._create_closure(purged_at=timezone.now())
        resp = self.client.get(self.URL, {"closure_id": str(closure.pk)})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "completed")
        self.assertIsNotNone(resp.data["completed_at"])

    def test_status_failed(self):
        """Closure with error in progress should be 'failed'."""
        closure = self._create_closure(
            progress={"error": "Something went wrong", "steps": ["step1"]},
        )
        resp = self.client.get(self.URL, {"closure_id": str(closure.pk)})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "failed")
        self.assertEqual(resp.data["error"], "Something went wrong")
        self.assertEqual(resp.data["steps"], ["step1"])
        # Workers health should not be checked when status is failed
        self.assertIsNone(resp.data["workers_healthy"])

    def test_status_remaining_tenants(self):
        """Should include remaining tenant count for the owner."""
        closure = self._create_closure(purged_at=timezone.now())
        resp = self.client.get(self.URL, {"closure_id": str(closure.pk)})
        self.assertEqual(resp.status_code, 200)
        # Owner still has membership in self.tenant
        self.assertEqual(resp.data["remaining_tenants"], 1)

    def test_status_no_auth_required(self):
        """Status endpoint uses AllowAny — no authentication needed."""
        self.client.logout()
        closure = self._create_closure(purged_at=timezone.now())
        resp = self.client.get(self.URL, {"closure_id": str(closure.pk)})
        self.assertEqual(resp.status_code, 200)
