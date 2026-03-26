import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService, AuthResponse, LoginStep1Response, SignupResponse } from './auth.service';
import { TokenService } from './token.service';

describe('AuthService', () => {
  let service: AuthService;
  let tokens: TokenService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ]
    });
    service = TestBed.inject(AuthService);
    tokens = TestBed.inject(TokenService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- isAuthenticated$ ---

  it('isAuthenticated$ emits false when not authenticated', () => {
    let value: boolean | undefined;
    service.isAuthenticated$.subscribe(v => value = v);
    expect(value).toBe(false);
  });

  it('isAuthenticated$ emits true after setAuthenticated()', () => {
    let value: boolean | undefined;
    service.isAuthenticated$.subscribe(v => value = v);
    tokens.setAuthenticated();
    expect(value).toBe(true);
  });

  it('isAuthenticated$ emits false after tokens are cleared', () => {
    tokens.setAuthenticated();
    let value: boolean | undefined;
    service.isAuthenticated$.subscribe(v => value = v);
    tokens.clear();
    expect(value).toBe(false);
  });

  // --- isAuthenticatedSync ---

  it('isAuthenticatedSync() returns false when not authenticated', () => {
    expect(service.isAuthenticatedSync()).toBe(false);
  });

  it('isAuthenticatedSync() returns true when authenticated', () => {
    tokens.setAuthenticated();
    expect(service.isAuthenticatedSync()).toBe(true);
  });

  // --- setUser ---

  it('setUser() updates user$ observable', () => {
    let user: any;
    service.user$.subscribe(u => user = u);
    expect(user).toBeNull();

    service.setUser({ email: 'a@b.com' });
    expect(user).toEqual({ email: 'a@b.com' });

    service.setUser(null);
    expect(user).toBeNull();
  });

  // --- signup ---

  it('signup() posts to /api/auth/signup/ and returns response', () => {
    const payload = {
      company_name: 'Acme',
      first_name: 'John',
      last_name: 'Doe',
      email: 'j@acme.com',
      password: 'pass123',
      password_confirm: 'pass123',
    };
    const response: SignupResponse = { detail: 'Check your email', email_sent: true };

    let result: SignupResponse | undefined;
    service.signup(payload).subscribe(r => result = r);

    const req = httpTesting.expectOne('/api/auth/signup/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(response);

    expect(result).toEqual(response);
  });

  it('signup() does not set authenticated or user', () => {
    const payload = {
      company_name: 'X',
      first_name: 'A',
      last_name: 'B',
      email: 'a@b.com',
      password: 'p',
      password_confirm: 'p',
    };
    const response: SignupResponse = { detail: 'Check your email', email_sent: true };

    let user: any = 'sentinel';
    service.user$.subscribe(u => user = u);

    service.signup(payload).subscribe();
    httpTesting.expectOne('/api/auth/signup/').flush(response);

    expect(tokens.isAuthenticated()).toBe(false);
    expect(user).toBeNull();
  });

  // --- login ---

  it('login() posts to /api/auth/login/ and returns tenants', () => {
    const response: LoginStep1Response = {
      tenants: [{ id: '1', slug: 'acme', name: 'Acme', role: 'admin' }],
    };

    let result: LoginStep1Response | undefined;
    service.login('j@acme.com', 'pass').subscribe(r => result = r);

    const req = httpTesting.expectOne('/api/auth/login/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'j@acme.com', password: 'pass' });
    req.flush(response);

    expect(result).toEqual(response);
    // login step 1 does NOT set authenticated
    expect(tokens.isAuthenticated()).toBe(false);
  });

  // --- selectTenant ---

  it('selectTenant() posts and sets authenticated on success', () => {
    const response: AuthResponse = {
      user: { email: 'u@t.com' },
      tenant: { id: '2', slug: 'tenant-2', name: 'Tenant 2', role: 'user' },
    };

    let result: AuthResponse | undefined;
    service.selectTenant('u@t.com', 'pw', '2', false).subscribe(r => result = r);

    const req = httpTesting.expectOne('/api/auth/login/select-tenant/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'u@t.com', password: 'pw', tenant_id: '2', remember: false });
    req.flush(response);

    expect(result).toEqual(response);
    expect(tokens.isAuthenticated()).toBe(true);
  });

  // --- listTenants ---

  it('listTenants() makes GET to /api/auth/tenants/ and does not set authenticated', () => {
    const response: LoginStep1Response = {
      tenants: [
        { id: '1', slug: 'acme', name: 'Acme', role: 'owner' },
        { id: '2', slug: 'beta', name: 'Beta', role: 'member' },
      ],
    };

    let result: LoginStep1Response | undefined;
    service.listTenants().subscribe(r => result = r);

    const req = httpTesting.expectOne('/api/auth/tenants/');
    expect(req.request.method).toBe('GET');
    req.flush(response);

    expect(result).toEqual(response);
    expect(tokens.isAuthenticated()).toBe(false);
  });

  // --- switchTenant ---

  it('switchTenant() posts to /api/auth/switch-tenant/ and sets authenticated', () => {
    const response: AuthResponse = {
      user: { email: 'u@t.com' },
      tenant: { id: '2', slug: 'beta', name: 'Beta Corp', role: 'member' },
    };

    let result: AuthResponse | undefined;
    service.switchTenant('2').subscribe(r => result = r);

    const req = httpTesting.expectOne('/api/auth/switch-tenant/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ tenant_id: '2' });
    req.flush(response);

    expect(result).toEqual(response);
    expect(tokens.isAuthenticated()).toBe(true);
  });

  it('switchTenant() updates user$ observable', () => {
    const response: AuthResponse = {
      user: { email: 'switched@test.com' },
      tenant: { id: '1', slug: 's', name: 'S', role: 'owner' },
    };

    let user: any = 'sentinel';
    service.user$.subscribe(u => user = u);

    service.switchTenant('s').subscribe();
    httpTesting.expectOne('/api/auth/switch-tenant/').flush(response);

    expect(user).toEqual({ email: 'switched@test.com' });
  });

  // --- logout ---

  it('logout() posts to /api/auth/logout/ and clears state', () => {
    tokens.setAuthenticated();
    service.setUser({ email: 'u@b.com' });

    let completed = false;
    service.logout().subscribe(() => completed = true);

    const req = httpTesting.expectOne('/api/auth/logout/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(null);

    expect(completed).toBe(true);
    expect(tokens.isAuthenticated()).toBe(false);
  });

  it('logout() clears state even when API call fails', () => {
    tokens.setAuthenticated();

    service.logout().subscribe();
    httpTesting.expectOne('/api/auth/logout/')
      .flush('error', { status: 500, statusText: 'Server Error' });

    expect(tokens.isAuthenticated()).toBe(false);
  });

  it('logout() sets user$ to null', () => {
    tokens.setAuthenticated();
    service.setUser({ email: 'u@b.com' });

    let user: any = 'sentinel';
    service.user$.subscribe(u => user = u);

    service.logout().subscribe();
    httpTesting.expectOne('/api/auth/logout/').flush(null);

    expect(user).toBeNull();
  });

  // --- completeAuthFromMfa ---

  it('completeAuthFromMfa() sets authenticated and user', () => {
    const res: AuthResponse = {
      user: { email: 'mfa@test.com' },
      tenant: { id: '1', slug: 'mfa-tenant', name: 'MFA Tenant', role: 'member' },
    };

    service.completeAuthFromMfa(res);

    expect(tokens.isAuthenticated()).toBe(true);

    let user: any;
    service.user$.subscribe(u => user = u);
    expect(user).toEqual({ email: 'mfa@test.com' });
  });

  it('completeAuthFromMfa() sets user to null when user is undefined', () => {
    const res: AuthResponse = {};
    let user: any = 'sentinel';
    service.user$.subscribe(u => user = u);

    service.completeAuthFromMfa(res);
    expect(user).toBeNull();
  });

  // --- selectTenant with MFA response ---

  it('selectTenant() skips auth state when mfa_required is true', () => {
    const mfaResponse: AuthResponse = {
      mfa_required: true,
      mfa_token: 'mfa-tok-123',
    };

    let result: AuthResponse | undefined;
    service.selectTenant('u@t.com', 'pw', 'tenant-1', false).subscribe(r => result = r);
    httpTesting.expectOne('/api/auth/login/select-tenant/').flush(mfaResponse);

    expect(result?.mfa_required).toBe(true);
    // Should NOT have been set as authenticated
    expect(tokens.isAuthenticated()).toBe(false);
  });

  it('selectTenant() sets user to null when user is undefined in response', () => {
    const response: AuthResponse = {};

    let user: any = 'sentinel';
    service.user$.subscribe(u => user = u);

    service.selectTenant('u@t.com', 'pw', 'slug', false).subscribe();
    httpTesting.expectOne('/api/auth/login/select-tenant/').flush(response);

    expect(user).toBeNull();
  });

  // --- switchTenant sets user to null when user is undefined ---

  it('switchTenant() sets user to null when user is undefined in response', () => {
    const response: AuthResponse = {};

    let user: any = 'sentinel';
    service.user$.subscribe(u => user = u);

    service.switchTenant('slug').subscribe();
    httpTesting.expectOne('/api/auth/switch-tenant/').flush(response);

    expect(user).toBeNull();
  });

  // --- Branch: url() with path that does not start with / ---

  it('url() prepends slash when path does not start with one', () => {
    // Verify via a method that calls url() internally — forgotPassword uses url()
    service.forgotPassword('test@test.com').subscribe();
    const req = httpTesting.expectOne('/api/auth/forgot-password/');
    expect(req.request.method).toBe('POST');
    req.flush({ detail: 'ok' });
  });

  // --- Branch: resetPassword with mfaCode ---

  it('resetPassword() includes mfa_code when mfaCode is provided', () => {
    service.resetPassword('tok', 'newpass', 'newpass', '123456').subscribe();
    const req = httpTesting.expectOne('/api/auth/reset-password/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      token: 'tok',
      password: 'newpass',
      password_confirm: 'newpass',
      mfa_code: '123456',
    });
    req.flush({ detail: 'ok' });
  });

  it('resetPassword() omits mfa_code when mfaCode is not provided', () => {
    service.resetPassword('tok', 'newpass', 'newpass').subscribe();
    const req = httpTesting.expectOne('/api/auth/reset-password/');
    expect(req.request.body).toEqual({
      token: 'tok',
      password: 'newpass',
      password_confirm: 'newpass',
    });
    req.flush({ detail: 'ok' });
  });

  // --- verifyEmail ---

  it('verifyEmail() makes GET to /api/auth/verify-email/', () => {
    service.verifyEmail('some-token').subscribe();
    const req = httpTesting.expectOne(r => r.url.includes('/api/auth/verify-email/'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('token')).toBe('some-token');
    req.flush({ detail: 'ok' });
  });

  // --- resendVerification ---

  it('resendVerification() posts email and password', () => {
    service.resendVerification('a@b.com', 'pass').subscribe();
    const req = httpTesting.expectOne('/api/auth/resend-verification/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'a@b.com', password: 'pass' });
    req.flush({ detail: 'ok' });
  });

  // --- validateResetToken ---

  it('validateResetToken() makes GET to /api/auth/reset-password/validate/', () => {
    service.validateResetToken('tok123').subscribe();
    const req = httpTesting.expectOne(r => r.url.includes('/api/auth/reset-password/validate/'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('token')).toBe('tok123');
    req.flush({ valid: true, mfa_required: false, password_policy: {} });
  });
});
