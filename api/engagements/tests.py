import uuid

from rest_framework.test import APITestCase

from accounts.models import User
from authorization.seed import create_default_groups_for_tenant, seed_permissions
from core.test_utils import login_as
from tenancy.models import Tenant, TenantMember, TenantRole

from assets.models import Asset
from clients.models import Client

from .models import Engagement, EngagementStakeholder, Sow, SowAsset
from findings.models import Finding


STRONG_PASSWORD = 'Str0ngP@ss!99'


def _create_user(email='user@example.com', password=STRONG_PASSWORD, **kwargs):
    return User.objects.create_user(email=email, password=password, **kwargs)


def _create_tenant(name='Acme Corp', slug='acme-corp', **kwargs):
    return Tenant.objects.create(name=name, slug=slug, **kwargs)


def _create_membership(user, tenant, role=TenantRole.OWNER, is_active=True):
    return TenantMember.objects.create(
        tenant=tenant, user=user, role=role, is_active=is_active,
    )


class SowEndpointTests(APITestCase):
    """Test SoW CRUD endpoints on /api/engagements/<id>/sow/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        # Owner user (bypasses permission checks)
        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        # Viewer user (only *.view permissions)
        self.viewer = _create_user(email='viewer@example.com')
        self.viewer_member = _create_membership(self.viewer, self.tenant, role=TenantRole.MEMBER)
        self.viewer_member.groups.add(self.groups['Collaborators'])

        # Engagement
        self.engagement = Engagement.objects.create(
            tenant=self.tenant,
            name='Test Engagement',
            created_by=self.owner,
        )
        # Assign viewer as stakeholder so engagement-scoped access works
        EngagementStakeholder.objects.create(
            engagement=self.engagement, member=self.viewer_member,
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f'/api/engagements/{eid}/sow/'

    # ---------------------------------------------------------------
    # GET — retrieve
    # ---------------------------------------------------------------

    def test_get_returns_404_when_no_sow(self):
        self._auth_as(self.owner)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 404)

    def test_get_returns_sow_data(self):
        sow = Sow.objects.create(engagement=self.engagement, title='Test SoW')
        self._auth_as(self.owner)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['title'], 'Test SoW')
        self.assertEqual(response.data['status'], 'draft')
        self.assertIn('id', response.data)
        self.assertIn('created_at', response.data)
        self.assertIn('updated_at', response.data)

    # ---------------------------------------------------------------
    # POST — create
    # ---------------------------------------------------------------

    def test_post_creates_sow_with_defaults(self):
        self._auth_as(self.owner)
        response = self.client.post(self._url(), {}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['title'], '')
        self.assertEqual(response.data['status'], 'draft')

    def test_post_creates_sow_with_data(self):
        self._auth_as(self.owner)
        response = self.client.post(
            self._url(),
            {'title': 'My SoW', 'status': 'approved'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['title'], 'My SoW')
        self.assertEqual(response.data['status'], 'approved')

    def test_post_returns_409_if_sow_exists(self):
        Sow.objects.create(engagement=self.engagement, title='Existing')
        self._auth_as(self.owner)
        response = self.client.post(self._url(), {}, format='json')
        self.assertEqual(response.status_code, 409)

    # ---------------------------------------------------------------
    # PATCH — update
    # ---------------------------------------------------------------

    def test_patch_updates_sow(self):
        Sow.objects.create(engagement=self.engagement, title='Old Title')
        self._auth_as(self.owner)
        response = self.client.patch(
            self._url(),
            {'title': 'New Title', 'status': 'draft'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['title'], 'New Title')
        self.assertEqual(response.data['status'], 'draft')

    def test_patch_approve_with_no_scope_returns_400(self):
        """Cannot approve a SoW with zero scope assets."""
        Sow.objects.create(engagement=self.engagement, title='Empty Scope SoW')
        self._auth_as(self.owner)
        response = self.client.patch(
            self._url(),
            {'status': 'approved'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('detail', response.data)

    def test_patch_approve_with_scope_succeeds(self):
        """Can approve a SoW when at least one asset is in scope."""
        client_org = Client.objects.create(tenant=self.tenant, name='Test Client')
        self.engagement.client = client_org
        self.engagement.client_name = 'Test Client'
        self.engagement.save()
        sow = Sow.objects.create(engagement=self.engagement, title='Has Scope SoW')
        asset = Asset.objects.create(
            tenant=self.tenant, client=client_org,
            name='Web App', asset_type='webapp',
        )
        SowAsset.objects.create(sow=sow, asset=asset, in_scope=True)
        self._auth_as(self.owner)
        response = self.client.patch(
            self._url(),
            {'status': 'approved'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'approved')

    def test_patch_title_allowed_when_approved(self):
        """Can update title when SoW is approved (not a scope change)."""
        client_org = Client.objects.create(tenant=self.tenant, name='Test Client')
        self.engagement.client = client_org
        self.engagement.save()
        sow = Sow.objects.create(engagement=self.engagement, title='Approved SoW', status='approved')
        asset = Asset.objects.create(
            tenant=self.tenant, client=client_org,
            name='Web App', asset_type='webapp',
        )
        SowAsset.objects.create(sow=sow, asset=asset, in_scope=True)
        self._auth_as(self.owner)
        response = self.client.patch(
            self._url(),
            {'title': 'Updated Title'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['title'], 'Updated Title')

    def test_patch_returns_404_when_no_sow(self):
        self._auth_as(self.owner)
        response = self.client.patch(
            self._url(),
            {'title': 'Nope'},
            format='json',
        )
        self.assertEqual(response.status_code, 404)

    # ---------------------------------------------------------------
    # DELETE — destroy
    # ---------------------------------------------------------------

    def test_delete_removes_sow(self):
        Sow.objects.create(engagement=self.engagement, title='Doomed')
        self._auth_as(self.owner)
        response = self.client.delete(self._url())
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Sow.objects.filter(engagement=self.engagement).exists())

    def test_delete_returns_404_when_no_sow(self):
        self._auth_as(self.owner)
        response = self.client.delete(self._url())
        self.assertEqual(response.status_code, 404)

    # ---------------------------------------------------------------
    # Permission checks — viewer
    # ---------------------------------------------------------------

    def test_viewer_can_get_sow(self):
        Sow.objects.create(engagement=self.engagement, title='Visible')
        self._auth_as(self.viewer)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200)

    def test_viewer_cannot_post_sow(self):
        self._auth_as(self.viewer)
        response = self.client.post(self._url(), {}, format='json')
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_patch_sow(self):
        Sow.objects.create(engagement=self.engagement, title='Locked')
        self._auth_as(self.viewer)
        response = self.client.patch(
            self._url(),
            {'title': 'Hacked'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_delete_sow(self):
        Sow.objects.create(engagement=self.engagement, title='Safe')
        self._auth_as(self.viewer)
        response = self.client.delete(self._url())
        self.assertEqual(response.status_code, 403)

    # ---------------------------------------------------------------
    # Cross-tenant isolation
    # ---------------------------------------------------------------

    def test_cross_tenant_returns_404(self):
        other_tenant = _create_tenant(name='Other Corp', slug='other-corp')
        other_user = _create_user(email='other@example.com')
        _create_membership(other_user, other_tenant, role=TenantRole.OWNER)

        login_as(self.client, other_user, other_tenant)

        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 404)

    # ---------------------------------------------------------------
    # Nonexistent engagement
    # ---------------------------------------------------------------

    def test_nonexistent_engagement_returns_404(self):
        self._auth_as(self.owner)
        response = self.client.get(self._url(uuid.uuid4()))
        self.assertEqual(response.status_code, 404)


class ScopeEndpointTests(APITestCase):
    """Test scope endpoints on /api/engagements/<id>/scope/."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.viewer = _create_user(email='viewer@example.com')
        self.viewer_member = _create_membership(self.viewer, self.tenant, role=TenantRole.MEMBER)
        self.viewer_member.groups.add(self.groups['Collaborators'])

        self.client_org = Client.objects.create(
            tenant=self.tenant, name='Test Client',
        )
        self.engagement = Engagement.objects.create(
            tenant=self.tenant,
            name='Test Engagement',
            client=self.client_org,
            client_name='Test Client',
            created_by=self.owner,
        )
        self.sow = Sow.objects.create(
            engagement=self.engagement, title='Test SoW',
        )
        self.asset = Asset.objects.create(
            tenant=self.tenant,
            client=self.client_org,
            name='Web Server',
            asset_type='host',
            target='192.168.1.1',
        )
        # Assign viewer as stakeholder so engagement-scoped access works
        EngagementStakeholder.objects.create(
            engagement=self.engagement, member=self.viewer_member,
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _scope_url(self, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f'/api/engagements/{eid}/scope/'

    def _scope_remove_url(self, asset_id, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f'/api/engagements/{eid}/scope/{asset_id}/'

    # ---------------------------------------------------------------
    # GET — list scope (empty)
    # ---------------------------------------------------------------

    def test_list_scope_empty(self):
        self._auth_as(self.owner)
        response = self.client.get(self._scope_url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    # ---------------------------------------------------------------
    # POST — add asset to scope
    # ---------------------------------------------------------------

    def test_add_asset_to_scope(self):
        self._auth_as(self.owner)
        response = self.client.post(
            self._scope_url(),
            {'asset_id': str(self.asset.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['name'], 'Web Server')
        self.assertTrue(SowAsset.objects.filter(sow=self.sow, asset=self.asset).exists())

    def test_add_duplicate_returns_409(self):
        SowAsset.objects.create(sow=self.sow, asset=self.asset, in_scope=True)
        self._auth_as(self.owner)
        response = self.client.post(
            self._scope_url(),
            {'asset_id': str(self.asset.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, 409)

    def test_add_wrong_client_returns_400(self):
        other_client = Client.objects.create(
            tenant=self.tenant, name='Other Client',
        )
        other_asset = Asset.objects.create(
            tenant=self.tenant,
            client=other_client,
            name='Other Asset',
            asset_type='webapp',
        )
        self._auth_as(self.owner)
        response = self.client.post(
            self._scope_url(),
            {'asset_id': str(other_asset.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_add_nonexistent_asset_returns_404(self):
        self._auth_as(self.owner)
        response = self.client.post(
            self._scope_url(),
            {'asset_id': str(uuid.uuid4())},
            format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_add_missing_asset_id_returns_400(self):
        self._auth_as(self.owner)
        response = self.client.post(self._scope_url(), {}, format='json')
        self.assertEqual(response.status_code, 400)

    # ---------------------------------------------------------------
    # GET — list scope (with assets)
    # ---------------------------------------------------------------

    def test_list_scope_returns_assets(self):
        SowAsset.objects.create(sow=self.sow, asset=self.asset, in_scope=True)
        self._auth_as(self.owner)
        response = self.client.get(self._scope_url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['name'], 'Web Server')

    # ---------------------------------------------------------------
    # DELETE — remove asset from scope
    # ---------------------------------------------------------------

    def test_remove_asset_from_scope(self):
        SowAsset.objects.create(sow=self.sow, asset=self.asset, in_scope=True)
        self._auth_as(self.owner)
        response = self.client.delete(self._scope_remove_url(self.asset.pk))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(SowAsset.objects.filter(sow=self.sow, asset=self.asset).exists())

    def test_remove_nonexistent_returns_204(self):
        self._auth_as(self.owner)
        response = self.client.delete(self._scope_remove_url(uuid.uuid4()))
        self.assertEqual(response.status_code, 204)

    # ---------------------------------------------------------------
    # Scope locked when SoW is approved
    # ---------------------------------------------------------------

    def test_add_scope_blocked_when_sow_approved(self):
        """Cannot add assets when SoW is approved."""
        self.sow.status = 'approved'
        self.sow.save()
        self._auth_as(self.owner)
        response = self.client.post(
            self._scope_url(),
            {'asset_id': str(self.asset.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('approved', response.data['detail'].lower())

    def test_remove_scope_blocked_when_sow_approved(self):
        """Cannot remove assets when SoW is approved."""
        SowAsset.objects.create(sow=self.sow, asset=self.asset, in_scope=True)
        self.sow.status = 'approved'
        self.sow.save()
        self._auth_as(self.owner)
        response = self.client.delete(self._scope_remove_url(self.asset.pk))
        self.assertEqual(response.status_code, 400)
        self.assertIn('approved', response.data['detail'].lower())

    def test_add_scope_allowed_when_sow_draft(self):
        """Can add assets when SoW is in draft status."""
        self.sow.status = 'draft'
        self.sow.save()
        self._auth_as(self.owner)
        response = self.client.post(
            self._scope_url(),
            {'asset_id': str(self.asset.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, 201)

    def test_scope_allowed_after_reverting_to_draft(self):
        """Scope changes allowed after reverting SoW from approved to draft."""
        SowAsset.objects.create(sow=self.sow, asset=self.asset, in_scope=True)
        self.sow.status = 'approved'
        self.sow.save()
        # Revert to draft
        self.sow.status = 'draft'
        self.sow.save()
        asset2 = Asset.objects.create(
            tenant=self.tenant, client=self.client_org,
            name='API Server', asset_type='api',
            target='api.example.com',
        )
        self._auth_as(self.owner)
        response = self.client.post(
            self._scope_url(),
            {'asset_id': str(asset2.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, 201)

    # ---------------------------------------------------------------
    # No SoW — returns 404
    # ---------------------------------------------------------------

    def test_scope_no_sow_returns_404(self):
        engagement2 = Engagement.objects.create(
            tenant=self.tenant,
            name='No SoW Engagement',
            created_by=self.owner,
        )
        self._auth_as(self.owner)
        response = self.client.get(self._scope_url(engagement2.pk))
        self.assertEqual(response.status_code, 404)

    # ---------------------------------------------------------------
    # Permission checks — viewer
    # ---------------------------------------------------------------

    def test_viewer_can_list_scope(self):
        self._auth_as(self.viewer)
        response = self.client.get(self._scope_url())
        self.assertEqual(response.status_code, 200)

    def test_viewer_cannot_add_scope(self):
        self._auth_as(self.viewer)
        response = self.client.post(
            self._scope_url(),
            {'asset_id': str(self.asset.pk)},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_viewer_cannot_remove_scope(self):
        SowAsset.objects.create(sow=self.sow, asset=self.asset, in_scope=True)
        self._auth_as(self.viewer)
        response = self.client.delete(self._scope_remove_url(self.asset.pk))
        self.assertEqual(response.status_code, 403)

    # ---------------------------------------------------------------
    # Cross-tenant isolation
    # ---------------------------------------------------------------

    def test_cross_tenant_scope_returns_404(self):
        other_tenant = _create_tenant(name='Other Corp', slug='other-corp')
        other_user = _create_user(email='other@example.com')
        _create_membership(other_user, other_tenant, role=TenantRole.OWNER)

        login_as(self.client, other_user, other_tenant)

        response = self.client.get(self._scope_url())
        self.assertEqual(response.status_code, 404)


class FindingCreateSowGateTests(APITestCase):
    """Test that POST /api/engagements/<id>/findings/ enforces SoW approval."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        # Owner user (bypasses permission checks)
        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        # Client org
        self.client_org = Client.objects.create(
            tenant=self.tenant, name='Test Client',
        )

        # Engagement with client
        self.engagement = Engagement.objects.create(
            tenant=self.tenant,
            name='Test Engagement',
            client=self.client_org,
            client_name='Test Client',
            created_by=self.owner,
        )

        # SoW in draft status
        self.sow = Sow.objects.create(
            engagement=self.engagement, title='Test SoW', status='draft',
        )

        # Asset belonging to the same client
        self.asset = Asset.objects.create(
            tenant=self.tenant,
            client=self.client_org,
            name='Web App',
            asset_type='webapp',
        )

        # Asset in scope
        SowAsset.objects.create(sow=self.sow, asset=self.asset, in_scope=True)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f'/api/engagements/{eid}/findings/'

    def _finding_payload(self):
        return {
            'title': 'XSS in Search',
            'severity': 'medium',
            'assessment_area': 'application_security',
            'status': 'open',
            'asset_id': str(self.asset.pk),
        }

    # ---------------------------------------------------------------
    # SoW gate: draft → blocked
    # ---------------------------------------------------------------

    def test_create_finding_blocked_when_sow_is_draft(self):
        """Finding creation returns 400 when SoW exists but is not approved."""
        self._auth_as(self.owner)
        response = self.client.post(
            self._url(), self._finding_payload(), format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('approved', response.data['detail'].lower())

    # ---------------------------------------------------------------
    # SoW gate: no SoW → blocked
    # ---------------------------------------------------------------

    def test_create_finding_blocked_when_no_sow(self):
        """Finding creation returns 400 when no SoW exists at all."""
        self.sow.delete()
        self._auth_as(self.owner)
        response = self.client.post(
            self._url(), self._finding_payload(), format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('statement of work', response.data['detail'].lower())

    # ---------------------------------------------------------------
    # SoW gate: approved → allowed
    # ---------------------------------------------------------------

    def test_create_finding_allowed_when_sow_approved(self):
        """Finding creation succeeds (201) when SoW is approved."""
        self.sow.status = 'approved'
        self.sow.save()
        self._auth_as(self.owner)
        response = self.client.post(
            self._url(), self._finding_payload(), format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['title'], 'XSS in Search')
        self.assertTrue(
            Finding.objects.filter(
                engagement=self.engagement, title='XSS in Search',
            ).exists()
        )


class FindingDraftAndScopeTests(APITestCase):
    """Test draft finding creation, out-of-scope rejection, and draft filtering."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.client_org = Client.objects.create(
            tenant=self.tenant, name='Test Client',
        )
        self.engagement = Engagement.objects.create(
            tenant=self.tenant,
            name='Test Engagement',
            client=self.client_org,
            client_name='Test Client',
            created_by=self.owner,
        )
        self.sow = Sow.objects.create(
            engagement=self.engagement, title='Test SoW', status='approved',
        )
        self.asset_in_scope = Asset.objects.create(
            tenant=self.tenant,
            client=self.client_org,
            name='In Scope App',
            asset_type='webapp',
        )
        SowAsset.objects.create(sow=self.sow, asset=self.asset_in_scope, in_scope=True)

        self.asset_out_of_scope = Asset.objects.create(
            tenant=self.tenant,
            client=self.client_org,
            name='Out Of Scope App',
            asset_type='webapp',
        )

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self, engagement_id=None):
        eid = engagement_id or self.engagement.pk
        return f'/api/engagements/{eid}/findings/'

    # ---------------------------------------------------------------
    # #4: Draft finding without asset_id succeeds
    # ---------------------------------------------------------------

    def test_create_draft_finding_without_asset_id(self):
        """Creating a draft finding with is_draft=True and no asset_id should succeed."""
        self._auth_as(self.owner)
        response = self.client.post(
            self._url(),
            {
                'title': 'Draft Finding',
                'severity': 'medium',
                'assessment_area': 'application_security',
                'status': 'open',
                'is_draft': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['is_draft'])
        self.assertIsNone(response.data['asset_id'])

    # ---------------------------------------------------------------
    # #5: Non-draft finding with out-of-scope asset fails
    # ---------------------------------------------------------------

    def test_create_non_draft_finding_with_out_of_scope_asset(self):
        """Creating a non-draft finding with an out-of-scope asset should fail."""
        self._auth_as(self.owner)
        response = self.client.post(
            self._url(),
            {
                'title': 'Bad Finding',
                'severity': 'high',
                'assessment_area': 'network_security',
                'status': 'open',
                'asset_id': str(self.asset_out_of_scope.pk),
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('not in scope', response.data['detail'].lower())

    # ---------------------------------------------------------------
    # #8: List findings excludes drafts by default
    # ---------------------------------------------------------------

    def test_list_findings_excludes_drafts_by_default(self):
        """Listing findings without ?include_drafts should exclude draft findings."""
        self._auth_as(self.owner)
        # Create a normal finding
        Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            asset=self.asset_in_scope, title='Normal Finding',
            severity='high', status='open', is_draft=False, created_by=self.owner,
        )
        # Create a draft finding
        Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            title='Draft Finding', severity='medium', status='open',
            is_draft=True, created_by=self.owner,
        )

        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200)
        titles = [f['title'] for f in response.data]
        self.assertIn('Normal Finding', titles)
        self.assertNotIn('Draft Finding', titles)

    # ---------------------------------------------------------------
    # #9: List findings with include_drafts=true includes drafts
    # ---------------------------------------------------------------

    def test_list_findings_with_include_drafts(self):
        """Listing findings with ?include_drafts=true should include draft findings."""
        self._auth_as(self.owner)
        Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            asset=self.asset_in_scope, title='Normal Finding',
            severity='high', status='open', is_draft=False, created_by=self.owner,
        )
        Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            title='Draft Finding', severity='medium', status='open',
            is_draft=True, created_by=self.owner,
        )

        response = self.client.get(self._url() + '?include_drafts=true')
        self.assertEqual(response.status_code, 200)
        titles = [f['title'] for f in response.data]
        self.assertIn('Normal Finding', titles)
        self.assertIn('Draft Finding', titles)

    # ---------------------------------------------------------------
    # #10: Filter findings by status
    # ---------------------------------------------------------------

    def test_filter_findings_by_status_open(self):
        """Filtering findings with ?status=open should return only open findings.

        Regression: the ?status param was also applied to the engagement
        queryset in get_queryset(), causing 404 because 'open' is not a
        valid engagement status.
        """
        self._auth_as(self.owner)
        Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            asset=self.asset_in_scope, title='Open Finding',
            severity='high', status='open', is_draft=False, created_by=self.owner,
        )
        Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            asset=self.asset_in_scope, title='Fixed Finding',
            severity='medium', status='fixed', is_draft=False, created_by=self.owner,
        )
        Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            asset=self.asset_in_scope, title='Triage Finding',
            severity='low', status='triage', is_draft=False, created_by=self.owner,
        )

        response = self.client.get(self._url() + '?status=open&include_drafts=true')
        self.assertEqual(response.status_code, 200)
        titles = [f['title'] for f in response.data]
        self.assertIn('Open Finding', titles)
        self.assertNotIn('Fixed Finding', titles)
        self.assertNotIn('Triage Finding', titles)
        self.assertEqual(len(response.data), 1)

    def test_filter_findings_by_severity(self):
        """Filtering findings with ?severity=high should return only high findings."""
        self._auth_as(self.owner)
        Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            asset=self.asset_in_scope, title='High Finding',
            severity='high', status='open', is_draft=False, created_by=self.owner,
        )
        Finding.objects.create(
            tenant=self.tenant, engagement=self.engagement,
            asset=self.asset_in_scope, title='Low Finding',
            severity='low', status='open', is_draft=False, created_by=self.owner,
        )

        response = self.client.get(self._url() + '?severity=high&include_drafts=true')
        self.assertEqual(response.status_code, 200)
        titles = [f['title'] for f in response.data]
        self.assertIn('High Finding', titles)
        self.assertNotIn('Low Finding', titles)


class FindingPermissionTests(APITestCase):
    """Test finding RBAC: members need explicit permissions."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.client_org = Client.objects.create(
            tenant=self.tenant, name='Test Client',
        )
        self.engagement = Engagement.objects.create(
            tenant=self.tenant,
            name='Test Engagement',
            client=self.client_org,
            client_name='Test Client',
            created_by=self.owner,
        )
        self.sow = Sow.objects.create(
            engagement=self.engagement, title='Test SoW', status='approved',
        )
        self.asset = Asset.objects.create(
            tenant=self.tenant,
            client=self.client_org,
            name='Web App',
            asset_type='webapp',
        )
        SowAsset.objects.create(sow=self.sow, asset=self.asset, in_scope=True)

        # Member with NO finding permissions (only engagement.view to reach the endpoint)
        self.no_perms_user = _create_user(email='noperm@example.com')
        self.no_perms_member = _create_membership(
            self.no_perms_user, self.tenant, role=TenantRole.MEMBER,
        )
        # Assign only engagement.view so the user can hit the engagement but not findings
        from authorization.models import Permission, TenantGroup
        group = TenantGroup.objects.create(tenant=self.tenant, name='No Finding Perms')
        perm = Permission.objects.get(codename='engagement.view')
        group.permissions.add(perm)
        self.no_perms_member.groups.add(group)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    def _url(self):
        return f'/api/engagements/{self.engagement.pk}/findings/'

    def test_member_without_finding_create_cannot_create(self):
        """A member without finding.create cannot create findings."""
        self._auth_as(self.no_perms_user)
        response = self.client.post(
            self._url(),
            {
                'title': 'Unauthorized Finding',
                'severity': 'high',
                'status': 'open',
                'asset_id': str(self.asset.pk),
            },
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_member_without_finding_view_cannot_list(self):
        """A member without finding.view cannot list findings."""
        self._auth_as(self.no_perms_user)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 403)


class EngagementCreateAndFilterTests(APITestCase):
    """Test engagement create defaults and list filters."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    # ---------------------------------------------------------------
    # #2: Status always PLANNED on create
    # ---------------------------------------------------------------

    def test_create_engagement_status_always_planned(self):
        """Creating an engagement with status='active' should still return status='planned'."""
        self._auth_as(self.owner)
        response = self.client.post(
            '/api/engagements/',
            {'name': 'New Engagement', 'status': 'active'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], 'planned')

    # ---------------------------------------------------------------
    # #4: List engagement filters by status and client
    # ---------------------------------------------------------------

    def test_list_engagements_filter_by_status(self):
        """Filter engagements by ?status= query param."""
        self._auth_as(self.owner)
        e1 = Engagement.objects.create(
            tenant=self.tenant, name='Planned One',
            status='planned', created_by=self.owner,
        )
        e2 = Engagement.objects.create(
            tenant=self.tenant, name='Active One',
            status='active', created_by=self.owner,
        )

        response = self.client.get('/api/engagements/?status=active')
        self.assertEqual(response.status_code, 200)
        names = [e['name'] for e in response.data]
        self.assertIn('Active One', names)
        self.assertNotIn('Planned One', names)

    def test_list_engagements_filter_by_client(self):
        """Filter engagements by ?client= query param."""
        self._auth_as(self.owner)
        client_a = Client.objects.create(tenant=self.tenant, name='Client A')
        client_b = Client.objects.create(tenant=self.tenant, name='Client B')

        Engagement.objects.create(
            tenant=self.tenant, name='Eng A',
            client=client_a, client_name='Client A', created_by=self.owner,
        )
        Engagement.objects.create(
            tenant=self.tenant, name='Eng B',
            client=client_b, client_name='Client B', created_by=self.owner,
        )

        response = self.client.get(f'/api/engagements/?client={client_a.pk}')
        self.assertEqual(response.status_code, 200)
        names = [e['name'] for e in response.data]
        self.assertIn('Eng A', names)
        self.assertNotIn('Eng B', names)


class EngagementSettingsTests(APITestCase):
    """Test engagement-level settings endpoints."""

    def setUp(self):
        seed_permissions()
        self.tenant = _create_tenant()
        self.groups = create_default_groups_for_tenant(self.tenant)

        self.owner = _create_user(email='owner@example.com')
        self.owner_member = _create_membership(self.owner, self.tenant, role=TenantRole.OWNER)

        self.viewer = _create_user(email='viewer@example.com')
        self.viewer_member = _create_membership(self.viewer, self.tenant, role=TenantRole.MEMBER)
        self.viewer_member.groups.add(self.groups['Collaborators'])

        self.analyst = _create_user(email='analyst@example.com')
        self.analyst_member = _create_membership(self.analyst, self.tenant, role=TenantRole.MEMBER)
        self.analyst_member.groups.add(self.groups['Analysts'])

        self.engagement = Engagement.objects.create(
            tenant=self.tenant,
            name='Test Engagement',
            created_by=self.owner,
        )
        # Assign viewer and analyst as stakeholders so engagement-scoped access works
        EngagementStakeholder.objects.create(
            engagement=self.engagement, member=self.viewer_member,
        )
        EngagementStakeholder.objects.create(
            engagement=self.engagement, member=self.analyst_member,
        )
        self.url = f'/api/engagements/{self.engagement.pk}/settings/'

    def _auth_as(self, user):
        login_as(self.client, user, self.tenant)

    # -- LIST --

    def test_list_returns_all_definitions_with_defaults(self):
        self._auth_as(self.owner)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        keys = [s['key'] for s in response.data]
        self.assertIn('show_contact_info_on_report', keys)
        self.assertIn('default_severity_threshold', keys)
        self.assertIn('report_footer_text', keys)
        # All should have defaults, none stored yet
        for s in response.data:
            self.assertFalse(s['has_value'])

    def test_list_includes_choices_for_choice_type(self):
        self._auth_as(self.owner)
        response = self.client.get(self.url)
        severity = next(s for s in response.data if s['key'] == 'default_severity_threshold')
        self.assertEqual(severity['setting_type'], 'choice')
        self.assertEqual(list(severity['choices']), ['info', 'low', 'medium', 'high', 'critical'])

    def test_list_no_choices_for_boolean_type(self):
        self._auth_as(self.owner)
        response = self.client.get(self.url)
        boolean_setting = next(s for s in response.data if s['key'] == 'show_contact_info_on_report')
        self.assertNotIn('choices', boolean_setting)

    def test_list_analyst_allowed(self):
        self._auth_as(self.analyst)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

    def test_list_viewer_denied(self):
        self._auth_as(self.viewer)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 403)

    # -- UPSERT boolean --

    def test_upsert_boolean_setting(self):
        self._auth_as(self.owner)
        response = self.client.put(self.url, {'key': 'show_contact_info_on_report', 'value': 'false'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['value'], 'false')
        self.assertTrue(response.data['has_value'])

    def test_upsert_boolean_rejects_invalid_value(self):
        self._auth_as(self.owner)
        response = self.client.put(self.url, {'key': 'show_contact_info_on_report', 'value': 'yes'})
        self.assertEqual(response.status_code, 400)

    # -- UPSERT choice --

    def test_upsert_choice_setting(self):
        self._auth_as(self.owner)
        response = self.client.put(self.url, {'key': 'default_severity_threshold', 'value': 'high'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['value'], 'high')
        self.assertIn('choices', response.data)

    def test_upsert_choice_rejects_invalid_value(self):
        self._auth_as(self.owner)
        response = self.client.put(self.url, {'key': 'default_severity_threshold', 'value': 'extreme'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('Invalid choice', response.data['detail'])

    # -- UPSERT text --

    def test_upsert_text_setting(self):
        self._auth_as(self.owner)
        response = self.client.put(self.url, {'key': 'report_footer_text', 'value': 'Confidential'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['value'], 'Confidential')

    # -- Unknown key --

    def test_upsert_unknown_key_rejected(self):
        self._auth_as(self.owner)
        response = self.client.put(self.url, {'key': 'nonexistent', 'value': 'x'})
        self.assertEqual(response.status_code, 400)

    # -- Missing value --

    def test_upsert_missing_value_rejected(self):
        self._auth_as(self.owner)
        response = self.client.put(self.url, {'key': 'report_footer_text'})
        self.assertEqual(response.status_code, 400)

    # -- Permission: viewer cannot upsert --

    def test_viewer_cannot_upsert(self):
        self._auth_as(self.viewer)
        response = self.client.put(self.url, {'key': 'show_contact_info_on_report', 'value': 'false'})
        self.assertEqual(response.status_code, 403)

    # -- Update existing --

    def test_upsert_updates_existing_value(self):
        self._auth_as(self.owner)
        self.client.put(self.url, {'key': 'report_footer_text', 'value': 'Draft'})
        response = self.client.put(self.url, {'key': 'report_footer_text', 'value': 'Final'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['value'], 'Final')

    # -- List reflects stored values --

    def test_list_reflects_stored_value(self):
        self._auth_as(self.owner)
        self.client.put(self.url, {'key': 'default_severity_threshold', 'value': 'critical'})
        response = self.client.get(self.url)
        severity = next(s for s in response.data if s['key'] == 'default_severity_threshold')
        self.assertEqual(severity['value'], 'critical')
        self.assertTrue(severity['has_value'])
