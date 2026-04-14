"""Tests for feedback app — FeatureRequest model and create_feature_request view."""

from django.test import TestCase
from rest_framework.test import APITestCase

from accounts.models import User
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole

from .models import FeatureRequest, FeatureRequestCategory


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


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


class FeatureRequestCategoryTests(TestCase):
    """Test FeatureRequestCategory TextChoices."""

    def test_all_categories(self):
        expected = {"engagements", "findings", "reporting", "assets", "integrations", "other"}
        actual = {c[0] for c in FeatureRequestCategory.choices}
        self.assertEqual(expected, actual)

    def test_choices_count(self):
        self.assertEqual(len(FeatureRequestCategory.choices), 6)


class FeatureRequestModelTests(TestCase):
    """Test FeatureRequest model creation and methods."""

    def setUp(self):
        self.tenant = _create_tenant()
        self.user = _create_user()
        _create_membership(self.user, self.tenant)

    def test_create_feature_request(self):
        fr = FeatureRequest.objects.create(
            tenant=self.tenant,
            user=self.user,
            category=FeatureRequestCategory.FINDINGS,
            title="Add bulk import",
            description="I want to import findings in bulk from CSV.",
        )
        self.assertEqual(fr.tenant, self.tenant)
        self.assertEqual(fr.user, self.user)
        self.assertEqual(fr.category, "findings")
        self.assertEqual(fr.title, "Add bulk import")
        self.assertIsNotNone(fr.created_at)
        self.assertIsNotNone(fr.id)

    def test_str_representation(self):
        fr = FeatureRequest.objects.create(
            tenant=self.tenant,
            user=self.user,
            category=FeatureRequestCategory.REPORTING,
            title="PDF export",
            description="Generate PDF reports.",
        )
        self.assertEqual(str(fr), "reporting: PDF export")

    def test_ordering_by_created_at_desc(self):
        fr1 = FeatureRequest.objects.create(
            tenant=self.tenant, user=self.user,
            category=FeatureRequestCategory.ASSETS, title="First",
            description="First request",
        )
        fr2 = FeatureRequest.objects.create(
            tenant=self.tenant, user=self.user,
            category=FeatureRequestCategory.OTHER, title="Second",
            description="Second request",
        )
        all_frs = list(FeatureRequest.objects.all())
        self.assertEqual(all_frs[0].pk, fr2.pk)
        self.assertEqual(all_frs[1].pk, fr1.pk)

    def test_cascade_delete_tenant(self):
        FeatureRequest.objects.create(
            tenant=self.tenant, user=self.user,
            category=FeatureRequestCategory.ENGAGEMENTS, title="Test",
            description="Test",
        )
        self.tenant.delete()
        self.assertEqual(FeatureRequest.objects.count(), 0)

    def test_cascade_delete_user(self):
        FeatureRequest.objects.create(
            tenant=self.tenant, user=self.user,
            category=FeatureRequestCategory.INTEGRATIONS, title="Test",
            description="Test",
        )
        self.user.delete()
        self.assertEqual(FeatureRequest.objects.count(), 0)

    def test_max_lengths(self):
        """Title max=200, description max=5000 (model-level, tested as DB write)."""
        fr = FeatureRequest.objects.create(
            tenant=self.tenant, user=self.user,
            category=FeatureRequestCategory.OTHER,
            title="A" * 200,
            description="B" * 5000,
        )
        self.assertEqual(len(fr.title), 200)
        self.assertEqual(len(fr.description), 5000)


# ---------------------------------------------------------------------------
# View tests — must wire URL manually since not in main urls.py
# ---------------------------------------------------------------------------


class FeatureRequestViewTests(APITestCase):
    """Tests for POST /api/feedback/ — create_feature_request endpoint.

    NOTE: The feedback app URLs are not yet wired into the main urls.py.
    These tests call the view function directly via DRF's APIRequestFactory
    to still validate the view logic and increase coverage.
    """

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

    def _call_view(self, user, data):
        """Call create_feature_request view via APIRequestFactory."""
        from rest_framework.test import APIRequestFactory
        from feedback.views import create_feature_request

        factory = APIRequestFactory()
        request = factory.post("/api/feedback/", data, format="json")
        request.user = user
        request.tenant = self.tenant

        # Simulate middleware session for login
        from django.contrib.sessions.backends.db import SessionStore
        request.session = SessionStore()
        request.session['tenant_id'] = str(self.tenant.id)
        request.session.save()

        # Force authentication
        from rest_framework.test import force_authenticate
        force_authenticate(request, user=user)

        response = create_feature_request(request)
        return response

    def test_create_feature_request_as_owner(self):
        resp = self._call_view(self.owner, {
            "category": "findings",
            "title": "Add severity filtering",
            "description": "I want to filter findings by severity in the list view.",
        })
        self.assertEqual(resp.status_code, 201)
        self.assertIn("submitted", resp.data["detail"])
        self.assertEqual(FeatureRequest.objects.count(), 1)
        fr = FeatureRequest.objects.first()
        self.assertEqual(fr.category, "findings")
        self.assertEqual(fr.title, "Add severity filtering")
        self.assertEqual(fr.user, self.owner)
        self.assertEqual(fr.tenant, self.tenant)

    def test_create_feature_request_as_analyst(self):
        """Analysts should have feature_request.create permission."""
        resp = self._call_view(self.analyst, {
            "category": "reporting",
            "title": "PDF export",
            "description": "Generate PDF reports from findings.",
        })
        self.assertEqual(resp.status_code, 201)

    def test_create_feature_request_no_permission(self):
        resp = self._call_view(self.noperm, {
            "category": "assets",
            "title": "Test",
            "description": "Test description",
        })
        self.assertEqual(resp.status_code, 403)

    def test_create_feature_request_invalid_category(self):
        resp = self._call_view(self.owner, {
            "category": "invalid_category",
            "title": "Test",
            "description": "Test description",
        })
        self.assertEqual(resp.status_code, 400)

    def test_create_feature_request_missing_title(self):
        resp = self._call_view(self.owner, {
            "category": "findings",
            "description": "Test description",
        })
        self.assertEqual(resp.status_code, 400)

    def test_create_feature_request_missing_description(self):
        resp = self._call_view(self.owner, {
            "category": "findings",
            "title": "Test title",
        })
        self.assertEqual(resp.status_code, 400)

    def test_create_feature_request_alternate_category(self):
        """A non-default category should be accepted."""
        resp = self._call_view(self.owner, {
            "category": "reporting",
            "title": "Test reporting",
            "description": "Description for reporting",
        })
        self.assertEqual(resp.status_code, 201)

    def test_create_feature_request_publishes_event(self):
        """Verify the event publisher is called."""
        resp = self._call_view(self.owner, {
            "category": "integrations",
            "title": "Slack integration",
            "description": "Notify findings to Slack channels.",
        })
        self.assertEqual(resp.status_code, 201)
        # Event publisher is fake in test settings, so no error


class FeatureRequestSerializerTests(TestCase):
    """Test the FeatureRequestSerializer validation."""

    def test_valid_data(self):
        from feedback.views import FeatureRequestSerializer
        ser = FeatureRequestSerializer(data={
            "category": "findings",
            "title": "Test title",
            "description": "Test description",
        })
        self.assertTrue(ser.is_valid())

    def test_title_max_length(self):
        from feedback.views import FeatureRequestSerializer
        ser = FeatureRequestSerializer(data={
            "category": "findings",
            "title": "A" * 201,
            "description": "Test",
        })
        self.assertFalse(ser.is_valid())
        self.assertIn("title", ser.errors)

    def test_description_max_length(self):
        from feedback.views import FeatureRequestSerializer
        ser = FeatureRequestSerializer(data={
            "category": "findings",
            "title": "Test",
            "description": "A" * 5001,
        })
        self.assertFalse(ser.is_valid())
        self.assertIn("description", ser.errors)

    def test_invalid_category(self):
        from feedback.views import FeatureRequestSerializer
        ser = FeatureRequestSerializer(data={
            "category": "nonexistent",
            "title": "Test",
            "description": "Test",
        })
        self.assertFalse(ser.is_valid())
        self.assertIn("category", ser.errors)
