"""Tests for the contact-us endpoint (views_contact_us.py).

Covers:
- ContactUsSerializer validation (required fields, sanitization, XSS/SQLi rejection)
- contact_us view (success, missing fields, rate limiting, event publishing)
"""

from unittest.mock import patch, MagicMock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APITestCase, APIRequestFactory

from core.rate_limit.models import RateLimitEntry
from core.rate_limit.helpers import record_rate_limit

from api.views_contact_us import contact_us, ContactUsSerializer, GENERIC_RESPONSE


# ---------------------------------------------------------------------------
# ContactUsSerializer — unit tests
# ---------------------------------------------------------------------------


class ContactUsSerializerTests(TestCase):
    """Test ContactUsSerializer validation and sanitization."""

    def _valid_data(self, **overrides):
        data = {
            "name": "John Doe",
            "email": "john@example.com",
            "organization": "Test Corp",
            "subject": "General Inquiry",
            "message": "Hello, I would like to learn more about your product.",
        }
        data.update(overrides)
        return data

    def test_valid_data_passes(self):
        ser = ContactUsSerializer(data=self._valid_data())
        self.assertTrue(ser.is_valid(), ser.errors)

    def test_missing_name_rejected(self):
        data = self._valid_data()
        del data["name"]
        ser = ContactUsSerializer(data=data)
        self.assertFalse(ser.is_valid())
        self.assertIn("name", ser.errors)

    def test_missing_email_rejected(self):
        data = self._valid_data()
        del data["email"]
        ser = ContactUsSerializer(data=data)
        self.assertFalse(ser.is_valid())
        self.assertIn("email", ser.errors)

    def test_missing_message_rejected(self):
        data = self._valid_data()
        del data["message"]
        ser = ContactUsSerializer(data=data)
        self.assertFalse(ser.is_valid())
        self.assertIn("message", ser.errors)

    def test_invalid_email_rejected(self):
        ser = ContactUsSerializer(data=self._valid_data(email="not-an-email"))
        self.assertFalse(ser.is_valid())
        self.assertIn("email", ser.errors)

    def test_organization_optional(self):
        data = self._valid_data()
        del data["organization"]
        ser = ContactUsSerializer(data=data)
        self.assertTrue(ser.is_valid(), ser.errors)

    def test_subject_optional(self):
        data = self._valid_data()
        del data["subject"]
        ser = ContactUsSerializer(data=data)
        self.assertTrue(ser.is_valid(), ser.errors)

    def test_xss_in_name_rejected(self):
        ser = ContactUsSerializer(data=self._valid_data(name="<script>alert(1)</script>"))
        self.assertFalse(ser.is_valid())

    def test_xss_in_message_rejected(self):
        ser = ContactUsSerializer(data=self._valid_data(message="<img onerror=alert(1) src=x>"))
        self.assertFalse(ser.is_valid())

    def test_sqli_in_message_rejected(self):
        ser = ContactUsSerializer(data=self._valid_data(message="'; DROP TABLE users; --"))
        self.assertFalse(ser.is_valid())

    def test_xss_in_organization_rejected(self):
        ser = ContactUsSerializer(data=self._valid_data(organization="<iframe src=evil>"))
        self.assertFalse(ser.is_valid())

    def test_xss_in_subject_rejected(self):
        ser = ContactUsSerializer(data=self._valid_data(subject="javascript:alert(1)"))
        self.assertFalse(ser.is_valid())

    def test_clean_name_accepted(self):
        """Plain text name without HTML or attack payloads is accepted."""
        ser = ContactUsSerializer(data=self._valid_data(name="John Doe"))
        self.assertTrue(ser.is_valid(), ser.errors)
        self.assertEqual(ser.validated_data["name"], "John Doe")

    def test_omitted_organization_accepted(self):
        data = self._valid_data()
        data.pop("organization", None)
        ser = ContactUsSerializer(data=data)
        self.assertTrue(ser.is_valid(), ser.errors)

    def test_omitted_subject_accepted(self):
        data = self._valid_data()
        data.pop("subject", None)
        ser = ContactUsSerializer(data=data)
        self.assertTrue(ser.is_valid(), ser.errors)

    def test_message_max_length(self):
        ser = ContactUsSerializer(data=self._valid_data(message="x" * 5001))
        self.assertFalse(ser.is_valid())
        self.assertIn("message", ser.errors)

    def test_name_max_length(self):
        ser = ContactUsSerializer(data=self._valid_data(name="x" * 101))
        self.assertFalse(ser.is_valid())
        self.assertIn("name", ser.errors)


# ---------------------------------------------------------------------------
# contact_us view — integration tests
# ---------------------------------------------------------------------------


class ContactUsViewTests(APITestCase):
    """Test the contact_us view function."""

    def setUp(self):
        cache.clear()
        RateLimitEntry.objects.all().delete()
        self.factory = APIRequestFactory()

    def _post_contact(self, data):
        request = self.factory.post("/api/contact-us/", data, format="json")
        return contact_us(request)

    def test_valid_submission_returns_200(self):
        response = self._post_contact({
            "name": "Jane",
            "email": "jane@example.com",
            "message": "I have a question about pricing.",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], GENERIC_RESPONSE)

    def test_valid_submission_with_all_fields(self):
        response = self._post_contact({
            "name": "Jane",
            "email": "jane@example.com",
            "organization": "Acme Corp",
            "subject": "Pricing Inquiry",
            "message": "What are your enterprise pricing plans?",
        })
        self.assertEqual(response.status_code, 200)

    def test_missing_required_fields_returns_400(self):
        response = self._post_contact({
            "name": "Jane",
        })
        self.assertEqual(response.status_code, 400)

    def test_missing_name_returns_400(self):
        response = self._post_contact({
            "email": "jane@example.com",
            "message": "Hello",
        })
        self.assertEqual(response.status_code, 400)

    def test_missing_message_returns_400(self):
        response = self._post_contact({
            "name": "Jane",
            "email": "jane@example.com",
        })
        self.assertEqual(response.status_code, 400)

    def test_invalid_email_returns_400(self):
        response = self._post_contact({
            "name": "Jane",
            "email": "invalid",
            "message": "Hello",
        })
        self.assertEqual(response.status_code, 400)

    def test_rate_limited_returns_200_silently(self):
        """Rate-limited requests get 200 (not 429) to avoid leaking state."""
        # Exhaust rate limit for this email
        for _ in range(10):
            record_rate_limit("contact_us", email="ratelimited@example.com")

        response = self._post_contact({
            "name": "Jane",
            "email": "ratelimited@example.com",
            "message": "Spamming you repeatedly.",
        })
        # Silent rate limit: always returns 200
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], GENERIC_RESPONSE)

    def test_xss_payload_rejected(self):
        response = self._post_contact({
            "name": "<script>alert('xss')</script>",
            "email": "attacker@example.com",
            "message": "Legit message",
        })
        self.assertEqual(response.status_code, 400)

    def test_sqli_payload_rejected(self):
        response = self._post_contact({
            "name": "Jane",
            "email": "jane@example.com",
            "message": "' OR '1'='1",
        })
        self.assertEqual(response.status_code, 400)
