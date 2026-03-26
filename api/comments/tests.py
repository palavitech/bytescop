import uuid

from rest_framework.test import APITestCase

from accounts.models import User
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from clients.models import Client
from engagements.models import Engagement
from tenancy.models import Tenant, TenantMember, TenantRole

from .mentions import extract_mention_user_ids, validate_mentions
from .models import Comment, TargetType


STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


class CommentEndpointTests(APITestCase):
    """Tests for comment CRUD endpoints on /api/engagements/<id>/comments/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        # Owner (bypasses permission checks)
        self.owner = _create_user(email="owner@example.com", first_name="Owner", last_name="User")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        # Administrator (has comment.create, comment.edit, comment.delete)
        self.admin = _create_user(email="admin@example.com", first_name="Admin", last_name="User")
        self.admin_member = _create_membership(self.admin, self.tenant, role=TenantRole.MEMBER)
        self.admin_member.groups.add(self.groups["Administrators"])

        # Analyst (has comment.create, comment.edit but NOT comment.delete)
        self.tester = _create_user(email="tester@example.com", first_name="Pen", last_name="Tester")
        self.tester_member = _create_membership(self.tester, self.tenant, role=TenantRole.MEMBER)
        self.tester_member.groups.add(self.groups["Analysts"])

        # Collaborator (has comment.create, comment.edit but NOT comment.delete)
        self.viewer = _create_user(email="viewer@example.com", first_name="View", last_name="Only")
        self.viewer_member = _create_membership(self.viewer, self.tenant, role=TenantRole.MEMBER)
        self.viewer_member.groups.add(self.groups["Collaborators"])

        # No-perm user (no groups at all)
        self.noperm = _create_user(email="noperm@example.com")
        self.noperm_member = _create_membership(self.noperm, self.tenant, role=TenantRole.MEMBER)

        # Engagement
        self.engagement = Engagement.objects.create(
            tenant=self.tenant, name="Test Engagement", created_by=self.owner,
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f"/api/engagements/{eid}/comments/"

    def _detail_url(self, comment_id, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f"/api/engagements/{eid}/comments/{comment_id}/"

    def _reply_url(self, comment_id, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f"/api/engagements/{eid}/comments/{comment_id}/reply/"

    # -------------------------------------------------------------------
    # LIST
    # -------------------------------------------------------------------

    def test_list_empty(self):
        self._auth_as(self.owner)
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, [])

    def test_list_with_comments_and_replies(self):
        self._auth_as(self.owner)
        # Create top-level comment
        c1 = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Hello", created_by=self.owner,
        )
        # Create reply
        Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Reply", created_by=self.tester,
            parent=c1,
        )
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)  # only top-level
        self.assertEqual(len(resp.data[0]["replies"]), 1)
        self.assertEqual(resp.data[0]["body_md"], "Hello")
        self.assertEqual(resp.data[0]["replies"][0]["body_md"], "Reply")

    def test_list_returns_is_own_flag(self):
        self._auth_as(self.owner)
        Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Mine", created_by=self.owner,
        )
        Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Not mine", created_by=self.tester,
        )
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)
        # First comment (chronological order) is owner's
        self.assertTrue(resp.data[0]["is_own"])
        self.assertFalse(resp.data[1]["is_own"])

    def test_list_requires_engagement_view_permission(self):
        self._auth_as(self.noperm)
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 403)

    def test_list_target_not_found(self):
        self._auth_as(self.owner)
        resp = self.client.get(self._url(engagement_id=uuid.uuid4()))
        self.assertEqual(resp.status_code, 404)

    # -------------------------------------------------------------------
    # CREATE
    # -------------------------------------------------------------------

    def test_create_comment(self):
        self._auth_as(self.owner)
        resp = self.client.post(self._url(), {"body_md": "New comment"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["body_md"], "New comment")
        self.assertEqual(resp.data["is_own"], True)
        self.assertIsNone(resp.data["edited_at"])
        self.assertEqual(resp.data["replies"], [])
        self.assertEqual(Comment.objects.count(), 1)

    def test_create_requires_comment_create_permission(self):
        self._auth_as(self.noperm)
        resp = self.client.post(self._url(), {"body_md": "test"})
        self.assertEqual(resp.status_code, 403)

    def test_create_requires_engagement_view_permission(self):
        """User with comment.create but no engagement.view should be denied."""
        # Create a user with only comment permissions but no engagement perms
        from authorization.models import Permission, TenantGroup
        comment_user = _create_user(email="commentonly@example.com")
        comment_member = _create_membership(comment_user, self.tenant, role=TenantRole.MEMBER)
        group = TenantGroup.objects.create(
            tenant=self.tenant, name="Comment Only", description="test",
        )
        group.permissions.add(Permission.objects.get(codename="comment.create"))
        comment_member.groups.add(group)

        self._auth_as(comment_user)
        resp = self.client.post(self._url(), {"body_md": "test"})
        self.assertEqual(resp.status_code, 403)

    def test_create_missing_body(self):
        self._auth_as(self.owner)
        resp = self.client.post(self._url(), {})
        self.assertEqual(resp.status_code, 400)

    def test_create_target_not_found(self):
        self._auth_as(self.owner)
        resp = self.client.post(self._url(engagement_id=uuid.uuid4()), {"body_md": "test"})
        self.assertEqual(resp.status_code, 404)

    def test_viewer_can_create_comment(self):
        """Collaborators have comment.create and engagement.view."""
        self._auth_as(self.viewer)
        resp = self.client.post(self._url(), {"body_md": "Viewer comment"})
        self.assertEqual(resp.status_code, 201)

    # -------------------------------------------------------------------
    # REPLY
    # -------------------------------------------------------------------

    def test_reply_to_comment(self):
        self._auth_as(self.owner)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Parent", created_by=self.owner,
        )
        resp = self.client.post(self._reply_url(c.pk), {"body_md": "Reply text"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["body_md"], "Reply text")
        self.assertEqual(Comment.objects.count(), 2)

    def test_reply_to_reply_rejected(self):
        """Enforce 1-level threading: cannot reply to a reply."""
        self._auth_as(self.owner)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Parent", created_by=self.owner,
        )
        reply = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Reply", created_by=self.owner,
            parent=c,
        )
        resp = self.client.post(self._reply_url(reply.pk), {"body_md": "Nested reply"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("one level", resp.data["detail"])

    def test_reply_to_nonexistent_comment(self):
        self._auth_as(self.owner)
        resp = self.client.post(self._reply_url(uuid.uuid4()), {"body_md": "test"})
        self.assertEqual(resp.status_code, 404)

    # -------------------------------------------------------------------
    # EDIT
    # -------------------------------------------------------------------

    def test_edit_own_comment(self):
        self._auth_as(self.tester)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Original", created_by=self.tester,
        )
        resp = self.client.patch(self._detail_url(c.pk), {"body_md": "Edited"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["body_md"], "Edited")
        self.assertIsNotNone(resp.data["edited_at"])

    def test_edit_other_users_comment_rejected(self):
        self._auth_as(self.tester)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Owner's comment", created_by=self.owner,
        )
        resp = self.client.patch(self._detail_url(c.pk), {"body_md": "Hacked"})
        self.assertEqual(resp.status_code, 403)
        self.assertIn("your own", resp.data["detail"])

    def test_edit_nonexistent_comment(self):
        self._auth_as(self.owner)
        resp = self.client.patch(self._detail_url(uuid.uuid4()), {"body_md": "test"})
        self.assertEqual(resp.status_code, 404)

    def test_edit_requires_comment_edit_permission(self):
        self._auth_as(self.noperm)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="test", created_by=self.noperm,
        )
        resp = self.client.patch(self._detail_url(c.pk), {"body_md": "edited"})
        self.assertEqual(resp.status_code, 403)

    # -------------------------------------------------------------------
    # DELETE
    # -------------------------------------------------------------------

    def test_delete_own_comment(self):
        """Any commenter can delete their own comment."""
        self._auth_as(self.viewer)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="My comment", created_by=self.viewer,
        )
        resp = self.client.delete(self._detail_url(c.pk))
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(Comment.objects.count(), 0)

    def test_delete_other_users_comment_with_permission(self):
        """User with comment.delete can delete anyone's comment."""
        self._auth_as(self.admin)  # Administrator has comment.delete
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Owner's comment", created_by=self.owner,
        )
        resp = self.client.delete(self._detail_url(c.pk))
        self.assertEqual(resp.status_code, 204)

    def test_analyst_cannot_delete_other_users_comment(self):
        """Analyst lacks comment.delete — cannot delete others' comments."""
        self._auth_as(self.tester)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Owner's comment", created_by=self.owner,
        )
        resp = self.client.delete(self._detail_url(c.pk))
        self.assertEqual(resp.status_code, 403)

    def test_delete_other_users_comment_without_permission(self):
        """Collaborator lacks comment.delete — cannot delete others' comments."""
        self._auth_as(self.viewer)
        c = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Tester's comment", created_by=self.tester,
        )
        resp = self.client.delete(self._detail_url(c.pk))
        self.assertEqual(resp.status_code, 403)

    def test_delete_cascades_replies(self):
        """Deleting a parent comment hard-deletes its replies."""
        self._auth_as(self.owner)
        parent = Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Parent", created_by=self.owner,
        )
        Comment.objects.create(
            tenant=self.tenant, target_type=TargetType.ENGAGEMENT,
            target_id=self.engagement.pk, body_md="Reply", created_by=self.tester,
            parent=parent,
        )
        self.assertEqual(Comment.objects.count(), 2)
        resp = self.client.delete(self._detail_url(parent.pk))
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(Comment.objects.count(), 0)

    def test_delete_nonexistent_comment(self):
        self._auth_as(self.owner)
        resp = self.client.delete(self._detail_url(uuid.uuid4()))
        self.assertEqual(resp.status_code, 404)

    # -------------------------------------------------------------------
    # CROSS-TENANT ISOLATION
    # -------------------------------------------------------------------

    def test_cross_tenant_isolation_list(self):
        """Comments from another tenant are not visible."""
        other_tenant = _create_tenant(name="Other Corp", slug="other-corp")
        other_user = _create_user(email="other@example.com")
        _create_membership(other_user, other_tenant, role=TenantRole.OWNER)
        other_engagement = Engagement.objects.create(
            tenant=other_tenant, name="Other Engagement", created_by=other_user,
        )
        Comment.objects.create(
            tenant=other_tenant, target_type=TargetType.ENGAGEMENT,
            target_id=other_engagement.pk, body_md="Secret", created_by=other_user,
        )

        self._auth_as(self.owner)
        # Try to list comments on our engagement — should be empty
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 0)

    def test_cross_tenant_isolation_target(self):
        """Cannot access comments on an engagement from another tenant."""
        other_tenant = _create_tenant(name="Other Corp", slug="other-corp")
        other_user = _create_user(email="other@example.com")
        _create_membership(other_user, other_tenant, role=TenantRole.OWNER)
        other_engagement = Engagement.objects.create(
            tenant=other_tenant, name="Other Engagement", created_by=other_user,
        )

        self._auth_as(self.owner)
        resp = self.client.get(self._url(engagement_id=other_engagement.pk))
        self.assertEqual(resp.status_code, 404)

    # -------------------------------------------------------------------
    # UNAUTHENTICATED
    # -------------------------------------------------------------------

    def test_unauthenticated_list(self):
        self.client.logout()
        resp = self.client.get(self._url())
        self.assertEqual(resp.status_code, 401)

    def test_unauthenticated_create(self):
        self.client.logout()
        resp = self.client.post(self._url(), {"body_md": "test"})
        self.assertEqual(resp.status_code, 401)


class MentionExtractionTests(APITestCase):
    """Tests for @[name](uuid) mention extraction and validation."""

    def test_extract_single_mention(self):
        body = "Hey @[John Doe](42) check this"
        ids = extract_mention_user_ids(body)
        self.assertEqual(ids, ["42"])

    def test_extract_multiple_mentions(self):
        body = "@[Alice](10) and @[Bob](20) should look"
        ids = extract_mention_user_ids(body)
        self.assertEqual(len(ids), 2)
        self.assertEqual(ids, ["10", "20"])

    def test_extract_uuid_mention(self):
        """Also supports UUID-format IDs (future-proofing)."""
        body = "Hey @[John](550e8400-e29b-41d4-a716-446655440000) check this"
        ids = extract_mention_user_ids(body)
        self.assertEqual(ids, ["550e8400-e29b-41d4-a716-446655440000"])

    def test_extract_no_mentions(self):
        body = "Just a regular comment with no mentions"
        ids = extract_mention_user_ids(body)
        self.assertEqual(ids, [])

    def test_extract_empty_parens_ignored(self):
        body = "@[Name]() should not match"
        ids = extract_mention_user_ids(body)
        self.assertEqual(ids, [])

    def test_validate_mentions_filters_to_active_members(self):
        tenant = _create_tenant()
        active_user = _create_user(email="active@example.com")
        _create_membership(active_user, tenant, role=TenantRole.MEMBER)
        inactive_user = _create_user(email="inactive@example.com")
        _create_membership(inactive_user, tenant, role=TenantRole.MEMBER, is_active=False)

        valid = validate_mentions(
            tenant, [str(active_user.id), str(inactive_user.id)],
        )
        self.assertEqual(len(valid), 1)
        self.assertEqual(valid[0], str(active_user.id))

    def test_validate_mentions_empty_list(self):
        tenant = _create_tenant()
        self.assertEqual(validate_mentions(tenant, []), [])

    def test_validate_mentions_nonexistent_user(self):
        tenant = _create_tenant()
        valid = validate_mentions(tenant, [str(uuid.uuid4())])
        self.assertEqual(valid, [])


class MemberRefEndpointTests(APITestCase):
    """Tests for GET /api/authorization/members/ref/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com", first_name="Owner", last_name="User")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.member = _create_user(email="member@example.com", first_name="Team", last_name="Member")
        self.member_member = _create_membership(self.member, self.tenant, role=TenantRole.MEMBER)

        self.inactive = _create_user(email="inactive@example.com", first_name="Gone", last_name="User")
        _create_membership(self.inactive, self.tenant, role=TenantRole.MEMBER, is_active=False)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def test_returns_active_members_only(self):
        self._auth_as(self.owner)
        resp = self.client.get("/api/authorization/members/ref/")
        self.assertEqual(resp.status_code, 200)
        emails = [m["email"] for m in resp.data]
        self.assertIn("owner@example.com", emails)
        self.assertIn("member@example.com", emails)
        self.assertNotIn("inactive@example.com", emails)

    def test_response_shape(self):
        self._auth_as(self.owner)
        resp = self.client.get("/api/authorization/members/ref/")
        self.assertEqual(resp.status_code, 200)
        item = resp.data[0]
        self.assertIn("id", item)
        self.assertIn("display_name", item)
        self.assertIn("email", item)
        self.assertIn("avatar_url", item)

    def test_any_authenticated_user_can_access(self):
        """member_ref requires no specific permission — just authentication."""
        noperm = _create_user(email="noperm@example.com")
        _create_membership(noperm, self.tenant, role=TenantRole.MEMBER)
        self._auth_as(noperm)
        resp = self.client.get("/api/authorization/members/ref/")
        self.assertEqual(resp.status_code, 200)

    def test_unauthenticated_rejected(self):
        self.client.logout()
        resp = self.client.get("/api/authorization/members/ref/")
        self.assertEqual(resp.status_code, 401)
