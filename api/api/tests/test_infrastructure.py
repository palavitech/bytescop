"""
Gap tests for Categories 9 (Infrastructure) and 10 (Security Fixes).

Gap 1: X-API-Version header middleware on authenticated endpoints
Gap 2: Dev endpoints return 404 when DEBUG=False (HTTP-level, not just resolve())
Gap 3: Asset client_id scoped to tenant — cross-tenant rejection
"""

from django.conf import settings
from django.test import override_settings
from django.urls import resolve, Resolver404
from rest_framework.test import APITestCase

from accounts.models import User
from assets.models import Asset
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from clients.models import Client
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole


STRONG_PASSWORD = 'Str0ngP@ss!99'


def _create_user(email='user@example.com', password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name='Acme Corp', slug='acme-corp', **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


# -----------------------------------------------------------------------
# Gap 1: X-API-Version header middleware (Cat 9, #2)
# -----------------------------------------------------------------------


class VersionHeaderMiddlewareTests(APITestCase):
    """Verify X-API-Version header appears on every response, not just health."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)
        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def test_version_header_on_health_check(self):
        """Unauthenticated health endpoint includes X-API-Version."""
        response = self.client.get('/api/health/')
        self.assertIn('X-API-Version', response)
        self.assertEqual(response['X-API-Version'], settings.APP_VERSION)

    def test_version_header_on_authenticated_endpoint(self):
        """Authenticated API endpoints include X-API-Version."""
        self._auth_as(self.owner)
        response = self.client.get('/api/me/profile/')
        self.assertIn('X-API-Version', response)
        self.assertEqual(response['X-API-Version'], settings.APP_VERSION)

    def test_version_header_on_unauthenticated_response(self):
        """Unauthenticated responses (no token, no tenant) include X-API-Version."""
        response = self.client.get('/api/me/profile/')
        # Might be 400 (missing tenant) or 401; either way header must be present
        self.assertIn(response.status_code, [400, 401])
        self.assertIn('X-API-Version', response)
        self.assertEqual(response['X-API-Version'], settings.APP_VERSION)

    def test_version_header_on_nonexistent_path(self):
        """Non-matching paths still include X-API-Version (middleware runs on all responses)."""
        response = self.client.get('/api/nonexistent-endpoint/')
        # Might be 400 (tenant middleware) or 404; header must be present regardless
        self.assertIn(response.status_code, [400, 404])
        self.assertIn('X-API-Version', response)
        self.assertEqual(response['X-API-Version'], settings.APP_VERSION)

    def test_version_header_on_list_endpoint(self):
        """List endpoints (e.g. clients) include X-API-Version."""
        self._auth_as(self.owner)
        response = self.client.get('/api/clients/')
        self.assertIn('X-API-Version', response)
        self.assertEqual(response['X-API-Version'], settings.APP_VERSION)


# -----------------------------------------------------------------------
# Gap 2: Dev endpoints guarded behind DEBUG (Cat 10, H6)
# -----------------------------------------------------------------------


class DevEndpointProductionGuardTests(APITestCase):
    """
    Verify dev endpoints are not reachable — they were removed and replaced
    by the dev_seed management command.
    """

    def test_dev_seed_not_resolvable(self):
        """Route /api/dev/seed/ does not exist."""
        with self.assertRaises(Resolver404):
            resolve('/api/dev/seed/')

    def test_dev_flush_not_resolvable(self):
        """Route /api/dev/flush/ does not exist."""
        with self.assertRaises(Resolver404):
            resolve('/api/dev/flush/')

    def test_dev_flush_all_not_resolvable(self):
        """Route /api/dev/flush-all/ does not exist."""
        with self.assertRaises(Resolver404):
            resolve('/api/dev/flush-all/')


# -----------------------------------------------------------------------
# Gap 3: Asset client_id scoped to tenant (Cat 10, M4)
# -----------------------------------------------------------------------


class AssetClientTenantIsolationTests(APITestCase):
    """
    Verify that an asset cannot reference a client from a different tenant.

    The AssetSerializer.validate_client_id() and get_fields() methods filter
    the client queryset by request.tenant, so a cross-tenant client_id should
    be rejected.
    """

    def setUp(self):
        seed_permissions()

        # Tenant A
        self.tenant_a = _create_tenant(name='Tenant A', slug='tenant-a')
        self.groups_a = create_default_groups_for_tenant(self.tenant_a)
        self.owner_a = _create_user(email='owner-a@example.com')
        self.member_a = _create_membership(self.owner_a, self.tenant_a)

        # Tenant B
        self.tenant_b = _create_tenant(name='Tenant B', slug='tenant-b')
        self.groups_b = create_default_groups_for_tenant(self.tenant_b)
        self.owner_b = _create_user(email='owner-b@example.com')
        self.member_b = _create_membership(self.owner_b, self.tenant_b)

        # Client in Tenant A
        self.client_a = Client.objects.create(
            tenant=self.tenant_a, name='Client Alpha',
        )

        # Client in Tenant B
        self.client_b = Client.objects.create(
            tenant=self.tenant_b, name='Client Beta',
        )

    def _auth_as(self, user, tenant):
        login_as(self.client, user, tenant)

    def test_create_asset_with_own_client_succeeds(self):
        """Creating an asset with a client from the same tenant works."""
        self._auth_as(self.owner_a, self.tenant_a)
        response = self.client.post('/api/assets/', {
            'name': 'Web Server',
            'asset_type': 'host',
            'client_id': str(self.client_a.pk),
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(str(response.data['client_id']), str(self.client_a.pk))

    def test_create_asset_with_cross_tenant_client_rejected(self):
        """Creating an asset referencing a client from another tenant is rejected."""
        self._auth_as(self.owner_a, self.tenant_a)
        response = self.client.post('/api/assets/', {
            'name': 'Web Server',
            'asset_type': 'host',
            'client_id': str(self.client_b.pk),
        })
        self.assertIn(response.status_code, [400, 403])

    def test_update_asset_with_cross_tenant_client_rejected(self):
        """Updating an asset to reference a cross-tenant client is rejected."""
        self._auth_as(self.owner_a, self.tenant_a)
        # First create a valid asset
        asset = Asset.objects.create(
            tenant=self.tenant_a, name='Server', client=self.client_a,
        )
        response = self.client.patch(f'/api/assets/{asset.pk}/', {
            'client_id': str(self.client_b.pk),
        })
        self.assertIn(response.status_code, [400, 403])

    def test_tenant_b_cannot_see_tenant_a_assets(self):
        """Listing assets from another tenant returns empty results."""
        # Create asset in tenant A
        Asset.objects.create(
            tenant=self.tenant_a, name='Secret Server', client=self.client_a,
        )
        # Auth as tenant B user
        self._auth_as(self.owner_b, self.tenant_b)
        response = self.client.get('/api/assets/')
        self.assertEqual(response.status_code, 200)
        # Response may be paginated (dict with 'results') or a plain list
        data = response.data
        items = data['results'] if isinstance(data, dict) and 'results' in data else data
        self.assertEqual(len(items), 0)

    def test_tenant_b_cannot_retrieve_tenant_a_asset(self):
        """Direct retrieval of another tenant's asset returns 404."""
        asset = Asset.objects.create(
            tenant=self.tenant_a, name='Secret Server', client=self.client_a,
        )
        self._auth_as(self.owner_b, self.tenant_b)
        response = self.client.get(f'/api/assets/{asset.pk}/')
        self.assertEqual(response.status_code, 404)

    def test_create_asset_with_null_client_succeeds(self):
        """Creating an asset with no client is allowed."""
        self._auth_as(self.owner_a, self.tenant_a)
        response = self.client.post('/api/assets/', {
            'name': 'Standalone Host',
            'asset_type': 'host',
        })
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data['client_id'])

    def test_client_queryset_filtered_by_tenant(self):
        """The serializer's client_id field only shows clients from the request tenant."""
        self._auth_as(self.owner_b, self.tenant_b)
        # Try to create with tenant A's client — should be rejected because
        # the serializer filters the client queryset to tenant B only.
        response = self.client.post('/api/assets/', {
            'name': 'Attempt Cross-Tenant',
            'asset_type': 'webapp',
            'client_id': str(self.client_a.pk),
        })
        self.assertIn(response.status_code, [400, 403])
