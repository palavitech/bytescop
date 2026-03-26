"""End-to-end test: fresh install → setup → login → logout → login again."""

import json

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import InstallState


SETUP_STATUS_URL = '/api/setup/status/'
SETUP_COMPLETE_URL = '/api/setup/complete/'
LOGIN_STEP1_URL = '/api/auth/login/'
LOGIN_STEP2_URL = '/api/auth/login/select-tenant/'
LOGOUT_URL = '/api/auth/logout/'
MFA_SETUP_URL = '/api/auth/mfa/setup/'
MFA_SETUP_CONFIRM_URL = '/api/auth/mfa/setup/confirm/'

ADMIN_EMAIL = 'admin@example.com'
ADMIN_PASSWORD = 'Str0ngP@ss!99xz'

SETUP_PAYLOAD = {
    'workspace_name': 'Test Corp',
    'admin_first_name': 'Test',
    'admin_last_name': 'Admin',
    'admin_email': ADMIN_EMAIL,
    'admin_password': ADMIN_PASSWORD,
    'password_confirm': ADMIN_PASSWORD,
}


class FreshInstallFlowTests(TestCase):
    """Simulate a fresh install: setup → login → logout → login again."""

    def setUp(self):
        cache.clear()
        # Ensure InstallState exists but NOT installed (fresh install)
        InstallState.objects.update_or_create(id=1, defaults={'installed': False})
        self.client = APIClient()

    def _json(self, resp):
        return json.loads(resp.content)

    def _complete_mfa_setup(self, mfa_token):
        """Complete MFA enrollment using pyotp to generate a valid TOTP code."""
        import pyotp

        # Step 1: Get QR code and secret
        resp = self.client.post(MFA_SETUP_URL, {
            'mfa_token': mfa_token,
        }, format='json')
        data = self._json(resp)
        self.assertEqual(resp.status_code, 200, data)
        secret = data['secret']
        new_mfa_token = data['mfa_token']

        # Step 2: Generate a valid TOTP code and confirm
        totp = pyotp.TOTP(secret)
        code = totp.now()

        resp = self.client.post(MFA_SETUP_CONFIRM_URL, {
            'mfa_token': new_mfa_token,
            'code': code,
        }, format='json')
        data = self._json(resp)
        self.assertEqual(resp.status_code, 200, data)
        self.assertIn('user', data)
        return data, secret

    def _login_with_mfa(self, tenant_id, mfa_secret):
        """Login step 2 + MFA verify for a user who already has MFA enrolled."""
        import pyotp

        resp = self.client.post(LOGIN_STEP2_URL, {
            'email': ADMIN_EMAIL,
            'password': ADMIN_PASSWORD,
            'tenant_id': tenant_id,
        }, format='json')
        data = self._json(resp)
        self.assertEqual(resp.status_code, 200, data)
        self.assertTrue(data.get('mfa_required'))
        self.assertFalse(data.get('mfa_setup_required', False))

        # Verify with TOTP
        totp = pyotp.TOTP(mfa_secret)
        resp = self.client.post('/api/auth/mfa/verify/', {
            'mfa_token': data['mfa_token'],
            'code': totp.now(),
        }, format='json')
        data = self._json(resp)
        self.assertEqual(resp.status_code, 200, data)
        self.assertIn('user', data)
        return data

    def test_full_flow(self):
        # --- Step 1: Verify setup is required ---
        resp = self.client.get(SETUP_STATUS_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(self._json(resp)['setup_required'])

        # --- Step 2: API blocks login before setup ---
        resp = self.client.post(LOGIN_STEP1_URL, {
            'email': ADMIN_EMAIL,
            'password': ADMIN_PASSWORD,
        }, format='json')
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(self._json(resp).get('setup_required'))

        # --- Step 3: Complete setup ---
        resp = self.client.post(
            SETUP_COMPLETE_URL,
            SETUP_PAYLOAD,
            content_type='application/json',
        )
        data = self._json(resp)
        self.assertEqual(resp.status_code, 200, data)
        self.assertTrue(data['ok'])

        # --- Step 4: Verify setup is no longer required ---
        resp = self.client.get(SETUP_STATUS_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(self._json(resp)['setup_required'])

        # --- Step 5: Login step 1 ---
        resp = self.client.post(LOGIN_STEP1_URL, {
            'email': ADMIN_EMAIL,
            'password': ADMIN_PASSWORD,
        }, format='json')
        data = self._json(resp)
        self.assertEqual(resp.status_code, 200, data)
        tenants = data.get('tenants', [])
        self.assertEqual(len(tenants), 1)
        tenant_id = tenants[0]['id']

        # --- Step 6: Login step 2 → MFA setup required (owner role) ---
        resp = self.client.post(LOGIN_STEP2_URL, {
            'email': ADMIN_EMAIL,
            'password': ADMIN_PASSWORD,
            'tenant_id': tenant_id,
        }, format='json')
        data = self._json(resp)
        self.assertEqual(resp.status_code, 200, data)
        self.assertTrue(data.get('mfa_required'))
        self.assertTrue(data.get('mfa_setup_required'))

        # --- Step 7: Complete MFA enrollment ---
        auth_data, mfa_secret = self._complete_mfa_setup(data['mfa_token'])
        self.assertIn('user', auth_data)

        # --- Step 8: Logout ---
        resp = self.client.post(LOGOUT_URL)
        self.assertEqual(resp.status_code, 204)

        # --- Step 9: Login again after logout (with MFA verify this time) ---
        resp = self.client.post(LOGIN_STEP1_URL, {
            'email': ADMIN_EMAIL,
            'password': ADMIN_PASSWORD,
        }, format='json')
        data = self._json(resp)
        self.assertEqual(resp.status_code, 200, data)
        self.assertEqual(len(data.get('tenants', [])), 1)

        auth_data = self._login_with_mfa(tenant_id, mfa_secret)
        self.assertIn('user', auth_data)
