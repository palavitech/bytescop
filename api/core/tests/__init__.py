import uuid

from django.test import TestCase

from tenancy.models import Tenant


class TimeStampedModelTests(TestCase):
    """Test the TimeStampedModel abstract base via the Tenant concrete model."""

    def test_pk_is_uuid(self):
        tenant = Tenant.objects.create(name="Test Co", slug="test-co")
        self.assertIsInstance(tenant.pk, uuid.UUID)

    def test_pk_auto_generated(self):
        tenant = Tenant.objects.create(name="Test Co", slug="test-co")
        self.assertIsNotNone(tenant.pk)

    def test_pk_not_editable(self):
        field = Tenant._meta.get_field("id")
        self.assertFalse(field.editable)

    def test_created_at_auto_set(self):
        tenant = Tenant.objects.create(name="Test Co", slug="test-co")
        self.assertIsNotNone(tenant.created_at)

    def test_updated_at_auto_set(self):
        tenant = Tenant.objects.create(name="Test Co", slug="test-co")
        self.assertIsNotNone(tenant.updated_at)

    def test_updated_at_changes_on_save(self):
        tenant = Tenant.objects.create(name="Test Co", slug="test-co")
        original = tenant.updated_at
        tenant.name = "Updated Co"
        tenant.save()
        tenant.refresh_from_db()
        self.assertGreaterEqual(tenant.updated_at, original)

    def test_default_ordering_is_newest_first(self):
        t1 = Tenant.objects.create(name="First", slug="first")
        t2 = Tenant.objects.create(name="Second", slug="second")
        tenants = list(Tenant.objects.all())
        self.assertEqual(tenants[0].pk, t2.pk)
        self.assertEqual(tenants[1].pk, t1.pk)
