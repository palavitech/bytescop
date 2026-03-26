"""Tests for the DashboardLayout model and API endpoints."""

from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APITestCase

from accounts.models import User
from authorization.models import Permission, TenantGroup
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole

from api.dashboard import (
    COL_SPAN_BY_TYPE,
    GRID_COLS,
    REGISTRY_MAP,
    SIZE_PRESETS,
    compute_default_layout,
    get_widget_catalog,
    migrate_legacy_layout,
)
from api.models import DashboardLayout

STRONG_PASSWORD = "Str0ngP@ss!99"


def _create_user(email="user@example.com", password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name="Acme Corp", slug="acme-corp", **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


class DashboardLayoutModelTests(TestCase):
    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()

    def test_create_layout(self):
        layout = DashboardLayout.objects.create(
            tenant=self.tenant, user=self.user, view='default',
            widgets=[{'widget_id': 'active_engagements', 'col': 0, 'row': 0}],
        )
        self.assertEqual(layout.view, 'default')
        self.assertEqual(len(layout.widgets), 1)

    def test_unique_constraint(self):
        DashboardLayout.objects.create(
            tenant=self.tenant, user=self.user, view='default', widgets=[],
        )
        with self.assertRaises(IntegrityError):
            DashboardLayout.objects.create(
                tenant=self.tenant, user=self.user, view='default', widgets=[],
            )

    def test_different_views_allowed(self):
        DashboardLayout.objects.create(
            tenant=self.tenant, user=self.user, view='default', widgets=[],
        )
        DashboardLayout.objects.create(
            tenant=self.tenant, user=self.user, view='analyst', widgets=[],
        )
        self.assertEqual(DashboardLayout.objects.filter(user=self.user).count(), 2)

    def test_json_roundtrip(self):
        data = [
            {'widget_id': 'active_engagements', 'col': 0, 'row': 0},
            {'widget_id': 'total_findings', 'col': 1, 'row': 0},
        ]
        layout = DashboardLayout.objects.create(
            tenant=self.tenant, user=self.user, view='default', widgets=data,
        )
        layout.refresh_from_db()
        self.assertEqual(layout.widgets, data)


class WidgetCatalogTests(TestCase):
    def test_catalog_returns_metadata_only(self):
        catalog = get_widget_catalog('__all__', view='default')
        self.assertTrue(len(catalog) > 0)
        for item in catalog:
            self.assertIn('id', item)
            self.assertIn('title', item)
            self.assertIn('type', item)
            self.assertIn('col_span', item)
            self.assertIn('default_size', item)
            self.assertIn('allowed_sizes', item)
            self.assertIn('description', item)
            self.assertNotIn('data', item)
            self.assertNotIn('build', item)

    def test_catalog_col_span_values(self):
        catalog = get_widget_catalog('__all__', view='default')
        for item in catalog:
            expected = COL_SPAN_BY_TYPE.get(item['type'], 1)
            self.assertEqual(
                item['col_span'], expected,
                f"Widget {item['id']} col_span should be {expected}",
            )

    def test_catalog_permission_filtering(self):
        full = get_widget_catalog('__all__', view='default')
        limited = get_widget_catalog({'engagement.view'}, view='default')
        self.assertGreater(len(full), len(limited))
        for item in limited:
            self.assertNotEqual(item['id'], 'active_users')

    def test_catalog_all_views(self):
        for view_key in REGISTRY_MAP:
            catalog = get_widget_catalog('__all__', view=view_key)
            self.assertTrue(len(catalog) > 0, f"Empty catalog for view {view_key}")

    def test_all_widgets_have_descriptions(self):
        for view_key, registry in REGISTRY_MAP.items():
            for wd in registry:
                self.assertTrue(
                    wd.description,
                    f"Widget {wd.id} in {view_key} missing description",
                )

    def test_all_widgets_have_valid_default_size(self):
        for view_key, registry in REGISTRY_MAP.items():
            for wd in registry:
                self.assertIn(
                    wd.default_size, SIZE_PRESETS,
                    f"Widget {wd.id} in {view_key} has invalid default_size '{wd.default_size}'",
                )

    def test_all_widgets_have_valid_allowed_sizes(self):
        for view_key, registry in REGISTRY_MAP.items():
            for wd in registry:
                for s in wd.allowed_sizes:
                    self.assertIn(
                        s, SIZE_PRESETS,
                        f"Widget {wd.id} in {view_key} has invalid allowed size '{s}'",
                    )

    def test_all_widgets_have_valid_col_span(self):
        for view_key, registry in REGISTRY_MAP.items():
            for wd in registry:
                col_span = COL_SPAN_BY_TYPE.get(wd.widget_type, 1)
                self.assertIn(
                    col_span, [1, 3, 6],
                    f"Widget {wd.id} in {view_key} has invalid col_span {col_span}",
                )
                self.assertLessEqual(
                    col_span, GRID_COLS,
                    f"Widget {wd.id} col_span exceeds grid width",
                )


class ComputeDefaultLayoutTests(TestCase):
    def test_packing_stats_across_row(self):
        registry = REGISTRY_MAP['default']
        layout = compute_default_layout(registry, '__all__')
        self.assertTrue(len(layout) > 0)
        for item in layout:
            self.assertIn('widget_id', item)
            self.assertIn('col', item)
            self.assertIn('row', item)
            self.assertGreaterEqual(item['col'], 0)
            self.assertLess(item['col'], GRID_COLS)

    def test_no_permissions_returns_empty(self):
        registry = REGISTRY_MAP['default']
        layout = compute_default_layout(registry, set())
        self.assertEqual(layout, [])


class MigrateLegacyLayoutTests(TestCase):
    def test_migrate_position_based(self):
        registry = REGISTRY_MAP['default']
        legacy = [
            {'widget_id': 'active_engagements', 'size': '1x1', 'position': 0},
            {'widget_id': 'total_findings', 'size': '1x1', 'position': 1},
        ]
        result = migrate_legacy_layout(legacy, registry)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['widget_id'], 'active_engagements')
        self.assertEqual(result[0]['col'], 0)
        self.assertEqual(result[0]['row'], 0)
        self.assertEqual(result[1]['widget_id'], 'total_findings')
        self.assertEqual(result[1]['col'], 1)
        self.assertEqual(result[1]['row'], 0)


class CatalogAPITests(APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        self.member = _create_membership(self.user, self.tenant)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        login_as(self.client, self.user, self.tenant)

    def test_get_catalog(self):
        resp = self.client.get('/api/dashboard/catalog/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('widgets', resp.data)
        self.assertTrue(len(resp.data['widgets']) > 0)

    def test_catalog_includes_col_span(self):
        resp = self.client.get('/api/dashboard/catalog/')
        for w in resp.data['widgets']:
            self.assertIn('col_span', w)
            self.assertIn(w['col_span'], [1, 3, 6])

    def test_catalog_with_view_param(self):
        resp = self.client.get('/api/dashboard/catalog/?view=analyst')
        self.assertEqual(resp.status_code, 200)
        ids = [w['id'] for w in resp.data['widgets']]
        self.assertIn('my_engagements', ids)

    def test_catalog_unauthenticated(self):
        self.client.logout()
        resp = self.client.get('/api/dashboard/catalog/')
        self.assertEqual(resp.status_code, 401)


class LayoutAPITests(APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        self.member = _create_membership(self.user, self.tenant)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        login_as(self.client, self.user, self.tenant)

    def test_get_no_layout(self):
        resp = self.client.get('/api/dashboard/layout/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['customized'])
        self.assertIsNone(resp.data['widgets'])

    def test_save_and_retrieve_layout(self):
        payload = {'widgets': [
            {'widget_id': 'active_engagements', 'col': 0, 'row': 0},
            {'widget_id': 'total_findings', 'col': 1, 'row': 0},
        ]}
        resp = self.client.put(
            '/api/dashboard/layout/', payload, format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['customized'])
        self.assertEqual(len(resp.data['widgets']), 2)
        # Check col/row fields
        self.assertEqual(resp.data['widgets'][0]['col'], 0)
        self.assertEqual(resp.data['widgets'][0]['row'], 0)
        self.assertEqual(resp.data['widgets'][1]['col'], 1)
        self.assertEqual(resp.data['widgets'][1]['row'], 0)

        # Retrieve
        resp2 = self.client.get('/api/dashboard/layout/')
        self.assertEqual(resp2.status_code, 200)
        self.assertTrue(resp2.data['customized'])
        self.assertEqual(len(resp2.data['widgets']), 2)

    def test_save_overwrites(self):
        self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'active_engagements', 'col': 0, 'row': 0}],
        }, format='json')
        self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'total_findings', 'col': 0, 'row': 0}],
        }, format='json')
        resp = self.client.get('/api/dashboard/layout/')
        self.assertEqual(len(resp.data['widgets']), 1)
        self.assertEqual(resp.data['widgets'][0]['widget_id'], 'total_findings')

    def test_delete_layout(self):
        self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'active_engagements', 'col': 0, 'row': 0}],
        }, format='json')
        resp = self.client.delete('/api/dashboard/layout/')
        self.assertEqual(resp.status_code, 204)
        resp2 = self.client.get('/api/dashboard/layout/')
        self.assertFalse(resp2.data['customized'])

    def test_delete_nonexistent(self):
        resp = self.client.delete('/api/dashboard/layout/')
        self.assertEqual(resp.status_code, 204)

    def test_invalid_widget_id(self):
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'nonexistent', 'col': 0, 'row': 0}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('unknown', resp.data['detail'])

    def test_invalid_col(self):
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'active_engagements', 'col': 6, 'row': 0}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('col', resp.data['detail'])

    def test_invalid_col_negative(self):
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'active_engagements', 'col': -1, 'row': 0}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('col', resp.data['detail'])

    def test_invalid_row_negative(self):
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'active_engagements', 'col': 0, 'row': -1}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('row', resp.data['detail'])

    def test_widget_overflows_grid(self):
        # engagement_status is a chart (col_span=3), col=4 means 4+3=7 > 6
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'engagement_status', 'col': 4, 'row': 0}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('overflows', resp.data['detail'])

    def test_overlapping_widgets(self):
        # Two stat widgets (col_span=1) at the same position
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [
                {'widget_id': 'active_engagements', 'col': 0, 'row': 0},
                {'widget_id': 'total_findings', 'col': 0, 'row': 0},
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('overlaps', resp.data['detail'])

    def test_overlapping_wide_widget(self):
        # Chart (col_span=3) at col=0 overlaps with stat at col=2
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [
                {'widget_id': 'engagement_status', 'col': 0, 'row': 0},
                {'widget_id': 'active_engagements', 'col': 2, 'row': 0},
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('overlaps', resp.data['detail'])

    def test_non_overlapping_widgets(self):
        # Chart (col_span=3) at col=0 and stat at col=3 — no overlap
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [
                {'widget_id': 'engagement_status', 'col': 0, 'row': 0},
                {'widget_id': 'active_engagements', 'col': 3, 'row': 0},
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 200)

    def test_duplicate_widget(self):
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [
                {'widget_id': 'active_engagements', 'col': 0, 'row': 0},
                {'widget_id': 'active_engagements', 'col': 1, 'row': 0},
            ],
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('duplicate', resp.data['detail'])

    def test_widgets_not_list(self):
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': 'notalist',
        }, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_empty_layout(self):
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [],
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['widgets']), 0)

    def test_layout_unauthenticated(self):
        self.client.logout()
        resp = self.client.get('/api/dashboard/layout/')
        self.assertEqual(resp.status_code, 401)

    def test_legacy_layout_auto_migrated_on_get(self):
        """Legacy position-based layout is auto-migrated to coordinates on GET."""
        DashboardLayout.objects.create(
            tenant=self.tenant, user=self.user, view='default',
            widgets=[
                {'widget_id': 'active_engagements', 'size': '1x1', 'position': 0},
                {'widget_id': 'total_findings', 'size': '1x1', 'position': 1},
            ],
        )
        resp = self.client.get('/api/dashboard/layout/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['customized'])
        widgets = resp.data['widgets']
        self.assertEqual(len(widgets), 2)
        # Should now have col/row
        self.assertIn('col', widgets[0])
        self.assertIn('row', widgets[0])
        self.assertEqual(widgets[0]['col'], 0)
        self.assertEqual(widgets[0]['row'], 0)
        self.assertEqual(widgets[1]['col'], 1)
        self.assertEqual(widgets[1]['row'], 0)


class LayoutPermissionTests(APITestCase):
    """Test that layout validation respects user permissions."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        self.member = _create_membership(
            self.user, self.tenant, role=TenantRole.MEMBER,
        )
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        # Give user only engagement.view (not finding.view, etc.)
        group = TenantGroup.objects.create(tenant=self.tenant, name='Limited')
        eng_perm = Permission.objects.get(codename='engagement.view')
        group.permissions.add(eng_perm)
        self.member.groups.add(group)
        login_as(self.client, self.user, self.tenant)

    def test_cannot_add_unpermitted_widget(self):
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'total_findings', 'col': 0, 'row': 0}],
        }, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('no permission', resp.data['detail'])

    def test_can_add_permitted_widget(self):
        resp = self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'active_engagements', 'col': 0, 'row': 0}],
        }, format='json')
        self.assertEqual(resp.status_code, 200)


class DashboardWithLayoutTests(APITestCase):
    """Test that the main dashboard endpoint uses saved layouts."""

    def setUp(self):
        self.user = _create_user()
        self.tenant = _create_tenant()
        self.member = _create_membership(self.user, self.tenant)
        seed_permissions()
        create_default_groups_for_tenant(self.tenant)
        login_as(self.client, self.user, self.tenant)

    def test_dashboard_without_layout(self):
        resp = self.client.get('/api/dashboard/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['layout']['customized'])
        # Should return all default widgets with coordinates
        self.assertTrue(len(resp.data['widgets']) > 0)
        for w in resp.data['widgets']:
            self.assertIn('col', w)
            self.assertIn('row', w)
            self.assertIn('col_span', w)

    def test_dashboard_with_saved_layout(self):
        # Save a layout with 2 widgets using coordinates
        self.client.put('/api/dashboard/layout/', {
            'widgets': [
                {'widget_id': 'active_engagements', 'col': 0, 'row': 0},
                {'widget_id': 'total_findings', 'col': 1, 'row': 0},
            ],
        }, format='json')

        resp = self.client.get('/api/dashboard/')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['layout']['customized'])
        # Should only return the 2 saved widgets
        self.assertEqual(len(resp.data['widgets']), 2)
        self.assertEqual(resp.data['widgets'][0]['id'], 'active_engagements')
        self.assertEqual(resp.data['widgets'][0]['col'], 0)
        self.assertEqual(resp.data['widgets'][0]['row'], 0)
        self.assertEqual(resp.data['widgets'][0]['col_span'], 1)
        self.assertEqual(resp.data['widgets'][1]['id'], 'total_findings')
        self.assertEqual(resp.data['widgets'][1]['col'], 1)
        self.assertEqual(resp.data['widgets'][1]['row'], 0)

    def test_dashboard_layout_respects_order(self):
        self.client.put('/api/dashboard/layout/', {
            'widgets': [
                {'widget_id': 'total_findings', 'col': 1, 'row': 0},
                {'widget_id': 'active_engagements', 'col': 0, 'row': 0},
            ],
        }, format='json')
        resp = self.client.get('/api/dashboard/')
        # Sorted by (row, col) — active_engagements (col=0) comes first
        self.assertEqual(resp.data['widgets'][0]['id'], 'active_engagements')
        self.assertEqual(resp.data['widgets'][1]['id'], 'total_findings')

    def test_dashboard_after_reset(self):
        self.client.put('/api/dashboard/layout/', {
            'widgets': [{'widget_id': 'active_engagements', 'col': 0, 'row': 0}],
        }, format='json')
        self.client.delete('/api/dashboard/layout/')
        resp = self.client.get('/api/dashboard/')
        self.assertFalse(resp.data['layout']['customized'])
        # Back to full default widgets
        self.assertTrue(len(resp.data['widgets']) > 1)
