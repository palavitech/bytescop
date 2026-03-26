"""Tests for Category 5.3 — Invite Flow.

Covers:
  - Accept-invite validate endpoint (valid/expired/used/invalid tokens)
  - Accept-invite set-password endpoint (happy path, already accepted, mismatch)
  - Create member publishes invite event with correct payload
  - Reinvite cooldown (15-minute window)
  - Reinvite only for PENDING members
  - Token consumed atomically (single-use)
"""

from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import User
from authorization.models import TenantGroup
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from events.publisher import FakeEventPublisher, get_event_publisher, set_event_publisher, reset_event_publisher
from tenancy.invite_service import generate_invite_token
from tenancy.models import InviteStatus, InviteToken, Tenant, TenantMember, TenantRole


STRONG_PASSWORD = "Str0ngP@ss!99"

VALIDATE_URL = "/api/auth/accept-invite/validate/"
SET_PASSWORD_URL = "/api/auth/accept-invite/set-password/"
MEMBERS_URL = "/api/authorization/members/"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    kwargs.setdefault("email_verified", True)
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True, **kwargs):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active, **kwargs,
    )




# ---------------------------------------------------------------------------
# Accept-invite: validate token
# ---------------------------------------------------------------------------


class AcceptInviteValidateTests(APITestCase):
    """Test POST /api/auth/accept-invite/validate/."""

    def setUp(self):
        cache.clear()
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        # Invited user (no password)
        self.invited_user = User.objects.create_user(
            email="invited@example.com", password=None,
            first_name="Inv", last_name="Ited", email_verified=True,
        )
        self.invited_member = _create_membership(
            self.invited_user, self.tenant,
            role=TenantRole.MEMBER,
            invite_status=InviteStatus.PENDING,
        )
        self.raw_token = generate_invite_token(self.invited_member)

    def tearDown(self):
        cache.clear()

    def test_valid_token_returns_session_and_user_info(self):
        response = self.client.post(VALIDATE_URL, {"token": self.raw_token}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["valid"])
        self.assertIn("session", response.data)
        self.assertIn("password_policy", response.data)
        self.assertEqual(response.data["email"], "invited@example.com")
        self.assertEqual(response.data["tenant_name"], "Acme Corp")

    def test_expired_token_rejected(self):
        # Manually expire the token
        invite_token = InviteToken.objects.get(member=self.invited_member, used=False)
        invite_token.expires_at = timezone.now() - timedelta(hours=1)
        invite_token.save(update_fields=["expires_at"])

        response = self.client.post(VALIDATE_URL, {"token": self.raw_token}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid or has expired", response.data["detail"])

    def test_already_used_token_rejected(self):
        # Mark token as used
        InviteToken.objects.filter(member=self.invited_member).update(used=True)

        response = self.client.post(VALIDATE_URL, {"token": self.raw_token}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid or has expired", response.data["detail"])

    def test_invalid_token_rejected(self):
        response = self.client.post(VALIDATE_URL, {"token": "totally-bogus-token"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid or has expired", response.data["detail"])

    def test_missing_token_returns_400(self):
        response = self.client.post(VALIDATE_URL, {}, format="json")
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Accept-invite: set password
# ---------------------------------------------------------------------------


class AcceptInviteSetPasswordTests(APITestCase):
    """Test POST /api/auth/accept-invite/set-password/."""

    def setUp(self):
        cache.clear()
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        # Invited user
        self.invited_user = User.objects.create_user(
            email="invited@example.com", password=None,
            first_name="Inv", last_name="Ited", email_verified=True,
        )
        self.invited_member = _create_membership(
            self.invited_user, self.tenant,
            role=TenantRole.MEMBER,
            invite_status=InviteStatus.PENDING,
        )
        self.raw_token = generate_invite_token(self.invited_member)

    def tearDown(self):
        cache.clear()

    def _get_session(self):
        """Validate token and return the session string."""
        resp = self.client.post(VALIDATE_URL, {"token": self.raw_token}, format="json")
        self.assertEqual(resp.status_code, 200)
        return resp.data["session"]

    def test_set_password_success(self):
        session = self._get_session()
        response = self.client.post(SET_PASSWORD_URL, {
            "session": session,
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        }, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("successfully", response.data["detail"])

        # Verify member is now ACCEPTED
        self.invited_member.refresh_from_db()
        self.assertEqual(self.invited_member.invite_status, InviteStatus.ACCEPTED)

        # Verify user can authenticate
        self.invited_user.refresh_from_db()
        self.assertTrue(self.invited_user.check_password(STRONG_PASSWORD))

    def test_set_password_auto_verifies_email(self):
        """Accepting an invite should set email_verified=True.

        The user proved email ownership by clicking a signed, time-limited
        invite link — requiring a separate verification email is redundant.
        """
        # Start with an unverified user (the realistic case)
        self.invited_user.email_verified = False
        self.invited_user.save(update_fields=["email_verified"])

        session = self._get_session()
        response = self.client.post(SET_PASSWORD_URL, {
            "session": session,
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        }, format="json")
        self.assertEqual(response.status_code, 200)

        self.invited_user.refresh_from_db()
        self.assertTrue(
            self.invited_user.email_verified,
            "Invite acceptance should auto-verify the user's email address",
        )

    def test_password_mismatch_rejected(self):
        session = self._get_session()
        response = self.client.post(SET_PASSWORD_URL, {
            "session": session,
            "password": STRONG_PASSWORD,
            "password_confirm": "DifferentP@ss!99",
        }, format="json")
        self.assertEqual(response.status_code, 400)

    def test_already_accepted_invite_rejected(self):
        """If member is already ACCEPTED, set-password should fail."""
        session = self._get_session()

        # First set password — should succeed
        self.client.post(SET_PASSWORD_URL, {
            "session": session,
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        }, format="json")

        # Second attempt with same session — member is now ACCEPTED
        response = self.client.post(SET_PASSWORD_URL, {
            "session": session,
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("already been accepted", response.data["detail"])

    def test_invalid_session_rejected(self):
        response = self.client.post(SET_PASSWORD_URL, {
            "session": "bogus-session-token",
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        }, format="json")
        self.assertEqual(response.status_code, 400)


# ---------------------------------------------------------------------------
# Token consumed atomically (single-use)
# ---------------------------------------------------------------------------


class TokenConsumedAtomicallyTests(APITestCase):
    """Test that an invite token can only be used once (#3)."""

    def setUp(self):
        cache.clear()
        seed_permissions()
        self.tenant = _create_tenant()
        create_default_groups_for_tenant(self.tenant)

        self.invited_user = User.objects.create_user(
            email="atomic@example.com", password=None,
            first_name="At", last_name="Omic", email_verified=True,
        )
        self.invited_member = _create_membership(
            self.invited_user, self.tenant,
            role=TenantRole.MEMBER,
            invite_status=InviteStatus.PENDING,
        )
        self.raw_token = generate_invite_token(self.invited_member)

    def tearDown(self):
        cache.clear()

    def test_validate_consumes_token_so_second_use_fails(self):
        """First validate succeeds; second with same token fails."""
        resp1 = self.client.post(VALIDATE_URL, {"token": self.raw_token}, format="json")
        self.assertEqual(resp1.status_code, 200)

        resp2 = self.client.post(VALIDATE_URL, {"token": self.raw_token}, format="json")
        self.assertEqual(resp2.status_code, 400)
        self.assertIn("invalid or has expired", resp2.data["detail"])

    def test_full_flow_then_reuse_token_fails(self):
        """Complete the invite flow, then try reusing the token."""
        # Step 1: validate
        resp1 = self.client.post(VALIDATE_URL, {"token": self.raw_token}, format="json")
        self.assertEqual(resp1.status_code, 200)
        session = resp1.data["session"]

        # Step 2: set password
        resp2 = self.client.post(SET_PASSWORD_URL, {
            "session": session,
            "password": STRONG_PASSWORD,
            "password_confirm": STRONG_PASSWORD,
        }, format="json")
        self.assertEqual(resp2.status_code, 200)

        # Step 3: try the same token again
        resp3 = self.client.post(VALIDATE_URL, {"token": self.raw_token}, format="json")
        self.assertEqual(resp3.status_code, 400)


# ---------------------------------------------------------------------------
# Reinvite cooldown (#24)
# ---------------------------------------------------------------------------


class ReinviteCooldownTests(APITestCase):
    """Test reinvite cooldown — 15-minute window."""

    def setUp(self):
        cache.clear()
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)
        self.owner_member.groups.add(self.groups["Administrators"])

        # Pending member with a recent invite
        self.invited_user = User.objects.create_user(
            email="pending@example.com", password=None,
            first_name="Pen", last_name="Ding", email_verified=True,
        )
        self.invited_member = _create_membership(
            self.invited_user, self.tenant,
            role=TenantRole.MEMBER,
            invite_status=InviteStatus.PENDING,
        )
        # Generate initial invite token (sets last_invited_at to now)
        generate_invite_token(self.invited_member)

        self.fake_publisher = FakeEventPublisher()
        set_event_publisher(self.fake_publisher)

    def tearDown(self):
        reset_event_publisher()
        cache.clear()

    def _auth_as_owner(self):
        login_as(self.client, self.owner, self.tenant)

    def _reinvite_url(self, member):
        return f"/api/authorization/members/{member.pk}/reinvite/"

    def test_reinvite_within_cooldown_rejected(self):
        """Reinvite within 15 minutes returns 429."""
        self._auth_as_owner()
        response = self.client.post(self._reinvite_url(self.invited_member))
        self.assertEqual(response.status_code, 429)
        self.assertIn("wait", response.data["detail"].lower())

    def test_reinvite_after_cooldown_allowed(self):
        """Reinvite after 15 minutes returns 200."""
        # Move last_invited_at back by 16 minutes
        self.invited_member.last_invited_at = timezone.now() - timedelta(minutes=16)
        self.invited_member.save(update_fields=["last_invited_at"])

        self._auth_as_owner()
        response = self.client.post(self._reinvite_url(self.invited_member))
        self.assertEqual(response.status_code, 200)
        self.assertIn("re-sent", response.data["detail"].lower())


# ---------------------------------------------------------------------------
# Reinvite only for PENDING members (#25)
# ---------------------------------------------------------------------------


class ReinviteOnlyPendingTests(APITestCase):
    """Test that reinvite is only allowed for PENDING members."""

    def setUp(self):
        cache.clear()
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email="owner@example.com")
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)
        self.owner_member.groups.add(self.groups["Administrators"])

        # Accepted member
        self.accepted_user = _create_user(email="accepted@example.com")
        self.accepted_member = _create_membership(
            self.accepted_user, self.tenant,
            role=TenantRole.MEMBER,
            invite_status=InviteStatus.ACCEPTED,
        )

        self.fake_publisher = FakeEventPublisher()
        set_event_publisher(self.fake_publisher)

    def tearDown(self):
        reset_event_publisher()
        cache.clear()

    def _auth_as_owner(self):
        login_as(self.client, self.owner, self.tenant)

    def test_reinvite_accepted_member_rejected(self):
        self._auth_as_owner()
        url = f"/api/authorization/members/{self.accepted_member.pk}/reinvite/"
        response = self.client.post(url)
        self.assertEqual(response.status_code, 400)
        self.assertIn("already accepted", response.data["detail"].lower())

    def test_reinvite_none_status_member_rejected(self):
        """Members with invite_status=NONE (e.g. owner/signup) cannot be reinvited."""
        self._auth_as_owner()
        # The owner_member has default invite_status=NONE
        url = f"/api/authorization/members/{self.owner_member.pk}/reinvite/"
        response = self.client.post(url)
        # Owner is protected by the owner check OR the pending check
        self.assertIn(response.status_code, [400, 403])
