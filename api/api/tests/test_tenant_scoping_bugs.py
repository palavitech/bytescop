"""Tests for cross-tenant data isolation bugs.

Each test proves a specific tenant-scoping gap. All tests should FAIL
on the current codebase and PASS once the corresponding fix is applied.

Bug 1: findings/serializers.py — Asset queryset not tenant-scoped
Bug 2: engagements/views.py — scope_remove leaks cross-tenant asset name
Bug 3: findings/services/attachment_reconcile.py — cleanup_for_finding missing tenant filter
Bug 4: evidence/views.py — AttachmentContentView serves cross-tenant attachments
Bug 5: api/views_invite.py — accept_invite_set_password missing tenant filter
"""

import uuid
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from accounts.models import User
from assets.models import Asset
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from clients.models import Client
from core.test_utils import login_as
from engagements.models import Engagement, EngagementStakeholder, Sow, SowAsset
from evidence.models import Attachment
from evidence.signing import sign_attachment_url
from findings.models import Finding
from findings.services.attachment_reconcile import AttachmentReconcileService
from tenancy.invite_service import generate_invite_token
from tenancy.models import InviteStatus, Tenant, TenantMember, TenantRole


STRONG_PASSWORD = 'Str0ngP@ss!99'

VALIDATE_URL = "/api/auth/accept-invite/validate/"
SET_PASSWORD_URL = "/api/auth/accept-invite/set-password/"


def _create_user(email='user@example.com', password=STRONG_PASSWORD, **kwargs):
    kwargs.setdefault('email_verified', True)
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name='Acme Corp', slug='acme-corp', **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True, **kwargs):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active, **kwargs,
    )


# ===================================================================
# Bug 1: FindingSerializer asset_id queryset is not tenant-scoped.
#
# DRF's PrimaryKeyRelatedField with Asset.objects.all() will resolve
# a cross-tenant asset PK and only reject it in validate_asset_id().
# The unscoped queryset leaks whether a cross-tenant asset exists
# (DRF returns "does not exist" vs "invalid pk" for different cases).
#
# Expected: cross-tenant asset_id should return the SAME error as a
# nonexistent UUID — both should say "does not exist" (or use a
# scoped queryset so DRF never even sees the cross-tenant asset).
# ===================================================================


class FindingSerializerCrossTenantAssetTest(APITestCase):
    """Bug 1: FindingSerializer should not accept cross-tenant asset IDs."""

    def setUp(self):
        seed_permissions()

        # Tenant A — the attacker's tenant
        self.tenant_a = _create_tenant(name='Tenant A', slug='tenant-a')
        self.groups_a = create_default_groups_for_tenant(self.tenant_a)
        self.owner_a = _create_user(email='owner-a@example.com')
        self.member_a = _create_membership(self.owner_a, self.tenant_a)
        self.client_a = Client.objects.create(tenant=self.tenant_a, name='Client A')
        self.asset_a = Asset.objects.create(
            tenant=self.tenant_a, client=self.client_a,
            name='Asset A', asset_type='host', target='10.0.0.1',
        )
        self.engagement_a = Engagement.objects.create(
            tenant=self.tenant_a, name='Eng A', client=self.client_a,
            client_name='Client A', created_by=self.owner_a,
        )
        self.sow_a = Sow.objects.create(
            engagement=self.engagement_a, title='SoW A', status='approved',
        )
        SowAsset.objects.create(sow=self.sow_a, asset=self.asset_a, in_scope=True)

        # Tenant B — the victim's tenant
        self.tenant_b = _create_tenant(name='Tenant B', slug='tenant-b')
        create_default_groups_for_tenant(self.tenant_b)
        self.owner_b = _create_user(email='owner-b@example.com')
        _create_membership(self.owner_b, self.tenant_b)
        self.client_b = Client.objects.create(tenant=self.tenant_b, name='Client B')
        self.asset_b = Asset.objects.create(
            tenant=self.tenant_b, client=self.client_b,
            name='Secret Asset B', asset_type='webapp', target='https://secret.example.com',
        )

    def test_cross_tenant_asset_id_indistinguishable_from_nonexistent(self):
        """Submitting a cross-tenant asset_id should produce the same error
        as a completely nonexistent UUID — the serializer queryset should
        not even resolve the cross-tenant asset.

        Currently FAILS: DRF resolves the cross-tenant asset (queryset is
        unscoped), then validate_asset_id raises 'Asset does not belong to
        this tenant.' — a DIFFERENT message than the 'does not exist' error
        for a nonexistent UUID. This leaks that the asset exists.
        """
        login_as(self.client, self.owner_a, self.tenant_a)

        # POST with cross-tenant asset_id (Tenant B's asset)
        cross_tenant_resp = self.client.post(
            f'/api/engagements/{self.engagement_a.pk}/findings/',
            {'title': 'Test Finding', 'severity': 'HIGH', 'asset_id': str(self.asset_b.pk)},
            format='json',
        )

        # POST with a completely nonexistent UUID
        nonexistent_resp = self.client.post(
            f'/api/engagements/{self.engagement_a.pk}/findings/',
            {'title': 'Test Finding', 'severity': 'HIGH', 'asset_id': str(uuid.uuid4())},
            format='json',
        )

        # Both should return 400 — that part works.
        self.assertEqual(cross_tenant_resp.status_code, 400)
        self.assertEqual(nonexistent_resp.status_code, 400)

        # Extract the actual error strings for asset_id
        cross_errors = [str(e) for e in cross_tenant_resp.data.get('asset_id', [])]
        nonexist_errors = [str(e) for e in nonexistent_resp.data.get('asset_id', [])]

        # A cross-tenant asset should be invisible — the error message
        # should NOT reveal that the asset exists in another tenant.
        # With the current bug, cross_errors = ['Asset does not belong to
        # this tenant.'] while nonexist_errors = ['Invalid pk "..." - object
        # does not exist.']. These different messages leak asset existence.
        for err in cross_errors:
            self.assertNotIn(
                'does not belong to this tenant', err,
                "Error message reveals the asset exists in another tenant. "
                "The queryset should be tenant-scoped so DRF never finds it.",
            )


# ===================================================================
# Bug 2: scope_remove reads asset name without tenant filter.
#
# engagements/views.py line 353:
#   Asset.objects.filter(id=asset_id).values_list('name', flat=True).first()
#
# An attacker in Tenant A can pass a Tenant B asset UUID in the
# scope_remove URL. The delete is harmless (SowAsset is scoped) but
# the audit log captures the cross-tenant asset name.
# ===================================================================


class ScopeRemoveCrossTenantAssetNameTest(APITestCase):
    """Bug 2: scope_remove should not read cross-tenant asset names."""

    def setUp(self):
        seed_permissions()

        # Tenant A
        self.tenant_a = _create_tenant(name='Tenant A', slug='tenant-a')
        self.groups_a = create_default_groups_for_tenant(self.tenant_a)
        self.owner_a = _create_user(email='owner-a@example.com')
        self.member_a = _create_membership(self.owner_a, self.tenant_a)
        self.client_a = Client.objects.create(tenant=self.tenant_a, name='Client A')
        self.engagement_a = Engagement.objects.create(
            tenant=self.tenant_a, name='Eng A', client=self.client_a,
            client_name='Client A', created_by=self.owner_a,
        )
        self.sow_a = Sow.objects.create(engagement=self.engagement_a, title='SoW A')

        # Tenant B — asset whose name should never leak
        self.tenant_b = _create_tenant(name='Tenant B', slug='tenant-b')
        create_default_groups_for_tenant(self.tenant_b)
        self.client_b = Client.objects.create(tenant=self.tenant_b, name='Client B')
        self.asset_b = Asset.objects.create(
            tenant=self.tenant_b, client=self.client_b,
            name='TopSecretAsset', asset_type='host', target='10.99.99.99',
        )

    def test_scope_remove_does_not_leak_cross_tenant_asset_name(self):
        """scope_remove with a cross-tenant asset UUID should NOT resolve
        that asset's name. The audit repr should fall back to the raw UUID.

        Currently FAILS: the unscoped query reads 'TopSecretAsset' from
        Tenant B and writes it into the audit log.
        """
        from audit.models import AuditLog

        login_as(self.client, self.owner_a, self.tenant_a)

        # Call scope_remove with Tenant B's asset UUID
        url = f'/api/engagements/{self.engagement_a.pk}/scope/{self.asset_b.pk}/'
        self.client.delete(url)

        # Check audit log — the cross-tenant asset name should NOT appear
        audit_entries = AuditLog.objects.filter(
            resource_type='scope',
            resource_id=str(self.asset_b.pk),
        )
        for entry in audit_entries:
            self.assertNotIn(
                'TopSecretAsset', entry.resource_repr or '',
                "Audit log contains cross-tenant asset name 'TopSecretAsset' — "
                "scope_remove leaks asset names from other tenants.",
            )


# ===================================================================
# Bug 3: cleanup_for_finding misses tenant filter.
#
# attachment_reconcile.py line 73:
#   Attachment.objects.filter(finding=finding)
# Should be:
#   Attachment.objects.filter(tenant=..., finding=finding)
#
# This is inconsistent with reconcile_for_finding (line 30) which
# correctly includes tenant=tenant.
# ===================================================================


class CleanupForFindingTenantScopingTest(TestCase):
    """Bug 3: cleanup_for_finding should filter by tenant."""

    def setUp(self):
        # Tenant A
        self.tenant_a = _create_tenant(name='Tenant A', slug='tenant-a')
        self.user_a = _create_user(email='a@example.com')
        self.client_a = Client.objects.create(tenant=self.tenant_a, name='Client A')
        self.engagement_a = Engagement.objects.create(
            tenant=self.tenant_a, name='Eng A', created_by=self.user_a,
        )
        self.finding_a = Finding.objects.create(
            tenant=self.tenant_a, engagement=self.engagement_a,
            title='Finding A', severity='HIGH', created_by=self.user_a,
        )

        # Tenant B
        self.tenant_b = _create_tenant(name='Tenant B', slug='tenant-b')
        self.user_b = _create_user(email='b@example.com')
        self.engagement_b = Engagement.objects.create(
            tenant=self.tenant_b, name='Eng B', created_by=self.user_b,
        )
        self.finding_b = Finding.objects.create(
            tenant=self.tenant_b, engagement=self.engagement_b,
            title='Finding B', severity='MEDIUM', created_by=self.user_b,
        )

    @override_settings(BC_STORAGE_BACKEND='local')
    @patch('findings.services.attachment_reconcile.get_attachment_storage')
    def test_cleanup_only_deletes_own_tenant_attachments(self, mock_storage):
        """If a finding somehow shared an ID with a cross-tenant attachment's
        finding FK, cleanup_for_finding should not touch it.

        We simulate this by creating an Attachment in Tenant B that
        (erroneously) has finding=finding_a. The cleanup should use
        tenant + finding to scope the deletion, protecting Tenant B's
        attachment.

        Currently FAILS: cleanup_for_finding only filters by finding,
        so it would delete Tenant B's attachment too.
        """
        mock_storage.return_value.delete.return_value = None

        # Normal attachment for Tenant A's finding
        att_a = Attachment.objects.create(
            tenant=self.tenant_a,
            finding=self.finding_a,
            engagement=self.engagement_a,
            filename='a.png',
            status='active',
        )

        # Rogue attachment: Tenant B's data with finding_a FK
        # (simulates a data integrity bug or migration issue)
        att_b = Attachment.objects.create(
            tenant=self.tenant_b,
            finding=self.finding_a,  # wrongly linked
            engagement=self.engagement_b,
            filename='b.png',
            status='active',
        )

        service = AttachmentReconcileService()
        service.cleanup_for_finding(tenant=self.tenant_a, finding=self.finding_a)

        # Tenant A's attachment should be deleted
        self.assertFalse(
            Attachment.objects.filter(pk=att_a.pk).exists(),
            "Tenant A's own attachment should be cleaned up.",
        )

        # Tenant B's attachment should NOT be deleted — it belongs to
        # a different tenant even though it's linked to the same finding.
        self.assertTrue(
            Attachment.objects.filter(pk=att_b.pk).exists(),
            "Tenant B's attachment was deleted by cleanup_for_finding — "
            "missing tenant filter allows cross-tenant deletion.",
        )


# ===================================================================
# Bug 4: AttachmentContentView serves cross-tenant attachments.
#
# evidence/views.py line 34:
#   att = Attachment.objects.get(pk=pk)
#
# The HMAC signature is per-attachment (not per-tenant), so a valid
# signed URL from Tenant A can serve an attachment that belongs to
# Tenant B. The sig is deterministic (SECRET_KEY + UUID), so any
# user who obtains the UUID and has access to the same Django
# instance can generate a valid sig.
# ===================================================================


TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01"
    b"\x01\x00\xc9\xfe\x92\xef\x00\x00\x00\x00IEND\xaeB`\x82"
)


@override_settings(BC_STORAGE_BACKEND='local')
class AttachmentContentCrossTenantTest(TestCase):
    """Bug 4: Signed attachment URL should not serve cross-tenant files.

    The HMAC signature proves the URL was generated server-side, but it
    does not bind the attachment to a specific tenant. If a signed URL
    leaks (e.g., via shared markdown), any user with the URL can access
    the file regardless of tenant.
    """

    @classmethod
    def setUpTestData(cls):
        from evidence.services.attachment_upload import AttachmentUploadService

        cls.tenant_a = Tenant.objects.create(name='A', slug='a', status='ACTIVE')
        cls.tenant_b = Tenant.objects.create(name='B', slug='b', status='ACTIVE')
        cls.user_a = User.objects.create_user(email='a@t.example.com', password='Pass1234!')
        cls.user_b = User.objects.create_user(email='b@t.example.com', password='Pass1234!')

        client_a = Client.objects.create(tenant=cls.tenant_a, name='C-A', status='ACTIVE')
        client_b = Client.objects.create(tenant=cls.tenant_b, name='C-B', status='ACTIVE')

        cls.eng_a = Engagement.objects.create(
            tenant=cls.tenant_a, name='E-A', client=client_a, created_by=cls.user_a,
        )
        cls.eng_b = Engagement.objects.create(
            tenant=cls.tenant_b, name='E-B', client=client_b, created_by=cls.user_b,
        )

        service = AttachmentUploadService()
        file_a = SimpleUploadedFile('a.png', TINY_PNG, content_type='image/png')
        cls.att_a = service.upload_image(
            tenant=cls.tenant_a, tenant_id=str(cls.tenant_a.id),
            engagement=cls.eng_a, user=cls.user_a, file_obj=file_a,
        )
        file_b = SimpleUploadedFile('b.png', TINY_PNG, content_type='image/png')
        cls.att_b = service.upload_image(
            tenant=cls.tenant_b, tenant_id=str(cls.tenant_b.id),
            engagement=cls.eng_b, user=cls.user_b, file_obj=file_b,
        )

    def test_signed_url_with_correct_tenant_serves_attachment(self):
        """A signed URL with the correct tenant_id should serve the file."""
        url = sign_attachment_url(self.att_a.pk, tenant_id=str(self.tenant_a.id))
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)

    def test_signed_url_with_wrong_tenant_rejected(self):
        """A signed URL generated for Tenant A's attachment should NOT work
        when the tid query param is swapped to Tenant B's ID.

        The HMAC includes tenant_id, so tampering with tid invalidates
        the signature.
        """
        # Generate a valid signed URL for Tenant A's attachment
        url = sign_attachment_url(self.att_a.pk, tenant_id=str(self.tenant_a.id))

        # Tamper: replace tid with Tenant B's ID
        tampered_url = url.replace(
            f"tid={self.tenant_a.id}",
            f"tid={self.tenant_b.id}",
        )
        resp = self.client.get(tampered_url)
        self.assertEqual(
            resp.status_code, 404,
            "Tampered tid should invalidate the HMAC signature.",
        )

    def test_cross_tenant_signed_url_does_not_serve_other_tenants_file(self):
        """A signed URL with Tenant A's tid should not serve Tenant B's
        attachment, even if the attachment UUID is known.

        The HMAC is computed over tenant_id:attachment_id, so a sig
        generated for (tenant_a, att_b) won't match (tenant_b, att_b).
        """
        # Sign Tenant B's attachment using Tenant A's tenant_id
        url = sign_attachment_url(self.att_b.pk, tenant_id=str(self.tenant_a.id))
        resp = self.client.get(url)

        # The sig will verify (HMAC matches tenant_a:att_b), but the
        # view filters by tid=tenant_a, and att_b belongs to tenant_b,
        # so the attachment won't be found → 404.
        self.assertNotEqual(
            resp.status_code, 200,
            "Signed URL served a cross-tenant attachment — "
            "AttachmentContentView does not enforce tenant isolation.",
        )


# ===================================================================
# Bug 5: accept_invite_set_password fetches member without tenant filter.
#
# api/views_invite.py line 158:
#   TenantMember.objects.get(pk=session["member_id"])
# Should include:
#   TenantMember.objects.get(pk=session["member_id"], tenant_id=session["tenant_id"])
#
# The session is signed, so exploitation requires forging the token,
# but defense-in-depth says the query should also verify tenant_id.
# ===================================================================


class AcceptInviteTenantScopingTest(APITestCase):
    """Bug 5: accept_invite_set_password should verify tenant_id from session."""

    def setUp(self):
        cache.clear()
        seed_permissions()

        # Tenant A
        self.tenant_a = _create_tenant(name='Tenant A', slug='tenant-a')
        self.groups_a = create_default_groups_for_tenant(self.tenant_a)
        owner_a = _create_user(email='owner-a@example.com')
        _create_membership(owner_a, self.tenant_a, role=TenantRole.OWNER)

        # Tenant B
        self.tenant_b = _create_tenant(name='Tenant B', slug='tenant-b')
        self.groups_b = create_default_groups_for_tenant(self.tenant_b)
        owner_b = _create_user(email='owner-b@example.com')
        _create_membership(owner_b, self.tenant_b, role=TenantRole.OWNER)

        # Invited user in Tenant A
        self.invited_user = User.objects.create_user(
            email='invited@example.com', password=None,
            first_name='Inv', last_name='Ited', email_verified=True,
        )
        self.invited_member_a = _create_membership(
            self.invited_user, self.tenant_a,
            role=TenantRole.MEMBER,
            invite_status=InviteStatus.PENDING,
        )
        self.raw_token = generate_invite_token(self.invited_member_a)

    def tearDown(self):
        cache.clear()

    def test_set_password_rejects_mismatched_tenant_in_session(self):
        """If the member's tenant doesn't match the tenant_id in the signed
        session, the request should fail.

        We simulate this by moving the invited member to a different tenant
        after the session was generated. The session contains the original
        tenant_id, but the member now belongs to a different tenant.

        With the fix (query includes tenant_id=session["tenant_id"]),
        the lookup will fail with DoesNotExist → 400.
        Without the fix (query uses only pk), it would succeed because
        the member PK still exists.
        """
        # Get a valid session (signed with tenant_a's ID)
        resp = self.client.post(VALIDATE_URL, {"token": self.raw_token}, format="json")
        self.assertEqual(resp.status_code, 200)
        session = resp.data["session"]

        # Move the member to tenant_b (simulates a tenant_id mismatch)
        self.invited_member_a.tenant = self.tenant_b
        self.invited_member_a.save(update_fields=["tenant"])

        # Try to set password — the session has tenant_a's ID but the
        # member now belongs to tenant_b
        response = self.client.post(SET_PASSWORD_URL, {
            "session": session,
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        }, format="json")

        # Should fail: member not found in tenant_a
        self.assertEqual(
            response.status_code, 400,
            "accept_invite_set_password should reject when member's tenant "
            "doesn't match session's tenant_id — missing tenant filter.",
        )
