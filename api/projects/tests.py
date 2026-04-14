import uuid

from rest_framework.test import APITestCase

from accounts.models import User
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from clients.models import Client
from core.test_utils import login_as
from engagements.models import Engagement, EngagementSetting, EngagementStakeholder, Sow
from tenancy.models import Tenant, TenantMember, TenantRole

from .models import Project


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
# Project CRUD Tests
# -----------------------------------------------------------------------

class ProjectCrudTests(APITestCase):
    """Test project CRUD endpoints on /api/projects/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.client_org = Client.objects.create(
            tenant=self.tenant, name='Test Client',
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _list_url(self):
        return '/api/projects/'

    def _detail_url(self, pk):
        return f'/api/projects/{pk}/'

    # ---------------------------------------------------------------
    # LIST
    # ---------------------------------------------------------------

    def test_list_returns_empty(self):
        self._auth_as(self.owner)
        response = self.client.get(self._list_url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_list_returns_projects(self):
        Project.objects.create(
            tenant=self.tenant, name='Project A', created_by=self.owner,
        )
        Project.objects.create(
            tenant=self.tenant, name='Project B', created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get(self._list_url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_list_includes_engagement_count(self):
        project = Project.objects.create(
            tenant=self.tenant, name='Project A', created_by=self.owner,
        )
        Engagement.objects.create(
            tenant=self.tenant, name='Eng 1', project=project, created_by=self.owner,
        )
        Engagement.objects.create(
            tenant=self.tenant, name='Eng 2', project=project, created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get(self._list_url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['engagement_count'], 2)

    def test_list_filter_by_client(self):
        other_client = Client.objects.create(
            tenant=self.tenant, name='Other Client',
        )
        Project.objects.create(
            tenant=self.tenant, name='Project A',
            client=self.client_org, created_by=self.owner,
        )
        Project.objects.create(
            tenant=self.tenant, name='Project B',
            client=other_client, created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get(self._list_url(), {'client': str(self.client_org.pk)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Project A')

    def test_list_filter_by_status(self):
        Project.objects.create(
            tenant=self.tenant, name='Active Project',
            status='active', created_by=self.owner,
        )
        Project.objects.create(
            tenant=self.tenant, name='Completed Project',
            status='completed', created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get(self._list_url(), {'status': 'completed'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Completed Project')

    # ---------------------------------------------------------------
    # CREATE
    # ---------------------------------------------------------------

    def test_create_project_with_engagement_types(self):
        self._auth_as(self.owner)
        response = self.client.post(self._list_url(), {
            'name': 'New Project',
            'client_id': str(self.client_org.pk),
            'engagement_types': ['web_app_pentest', 'external_pentest'],
            'start_date': '2026-01-01',
            'end_date': '2026-06-30',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['name'], 'New Project')
        self.assertEqual(response.data['client_name'], 'Test Client')
        self.assertEqual(response.data['status'], 'active')

        # Verify engagements were created
        project = Project.objects.get(pk=response.data['id'])
        engagements = Engagement.objects.filter(project=project)
        self.assertEqual(engagements.count(), 2)

        # Verify engagement names follow pattern
        eng_names = set(engagements.values_list('name', flat=True))
        self.assertIn('Test Client - Web App Pen Testing', eng_names)
        self.assertIn('Test Client - External Pen Testing', eng_names)

        # Verify SoW and EngagementSetting created for each engagement
        for eng in engagements:
            self.assertTrue(Sow.objects.filter(engagement=eng).exists())
            self.assertTrue(
                EngagementSetting.objects.filter(
                    engagement=eng, key='show_contact_info_on_report',
                ).exists()
            )

    def test_create_project_with_empty_engagement_types(self):
        self._auth_as(self.owner)
        response = self.client.post(self._list_url(), {
            'name': 'Empty Types Project',
            'engagement_types': [],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        project = Project.objects.get(pk=response.data['id'])
        self.assertEqual(Engagement.objects.filter(project=project).count(), 0)

    def test_create_project_without_client(self):
        self._auth_as(self.owner)
        response = self.client.post(self._list_url(), {
            'name': 'No Client Project',
            'engagement_types': ['general'],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['client_name'], '')
        self.assertIsNone(response.data['client_id'])

        # Engagement name falls back to project name
        project = Project.objects.get(pk=response.data['id'])
        eng = Engagement.objects.get(project=project)
        self.assertEqual(eng.name, 'No Client Project - General / Other')

    def test_create_project_missing_engagement_types_returns_400(self):
        self._auth_as(self.owner)
        response = self.client.post(self._list_url(), {
            'name': 'Missing Types',
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_create_project_invalid_engagement_type_returns_400(self):
        self._auth_as(self.owner)
        response = self.client.post(self._list_url(), {
            'name': 'Bad Type',
            'engagement_types': ['nonexistent_type'],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_create_engagement_inherits_project_dates(self):
        self._auth_as(self.owner)
        response = self.client.post(self._list_url(), {
            'name': 'Dated Project',
            'client_id': str(self.client_org.pk),
            'engagement_types': ['web_app_pentest'],
            'start_date': '2026-03-01',
            'end_date': '2026-09-30',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        project = Project.objects.get(pk=response.data['id'])
        eng = Engagement.objects.get(project=project)
        self.assertEqual(str(eng.start_date), '2026-03-01')
        self.assertEqual(str(eng.end_date), '2026-09-30')

    def test_create_engagement_inherits_client(self):
        self._auth_as(self.owner)
        response = self.client.post(self._list_url(), {
            'name': 'Client Project',
            'client_id': str(self.client_org.pk),
            'engagement_types': ['internal_pentest'],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        project = Project.objects.get(pk=response.data['id'])
        eng = Engagement.objects.get(project=project)
        self.assertEqual(eng.client_id, self.client_org.pk)
        self.assertEqual(eng.client_name, 'Test Client')

    # ---------------------------------------------------------------
    # RETRIEVE
    # ---------------------------------------------------------------

    def test_retrieve_returns_project_with_engagements(self):
        project = Project.objects.create(
            tenant=self.tenant, name='Detail Project',
            client=self.client_org, client_name='Test Client',
            created_by=self.owner,
        )
        Engagement.objects.create(
            tenant=self.tenant, name='Eng 1', project=project,
            engagement_type='web_app_pentest', created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get(self._detail_url(project.pk))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'Detail Project')
        self.assertIn('engagements', response.data)
        self.assertEqual(len(response.data['engagements']), 1)
        self.assertEqual(response.data['engagements'][0]['name'], 'Eng 1')

    def test_retrieve_nonexistent_returns_404(self):
        self._auth_as(self.owner)
        response = self.client.get(self._detail_url(uuid.uuid4()))
        self.assertEqual(response.status_code, 404)

    # ---------------------------------------------------------------
    # UPDATE (PATCH)
    # ---------------------------------------------------------------

    def test_patch_updates_project_name(self):
        project = Project.objects.create(
            tenant=self.tenant, name='Old Name', created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.patch(self._detail_url(project.pk), {
            'name': 'New Name',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['name'], 'New Name')

    def test_patch_updates_status(self):
        project = Project.objects.create(
            tenant=self.tenant, name='Project', created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.patch(self._detail_url(project.pk), {
            'status': 'completed',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'completed')

    def test_patch_updates_client_and_client_name(self):
        """When client is changed, client_name is derived from the new client."""
        project = Project.objects.create(
            tenant=self.tenant, name='Project',
            client=self.client_org, client_name='Test Client',
            created_by=self.owner,
        )
        new_client = Client.objects.create(
            tenant=self.tenant, name='New Client',
        )
        self._auth_as(self.owner)
        response = self.client.patch(self._detail_url(project.pk), {
            'client_id': str(new_client.pk),
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['client_name'], 'New Client')

    def test_patch_set_client_to_null(self):
        """Setting client to null clears client_name."""
        project = Project.objects.create(
            tenant=self.tenant, name='Project',
            client=self.client_org, client_name='Test Client',
            created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.patch(self._detail_url(project.pk), {
            'client_id': None,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['client_name'], '')

    def test_patch_nonexistent_returns_404(self):
        self._auth_as(self.owner)
        response = self.client.patch(self._detail_url(uuid.uuid4()), {
            'name': 'Nope',
        }, format='json')
        self.assertEqual(response.status_code, 404)

    # ---------------------------------------------------------------
    # DELETE
    # ---------------------------------------------------------------

    def test_delete_removes_project(self):
        project = Project.objects.create(
            tenant=self.tenant, name='Doomed', created_by=self.owner,
        )
        pk = project.pk
        self._auth_as(self.owner)
        response = self.client.delete(self._detail_url(pk))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Project.objects.filter(pk=pk).exists())

    def test_delete_nonexistent_returns_404(self):
        self._auth_as(self.owner)
        response = self.client.delete(self._detail_url(uuid.uuid4()))
        self.assertEqual(response.status_code, 404)


# -----------------------------------------------------------------------
# Ref Endpoint Tests
# -----------------------------------------------------------------------

class ProjectRefTests(APITestCase):
    """Test GET /api/projects/ref/ lightweight endpoint."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def test_ref_returns_lightweight_list(self):
        Project.objects.create(
            tenant=self.tenant, name='Alpha', created_by=self.owner,
        )
        Project.objects.create(
            tenant=self.tenant, name='Beta', created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get('/api/projects/ref/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        # Only id and name fields
        for item in response.data:
            self.assertIn('id', item)
            self.assertIn('name', item)
            self.assertNotIn('status', item)
            self.assertNotIn('engagement_count', item)

    def test_ref_returns_empty_when_no_projects(self):
        self._auth_as(self.owner)
        response = self.client.get('/api/projects/ref/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])


# -----------------------------------------------------------------------
# Add Engagement Action Tests
# -----------------------------------------------------------------------

class AddEngagementTests(APITestCase):
    """Test POST /api/projects/<id>/add-engagement/ action."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.client_org = Client.objects.create(
            tenant=self.tenant, name='Test Client',
        )
        self.project = Project.objects.create(
            tenant=self.tenant, name='Main Project',
            client=self.client_org, client_name='Test Client',
            start_date='2026-01-01', end_date='2026-12-31',
            created_by=self.owner,
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, pk=None):
        pk = pk or self.project.pk
        return f'/api/projects/{pk}/add-engagement/'

    def test_add_engagement_success(self):
        self._auth_as(self.owner)
        response = self.client.post(self._url(), {
            'engagement_type': 'web_app_pentest',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['engagement_type'], 'web_app_pentest')
        self.assertEqual(response.data['name'], 'Test Client - Web App Pen Testing')
        self.assertEqual(response.data['status'], 'planned')
        self.assertEqual(response.data['client_name'], 'Test Client')

        # Verify SoW and EngagementSetting created
        eng = Engagement.objects.get(pk=response.data['id'])
        self.assertTrue(Sow.objects.filter(engagement=eng).exists())
        self.assertTrue(
            EngagementSetting.objects.filter(
                engagement=eng, key='show_contact_info_on_report',
            ).exists()
        )

    def test_add_engagement_inherits_project_dates(self):
        self._auth_as(self.owner)
        response = self.client.post(self._url(), {
            'engagement_type': 'internal_pentest',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['start_date'], '2026-01-01')
        self.assertEqual(response.data['end_date'], '2026-12-31')

    def test_add_engagement_without_client_uses_project_name(self):
        project_no_client = Project.objects.create(
            tenant=self.tenant, name='Solo Project',
            client_name='', created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.post(
            f'/api/projects/{project_no_client.pk}/add-engagement/',
            {'engagement_type': 'general'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['name'], 'Solo Project - General / Other')

    def test_add_engagement_missing_type_returns_400(self):
        self._auth_as(self.owner)
        response = self.client.post(self._url(), {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('engagement_type is required', response.data['detail'])

    def test_add_engagement_invalid_type_returns_400(self):
        self._auth_as(self.owner)
        response = self.client.post(self._url(), {
            'engagement_type': 'totally_fake',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Invalid engagement type', response.data['detail'])

    def test_add_engagement_nonexistent_project_returns_404(self):
        self._auth_as(self.owner)
        response = self.client.post(
            f'/api/projects/{uuid.uuid4()}/add-engagement/',
            {'engagement_type': 'general'},
            format='json',
        )
        self.assertEqual(response.status_code, 404)


# -----------------------------------------------------------------------
# Permission Tests
# -----------------------------------------------------------------------

class ProjectPermissionTests(APITestCase):
    """Test RBAC enforcement on project endpoints."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        # Owner (bypasses permission checks)
        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        # Viewer (Collaborators group — only *.view permissions)
        self.viewer = _create_user(email='viewer@example.com')
        self.viewer_member = _create_membership(self.viewer, self.tenant, role=TenantRole.MEMBER)
        self.viewer_member.groups.add(self.groups['Collaborators'])

        # Analyst (Analysts group — no project.create/update/delete)
        self.analyst = _create_user(email='analyst@example.com')
        self.analyst_member = _create_membership(self.analyst, self.tenant, role=TenantRole.MEMBER)
        self.analyst_member.groups.add(self.groups['Analysts'])

        self.project = Project.objects.create(
            tenant=self.tenant, name='Visible Project', created_by=self.owner,
        )
        # Make project visible to scoped users by creating a stakeholder link
        eng = Engagement.objects.create(
            tenant=self.tenant, name='Linked Eng', project=self.project,
            created_by=self.owner,
        )
        EngagementStakeholder.objects.create(
            engagement=eng, member=self.viewer_member,
        )
        EngagementStakeholder.objects.create(
            engagement=eng, member=self.analyst_member,
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    # ---------------------------------------------------------------
    # Viewer — read-only
    # ---------------------------------------------------------------

    def test_viewer_can_list_projects(self):
        self._auth_as(self.viewer)
        response = self.client.get('/api/projects/')
        self.assertEqual(response.status_code, 200)

    def test_viewer_can_retrieve_project(self):
        self._auth_as(self.viewer)
        response = self.client.get(f'/api/projects/{self.project.pk}/')
        self.assertEqual(response.status_code, 200)

    def test_viewer_can_get_ref(self):
        self._auth_as(self.viewer)
        response = self.client.get('/api/projects/ref/')
        self.assertEqual(response.status_code, 200)

    def test_viewer_cannot_create_project(self):
        self._auth_as(self.viewer)
        response = self.client.post('/api/projects/', {
            'name': 'Hacked Project',
            'engagement_types': [],
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_update_project(self):
        self._auth_as(self.viewer)
        response = self.client.patch(f'/api/projects/{self.project.pk}/', {
            'name': 'Hacked',
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_delete_project(self):
        self._auth_as(self.viewer)
        response = self.client.delete(f'/api/projects/{self.project.pk}/')
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_add_engagement(self):
        self._auth_as(self.viewer)
        response = self.client.post(
            f'/api/projects/{self.project.pk}/add-engagement/',
            {'engagement_type': 'general'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    # ---------------------------------------------------------------
    # Analyst — no project write permissions
    # ---------------------------------------------------------------

    def test_analyst_cannot_create_project(self):
        self._auth_as(self.analyst)
        response = self.client.post('/api/projects/', {
            'name': 'Analyst Project',
            'engagement_types': [],
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_analyst_cannot_update_project(self):
        self._auth_as(self.analyst)
        response = self.client.patch(f'/api/projects/{self.project.pk}/', {
            'name': 'Analyst Edit',
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_analyst_cannot_delete_project(self):
        self._auth_as(self.analyst)
        response = self.client.delete(f'/api/projects/{self.project.pk}/')
        self.assertEqual(response.status_code, 403)

    # ---------------------------------------------------------------
    # Unauthenticated
    # ---------------------------------------------------------------

    def test_unauthenticated_returns_401(self):
        response = self.client.get('/api/projects/')
        self.assertEqual(response.status_code, 401)


# -----------------------------------------------------------------------
# Tenant Isolation Tests
# -----------------------------------------------------------------------

class ProjectTenantIsolationTests(APITestCase):
    """Verify projects from one tenant are not visible to another."""

    def setUp(self):
        seed_permissions()

        # Tenant A
        self.tenant_a = _create_tenant(name='Tenant A', slug='tenant-a')
        self.groups_a = create_default_groups_for_tenant(self.tenant_a)
        self.user_a = _create_user(email='usera@example.com')
        _create_membership(self.user_a, self.tenant_a, role=TenantRole.OWNER)

        # Tenant B
        self.tenant_b = _create_tenant(name='Tenant B', slug='tenant-b')
        self.groups_b = create_default_groups_for_tenant(self.tenant_b)
        self.user_b = _create_user(email='userb@example.com')
        _create_membership(self.user_b, self.tenant_b, role=TenantRole.OWNER)

        # Project in Tenant A
        self.project_a = Project.objects.create(
            tenant=self.tenant_a, name='Project A', created_by=self.user_a,
        )

    def test_tenant_b_cannot_list_tenant_a_projects(self):
        login_as(self.client, self.user_b, self.tenant_b)
        response = self.client.get('/api/projects/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

    def test_tenant_b_cannot_retrieve_tenant_a_project(self):
        login_as(self.client, self.user_b, self.tenant_b)
        response = self.client.get(f'/api/projects/{self.project_a.pk}/')
        self.assertEqual(response.status_code, 404)

    def test_tenant_b_cannot_update_tenant_a_project(self):
        login_as(self.client, self.user_b, self.tenant_b)
        response = self.client.patch(f'/api/projects/{self.project_a.pk}/', {
            'name': 'Hijacked',
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_tenant_b_cannot_delete_tenant_a_project(self):
        login_as(self.client, self.user_b, self.tenant_b)
        response = self.client.delete(f'/api/projects/{self.project_a.pk}/')
        self.assertEqual(response.status_code, 404)

    def test_tenant_b_cannot_add_engagement_to_tenant_a_project(self):
        login_as(self.client, self.user_b, self.tenant_b)
        response = self.client.post(
            f'/api/projects/{self.project_a.pk}/add-engagement/',
            {'engagement_type': 'general'},
            format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_tenant_b_ref_does_not_include_tenant_a(self):
        login_as(self.client, self.user_b, self.tenant_b)
        response = self.client.get('/api/projects/ref/')
        self.assertEqual(response.status_code, 200)
        ids = [item['id'] for item in response.data]
        self.assertNotIn(str(self.project_a.pk), ids)


# -----------------------------------------------------------------------
# Serializer Logic Tests
# -----------------------------------------------------------------------

class ProjectSerializerTests(APITestCase):
    """Test serializer-specific logic: engagement_count, client_name derivation."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.client_org = Client.objects.create(
            tenant=self.tenant, name='Serializer Client',
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def test_engagement_count_fallback_on_retrieve(self):
        """On retrieve (not list), engagement_count uses obj.engagements.count()."""
        project = Project.objects.create(
            tenant=self.tenant, name='Count Test', created_by=self.owner,
        )
        Engagement.objects.create(
            tenant=self.tenant, name='Eng 1', project=project, created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get(f'/api/projects/{project.pk}/')
        self.assertEqual(response.status_code, 200)
        # Detail view uses ProjectDetailSerializer which inherits engagement_count
        self.assertEqual(response.data['engagement_count'], 1)

    def test_client_name_readonly_on_create(self):
        """client_name is derived from client, not user-provided."""
        self._auth_as(self.owner)
        response = self.client.post('/api/projects/', {
            'name': 'Readonly Test',
            'client_id': str(self.client_org.pk),
            'engagement_types': [],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['client_name'], 'Serializer Client')

    def test_create_serializer_used_for_create_action(self):
        """Create returns fields from ProjectCreateSerializer (status defaults)."""
        self._auth_as(self.owner)
        response = self.client.post('/api/projects/', {
            'name': 'Default Status',
            'engagement_types': [],
        }, format='json')
        self.assertEqual(response.status_code, 201)
        # Status should default to 'active', not be settable
        self.assertEqual(response.data['status'], 'active')

    def test_create_ignores_status_override(self):
        """ProjectCreateSerializer makes status read-only on create."""
        self._auth_as(self.owner)
        response = self.client.post('/api/projects/', {
            'name': 'Status Override',
            'engagement_types': [],
            'status': 'completed',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        # Status should still be 'active' (model default), not 'completed'
        self.assertEqual(response.data['status'], 'active')

    def test_detail_serializer_includes_engagements(self):
        """Retrieve uses ProjectDetailSerializer which includes nested engagements."""
        project = Project.objects.create(
            tenant=self.tenant, name='Detail Test',
            client=self.client_org, client_name='Serializer Client',
            created_by=self.owner,
        )
        eng = Engagement.objects.create(
            tenant=self.tenant, name='Nested Eng',
            project=project, engagement_type='wifi',
            status='active', created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get(f'/api/projects/{project.pk}/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('engagements', response.data)
        self.assertEqual(len(response.data['engagements']), 1)
        eng_data = response.data['engagements'][0]
        self.assertEqual(eng_data['id'], str(eng.pk))
        self.assertEqual(eng_data['engagement_type'], 'wifi')
        self.assertEqual(eng_data['status'], 'active')
        self.assertIn('start_date', eng_data)
        self.assertIn('end_date', eng_data)
        self.assertIn('created_at', eng_data)

    def test_list_serializer_excludes_engagements(self):
        """List uses ProjectSerializer which does not include nested engagements."""
        Project.objects.create(
            tenant=self.tenant, name='List Test', created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get('/api/projects/')
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('engagements', response.data[0])

    def test_client_queryset_scoped_to_tenant(self):
        """Creating a project with a client from another tenant should fail."""
        other_tenant = _create_tenant(name='Other', slug='other')
        other_client = Client.objects.create(
            tenant=other_tenant, name='Foreign Client',
        )
        self._auth_as(self.owner)
        response = self.client.post('/api/projects/', {
            'name': 'Cross Tenant Client',
            'client_id': str(other_client.pk),
            'engagement_types': [],
        }, format='json')
        self.assertEqual(response.status_code, 400)
