from django.conf import settings
from django.test import TestCase
from django.urls import reverse, resolve
from rest_framework.test import APITestCase


class HealthCheckViewTests(APITestCase):
    """Test the health_check endpoint."""

    def test_health_check_returns_200(self):
        response = self.client.get("/api/health/", format="json")
        self.assertEqual(response.status_code, 200)

    def test_health_check_returns_status_ok(self):
        response = self.client.get("/api/health/", format="json")
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["version"], settings.APP_VERSION)

    def test_health_check_no_auth_required(self):
        response = self.client.get("/api/health/", format="json")
        self.assertEqual(response.status_code, 200)

    def test_health_check_includes_version_header(self):
        response = self.client.get("/api/health/", format="json")
        self.assertEqual(response["X-API-Version"], settings.APP_VERSION)


class RootUrlConfigTests(TestCase):
    """Test root URL configuration."""

    def test_health_check_url_resolves(self):
        url = reverse("health-check")
        self.assertEqual(url, "/api/health/")
