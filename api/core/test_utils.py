"""Shared test utilities for session-based authentication."""


def login_as(client, user, tenant, mfa_enabled=True):
    """Authenticate the test client with a Django session, including tenant context.

    Usage in tests:
        login_as(self.client, self.user, self.tenant)
        resp = self.client.get('/api/settings/')
    """
    client.force_login(user)
    session = client.session
    session['tenant_id'] = str(tenant.id)
    session['mfa_enabled'] = mfa_enabled
    session.save()
