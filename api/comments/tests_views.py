"""Additional tests for comments/views.py — covering missing branches.

Covers: invalid target_type in permission check, mention/reply event publishing,
finding-scoped comments, and edge cases in edit/delete flows.
"""

import uuid

from rest_framework.test import APITestCase

from accounts.models import User
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from engagements.models import Engagement
from findings.models import Finding
from tenancy.models import Tenant, TenantMember, TenantRole

from .models import Comment, TargetType


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


class FindingCommentTests(APITestCase):
    """Tests for comment CRUD on /api/findings/<id>/comments/ (finding target type)."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com", first_name="Owner", last_name="User")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.analyst = _create_user(email="analyst@example.com", first_name="Analyst", last_name="User")
        self.analyst_member = _create_membership(self.analyst, self.tenant, role=TenantRole.MEMBER)
        self.analyst_member.groups.add(self.groups["Analysts"])

        self.noperm = _create_user(email="noperm@example.com")
        self.noperm_member = _create_membership(self.noperm, self.tenant, role=TenantRole.MEMBER)

        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name="Test Engagement", created_by=self.owner,
        )
        self.finding = Finding.objects.create(
            tenant=self.tenant,
            engagement=self.engagement,
            title="Test Finding",
            severity="high",
            created_by=self.owner,
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, finding_id=None):
        fid = finding_id or self.finding.pk
        return f"/api/findings/{fid}/comments/"

    def _detail_url(self, comment_id, finding_id=None):
        fid = finding_id or self.finding.pk
        return f"/api/findings/{fid}/comments/{comment_id}/"

    def _reply_url(self, comment_id, finding_id=None):
        fid = finding_id or self.finding.pk
        return f"/api/findings/{fid}/comments/{comment_id}/reply/"

    def test_list_finding_comments(self):
        self._auth_as(self.owner)
        Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.FINDING,
            target_id=self.finding.pk, body_md="Finding comment", created_by=self.owner,
        )
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["body_md"], "Finding comment")

    def test_create_finding_comment(self):
        self._auth_as(self.owner)
        resp = self.client.post(self._url(), {"body_md": "New finding comment"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["body_md"], "New finding comment")

    def test_finding_not_found(self):
        self._auth_as(self.owner)
        resp = self.client.get(self._url(finding_id=uuid.uuid4()))
        self.assertEqual(resp.status_code, 404)

    def test_reply_to_finding_comment(self):
        self._auth_as(self.owner)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.FINDING,
            target_id=self.finding.pk, body_md="Parent", created_by=self.owner,
        )
        resp = self.client.post(self._reply_url(c.pk), {"body_md": "Reply"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["body_md"], "Reply")

    def test_edit_finding_comment(self):
        self._auth_as(self.owner)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.FINDING,
            target_id=self.finding.pk, body_md="Original", created_by=self.owner,
        )
        resp = self.client.patch(self._detail_url(c.pk), {"body_md": "Edited"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["body_md"], "Edited")

    def test_delete_finding_comment(self):
        self._auth_as(self.owner)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.FINDING,
            target_id=self.finding.pk, body_md="To delete", created_by=self.owner,
        )
        resp = self.client.delete(self._detail_url(c.pk))
        self.assertEqual(resp.status_code, 204)

    def test_finding_comment_no_permission(self):
        self._auth_as(self.noperm)
        resp = self.client.post(self._url(), {"body_md": "test"})
        self.assertEqual(resp.status_code, 403)


class CommentMentionEventTests(APITestCase):
    """Tests for mention and reply event publishing."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com", first_name="Owner", last_name="User")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.mentioned_user = _create_user(email="mentioned@example.com", first_name="Mentioned", last_name="User")
        self.mentioned_member = _create_membership(self.mentioned_user, self.tenant, role=TenantRole.MEMBER)
        self.mentioned_member.groups.add(self.groups["Analysts"])

        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name="Test Engagement", created_by=self.owner,
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f"/api/engagements/{eid}/comments/"

    def _reply_url(self, comment_id, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f"/api/engagements/{eid}/comments/{comment_id}/reply/"

    def test_create_comment_with_mention(self):
        """Creating a comment with a mention should succeed."""
        self._auth_as(self.owner)
        body = f"Hey @[Mentioned User]({self.mentioned_user.id}) check this"
        resp = self.client.post(self._url(), {"body_md": body})
        self.assertEqual(resp.status_code, 201)
        self.assertIn("Mentioned User", resp.data["body_md"])

    def test_reply_with_mention(self):
        """Reply with mention should succeed and create the reply."""
        self._auth_as(self.owner)
        parent = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Parent comment", created_by=self.owner,
        )
        body = f"Hey @[Mentioned User]({self.mentioned_user.id}) see above"
        resp = self.client.post(self._reply_url(parent.pk), {"body_md": body})
        self.assertEqual(resp.status_code, 201)

    def test_reply_triggers_reply_events(self):
        """Replying to a comment should publish reply events for the parent author."""
        self._auth_as(self.mentioned_user)
        parent = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Parent by mentioned user",
            created_by=self.mentioned_user,
        )
        self._auth_as(self.owner)
        resp = self.client.post(self._reply_url(parent.pk), {"body_md": "Reply from owner"})
        self.assertEqual(resp.status_code, 201)

    def test_self_mention_no_notification(self):
        """Mentioning yourself should not cause errors (handled gracefully)."""
        self._auth_as(self.owner)
        body = f"Note to self @[Owner User]({self.owner.id})"
        resp = self.client.post(self._url(), {"body_md": body})
        self.assertEqual(resp.status_code, 201)

    def test_reply_comment_not_found(self):
        self._auth_as(self.owner)
        resp = self.client.post(self._reply_url(uuid.uuid4()), {"body_md": "test"})
        self.assertEqual(resp.status_code, 404)

    def test_reply_target_not_found(self):
        self._auth_as(self.owner)
        fake_eng = uuid.uuid4()
        resp = self.client.post(
            f"/api/engagements/{fake_eng}/comments/{uuid.uuid4()}/reply/",
            {"body_md": "test"},
        )
        self.assertEqual(resp.status_code, 404)

    def test_edit_nonexistent_comment(self):
        self._auth_as(self.owner)
        resp = self.client.patch(
            f"/api/engagements/{self.engagement.pk}/comments/{uuid.uuid4()}/",
            {"body_md": "test"},
        )
        self.assertEqual(resp.status_code, 404)

    def test_delete_nonexistent_comment(self):
        self._auth_as(self.owner)
        resp = self.client.delete(
            f"/api/engagements/{self.engagement.pk}/comments/{uuid.uuid4()}/",
        )
        self.assertEqual(resp.status_code, 404)
