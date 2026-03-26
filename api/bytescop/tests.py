import tempfile
from unittest.mock import patch, MagicMock

from django.conf import settings
from django.test import TestCase, override_settings
from django.urls import reverse, resolve
from rest_framework.test import APITestCase


def _mock_celery_connection(*args, **kwargs):
    """Fake Celery connection that pretends Redis is available."""
    conn = MagicMock()
    conn.connect.return_value = None
    conn.release.return_value = None
    return conn


class HealthCheckViewTests(APITestCase):
    """Test the health_check endpoint."""

    def setUp(self):
        # Create a real temp dir for MEDIA_ROOT so storage check passes
        self._media_dir = tempfile.mkdtemp()
        self._celery_patch = patch(
            "bytescop.celery.app.connection", _mock_celery_connection
        )
        self._celery_patch.start()

    def tearDown(self):
        self._celery_patch.stop()
        import shutil
        shutil.rmtree(self._media_dir, ignore_errors=True)

    def _get_health(self):
        with self.settings(MEDIA_ROOT=self._media_dir):
            return self.client.get("/api/health/", format="json")

    def test_health_check_returns_200(self):
        response = self._get_health()
        self.assertEqual(response.status_code, 200)

    def test_health_check_returns_status_ok(self):
        response = self._get_health()
        self.assertEqual(response.data["status"], "ok")
        self.assertEqual(response.data["version"], settings.APP_VERSION)

    def test_health_check_no_auth_required(self):
        response = self._get_health()
        self.assertEqual(response.status_code, 200)

    def test_health_check_includes_version_header(self):
        response = self._get_health()
        self.assertEqual(response["X-API-Version"], settings.APP_VERSION)


class RootUrlConfigTests(TestCase):
    """Test root URL configuration."""

    def test_health_check_url_resolves(self):
        url = reverse("health-check")
        self.assertEqual(url, "/api/health/")
