"""Tests for the background jobs service and views."""

import uuid
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.test_utils import login_as
from jobs.models import BackgroundJob
from jobs.service import (
    FAILED,
    PENDING,
    PROCESSING,
    READY,
    STALE_THRESHOLD_SECONDS,
    JobService,
    get_job_service,
)
from tenancy.models import Tenant


# ---------------------------------------------------------------------------
# Service tests (uses real PostgreSQL via Django test framework)
# ---------------------------------------------------------------------------

class JobServiceTests(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Test', slug='test')
        self.svc = JobService()

    def test_create_job_returns_pending(self):
        job = self.svc.create_job(
            tenant_id=str(self.tenant.id),
            job_type='export_data',
        )

        self.assertEqual(job['tenant_id'], str(self.tenant.id))
        self.assertEqual(job['job_type'], 'export_data')
        self.assertEqual(job['status'], PENDING)
        self.assertIn('job_id', job)
        self.assertIn('created_at', job)
        self.assertIn('expires_at', job)

    def test_create_job_with_params(self):
        job = self.svc.create_job(
            tenant_id=str(self.tenant.id),
            job_type='export_data',
            params={'password': 'secret'},
        )

        self.assertEqual(job['params'], {'password': 'secret'})

    def test_create_job_generates_unique_ids(self):
        job1 = self.svc.create_job(str(self.tenant.id), 'export_data')
        job2 = self.svc.create_job(str(self.tenant.id), 'export_data')
        self.assertNotEqual(job1['job_id'], job2['job_id'])

    def test_get_job_returns_item(self):
        job = self.svc.create_job(str(self.tenant.id), 'export_data')

        result = self.svc.get_job(str(self.tenant.id), job['job_id'])

        self.assertIsNotNone(result)
        self.assertEqual(result['job_id'], job['job_id'])

    def test_get_job_returns_none_for_missing(self):
        result = self.svc.get_job(str(self.tenant.id), str(uuid.uuid4()))
        self.assertIsNone(result)

    def test_update_status_to_processing(self):
        job = self.svc.create_job(str(self.tenant.id), 'export_data')

        result = self.svc.update_status(str(self.tenant.id), job['job_id'], PROCESSING)

        self.assertEqual(result['status'], PROCESSING)
        self.assertIsNotNone(result['started_at'])

    def test_update_status_to_ready_with_result(self):
        job = self.svc.create_job(str(self.tenant.id), 'export_data')

        result = self.svc.update_status(
            str(self.tenant.id), job['job_id'], READY,
            result={'download_url': 'https://example.com/file.zip'},
        )

        self.assertEqual(result['status'], READY)
        self.assertEqual(result['result']['download_url'], 'https://example.com/file.zip')
        self.assertIsNotNone(result['completed_at'])

    def test_update_status_to_failed_with_error(self):
        job = self.svc.create_job(str(self.tenant.id), 'export_data')

        result = self.svc.update_status(
            str(self.tenant.id), job['job_id'], FAILED,
            error='Something went wrong',
        )

        self.assertEqual(result['status'], FAILED)
        self.assertEqual(result['error_message'], 'Something went wrong')

    def test_update_status_rejects_invalid(self):
        job = self.svc.create_job(str(self.tenant.id), 'export_data')

        with self.assertRaises(ValueError):
            self.svc.update_status(str(self.tenant.id), job['job_id'], 'INVALID')

    def test_list_jobs(self):
        self.svc.create_job(str(self.tenant.id), 'export_data')
        self.svc.create_job(str(self.tenant.id), 'export_data')

        jobs = self.svc.list_jobs(str(self.tenant.id))

        self.assertEqual(len(jobs), 2)

    def test_list_jobs_filters_by_type(self):
        self.svc.create_job(str(self.tenant.id), 'export_data')
        self.svc.create_job(str(self.tenant.id), 'closure_execute')

        jobs = self.svc.list_jobs(str(self.tenant.id), job_type='export_data')

        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]['job_type'], 'export_data')

    def test_list_jobs_filters_by_status(self):
        job = self.svc.create_job(str(self.tenant.id), 'export_data')
        self.svc.update_status(str(self.tenant.id), job['job_id'], PROCESSING)
        self.svc.create_job(str(self.tenant.id), 'export_data')

        jobs = self.svc.list_jobs(str(self.tenant.id), status=PROCESSING)

        self.assertEqual(len(jobs), 1)

    def test_get_latest_job_returns_most_recent(self):
        self.svc.create_job(str(self.tenant.id), 'export_data')
        job2 = self.svc.create_job(str(self.tenant.id), 'export_data')

        latest = self.svc.get_latest_job(str(self.tenant.id), 'export_data')

        self.assertIsNotNone(latest)
        self.assertEqual(latest['job_id'], job2['job_id'])

    def test_get_latest_job_returns_none_when_empty(self):
        latest = self.svc.get_latest_job(str(self.tenant.id), 'export_data')
        self.assertIsNone(latest)

    def test_mark_stale_jobs(self):
        job = self.svc.create_job(str(self.tenant.id), 'export_data')
        self.svc.update_status(str(self.tenant.id), job['job_id'], PROCESSING)

        # Manually backdate the updated_at to make it stale
        BackgroundJob.objects.filter(id=job['job_id']).update(
            updated_at=timezone.now() - timedelta(seconds=STALE_THRESHOLD_SECONDS + 60),
        )

        stale_ids = self.svc.mark_stale_jobs(str(self.tenant.id))

        self.assertEqual(len(stale_ids), 1)
        refreshed = self.svc.get_job(str(self.tenant.id), job['job_id'])
        self.assertEqual(refreshed['status'], FAILED)

    def test_cleanup_expired(self):
        job = self.svc.create_job(str(self.tenant.id), 'export_data', ttl_seconds=1)

        # Backdate expires_at
        BackgroundJob.objects.filter(id=job['job_id']).update(
            expires_at=timezone.now() - timedelta(seconds=60),
        )

        JobService.cleanup_expired()

        self.assertIsNone(self.svc.get_job(str(self.tenant.id), job['job_id']))

    def test_tenant_isolation(self):
        tenant_b = Tenant.objects.create(name='Other', slug='other')
        self.svc.create_job(str(self.tenant.id), 'export_data')
        self.svc.create_job(str(tenant_b.id), 'export_data')

        jobs_a = self.svc.list_jobs(str(self.tenant.id))
        jobs_b = self.svc.list_jobs(str(tenant_b.id))

        self.assertEqual(len(jobs_a), 1)
        self.assertEqual(len(jobs_b), 1)


# ---------------------------------------------------------------------------
# View tests
# ---------------------------------------------------------------------------

class JobViewTests(TestCase):

    def setUp(self):
        from accounts.models import User
        from tenancy.models import TenantMember

        self.tenant = Tenant.objects.create(name='Test', slug='test')
        self.user = User.objects.create_user(
            email='test@example.com', password='testpass123',
        )
        TenantMember.objects.create(
            tenant=self.tenant, user=self.user, is_active=True,
        )

        self.client = APIClient()
        login_as(self.client, self.user, self.tenant)

    @patch('jobs.views.get_job_service')
    def test_list_jobs(self, MockService):
        mock_svc = MockService.return_value
        mock_svc.list_jobs.return_value = [
            {
                'tenant_id': str(self.tenant.id),
                'job_id': 'job-1',
                'job_type': 'export_data',
                'status': 'PENDING',
                'created_at': '2026-03-07T12:00:00+00:00',
                'updated_at': '2026-03-07T12:00:00+00:00',
                'expires_at': '2026-03-14T12:00:00+00:00',
            },
        ]
        mock_svc.mark_stale_jobs.return_value = []

        resp = self.client.get('/api/jobs/')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]['job_id'], 'job-1')
        self.assertEqual(resp.data[0]['status'], 'PENDING')

    @patch('jobs.views.get_job_service')
    def test_list_jobs_filters(self, MockService):
        mock_svc = MockService.return_value
        mock_svc.list_jobs.return_value = []
        mock_svc.mark_stale_jobs.return_value = []

        self.client.get('/api/jobs/?job_type=export_data&status=PENDING&limit=5')

        mock_svc.list_jobs.assert_called_once_with(
            tenant_id=str(self.tenant.id),
            job_type='export_data',
            status='PENDING',
            limit=5,
        )

    @patch('jobs.views.get_job_service')
    def test_detail_returns_job(self, MockService):
        mock_svc = MockService.return_value
        mock_svc.get_job.return_value = {
            'tenant_id': str(self.tenant.id),
            'job_id': 'job-1',
            'job_type': 'export_data',
            'status': 'READY',
            'created_at': '2026-03-07T12:00:00+00:00',
            'updated_at': '2026-03-07T12:01:00+00:00',
            'expires_at': '2026-03-14T12:00:00+00:00',
            'result': {'download_url': 'https://example.com/file.zip'},
        }

        resp = self.client.get('/api/jobs/job-1/')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'READY')
        self.assertIn('download_url', resp.data['result'])

    @patch('jobs.views.get_job_service')
    def test_detail_returns_404(self, MockService):
        mock_svc = MockService.return_value
        mock_svc.get_job.return_value = None

        resp = self.client.get('/api/jobs/nonexistent/')

        self.assertEqual(resp.status_code, 404)

    @patch('jobs.views.get_job_service')
    def test_params_not_exposed(self, MockService):
        mock_svc = MockService.return_value
        mock_svc.get_job.return_value = {
            'tenant_id': str(self.tenant.id),
            'job_id': 'job-1',
            'job_type': 'export_data',
            'status': 'PENDING',
            'created_at': '2026-03-07T12:00:00+00:00',
            'updated_at': '2026-03-07T12:00:00+00:00',
            'expires_at': '2026-03-14T12:00:00+00:00',
            'params': {'password_hash': 'secret-hash'},
        }

        resp = self.client.get('/api/jobs/job-1/')

        self.assertEqual(resp.status_code, 200)
        self.assertNotIn('params', resp.data)

    def test_unauthenticated_returns_401(self):
        client = APIClient()
        resp = client.get('/api/jobs/')
        self.assertEqual(resp.status_code, 401)

    def test_post_to_jobs_list_returns_405(self):
        resp = self.client.post('/api/jobs/', {}, format='json')
        self.assertEqual(resp.status_code, 405)

    def test_put_to_jobs_list_returns_405(self):
        resp = self.client.put('/api/jobs/', {}, format='json')
        self.assertEqual(resp.status_code, 405)

    def test_patch_to_jobs_list_returns_405(self):
        resp = self.client.patch('/api/jobs/', {}, format='json')
        self.assertEqual(resp.status_code, 405)

    def test_delete_to_jobs_list_returns_405(self):
        resp = self.client.delete('/api/jobs/')
        self.assertEqual(resp.status_code, 405)

    @patch('jobs.views.get_job_service')
    def test_job_tenant_isolation(self, MockService):
        from accounts.models import User
        from tenancy.models import TenantMember

        tenant_b = Tenant.objects.create(name='Other Corp', slug='other-corp')
        user_b = User.objects.create_user(email='other@example.com', password='testpass123')
        TenantMember.objects.create(tenant=tenant_b, user=user_b, is_active=True)

        client_b = APIClient()
        login_as(client_b, user_b, tenant_b)

        mock_svc = MockService.return_value
        mock_svc.list_jobs.return_value = []
        mock_svc.mark_stale_jobs.return_value = []

        resp = client_b.get('/api/jobs/')

        self.assertEqual(resp.status_code, 200)
        mock_svc.list_jobs.assert_called_once()
        call_kwargs = mock_svc.list_jobs.call_args[1]
        self.assertEqual(call_kwargs['tenant_id'], str(tenant_b.id))
        self.assertNotEqual(call_kwargs['tenant_id'], str(self.tenant.id))
