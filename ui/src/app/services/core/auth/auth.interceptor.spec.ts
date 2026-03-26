import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import { NotificationService } from '../notify/notification.service';
import { UserProfileService } from '../profile/user-profile.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let tokens: TokenService;
  let auth: AuthService;
  let router: Router;
  let notify: NotificationService;
  let profileService: UserProfileService;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') } },
      ]
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenService);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    notify = TestBed.inject(NotificationService);
    profileService = TestBed.inject(UserProfileService);
    spyOn(notify, 'error');
    spyOn(notify, 'warning');
  });

  afterEach(() => {
    httpTesting.verify();
    sessionStorage.clear();
    localStorage.clear();
    // Clean up any cookies set during tests
    document.cookie = 'bc_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  // --- withCredentials on API requests ---

  it('sets withCredentials on API requests', () => {
    tokens.setAuthenticated();

    http.get('/api/data/').subscribe();

    const req = httpTesting.expectOne('/api/data/');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('sets withCredentials even when not authenticated (cookies may still exist)', () => {
    http.get('/api/data/').subscribe();

    const req = httpTesting.expectOne('/api/data/');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  // --- CSRF token on unsafe methods ---

  it('sets X-CSRFToken header on POST requests when bc_csrf cookie exists', () => {
    document.cookie = 'bc_csrf=testcsrftoken; path=/';

    http.post('/api/data/', {}).subscribe();

    const req = httpTesting.expectOne('/api/data/');
    expect(req.request.headers.get('X-CSRFToken')).toBe('testcsrftoken');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('sets X-CSRFToken header on PUT requests', () => {
    document.cookie = 'bc_csrf=csrfput; path=/';

    http.put('/api/data/', {}).subscribe();

    const req = httpTesting.expectOne('/api/data/');
    expect(req.request.headers.get('X-CSRFToken')).toBe('csrfput');
    req.flush({});
  });

  it('sets X-CSRFToken header on PATCH requests', () => {
    document.cookie = 'bc_csrf=csrfpatch; path=/';

    http.patch('/api/data/', {}).subscribe();

    const req = httpTesting.expectOne('/api/data/');
    expect(req.request.headers.get('X-CSRFToken')).toBe('csrfpatch');
    req.flush({});
  });

  it('sets X-CSRFToken header on DELETE requests', () => {
    document.cookie = 'bc_csrf=csrfdelete; path=/';

    http.delete('/api/data/').subscribe();

    const req = httpTesting.expectOne('/api/data/');
    expect(req.request.headers.get('X-CSRFToken')).toBe('csrfdelete');
    req.flush({});
  });

  it('does not set X-CSRFToken header on GET requests', () => {
    document.cookie = 'bc_csrf=testcsrftoken; path=/';

    http.get('/api/data/').subscribe();

    const req = httpTesting.expectOne('/api/data/');
    expect(req.request.headers.has('X-CSRFToken')).toBe(false);
    req.flush({});
  });

  it('does not set X-CSRFToken header on HEAD requests', () => {
    document.cookie = 'bc_csrf=testcsrftoken; path=/';

    http.head('/api/data/').subscribe();

    const req = httpTesting.expectOne('/api/data/');
    expect(req.request.headers.has('X-CSRFToken')).toBe(false);
    req.flush({});
  });

  it('does not set X-CSRFToken when bc_csrf cookie is absent', () => {
    http.post('/api/data/', {}).subscribe();

    const req = httpTesting.expectOne('/api/data/');
    expect(req.request.headers.has('X-CSRFToken')).toBe(false);
    req.flush({});
  });

  // --- Non-API requests ---

  it('does not set withCredentials on non-API requests', () => {
    tokens.setAuthenticated();

    http.get('https://cdn.example.com/asset.js').subscribe();

    const req = httpTesting.expectOne('https://cdn.example.com/asset.js');
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.headers.has('X-CSRFToken')).toBe(false);
    req.flush({});
  });

  // --- 401 causes immediate logout ---

  it('clears auth state and redirects to /login on 401', () => {
    tokens.setAuthenticated();

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    // No refresh attempt — immediate logout
    httpTesting.expectNone('/api/auth/refresh/');
    expect(tokens.isAuthenticated()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
    expect(error).toBeTruthy();
  });

  it('does not attempt refresh on 401 from auth endpoints', () => {
    tokens.setAuthenticated();

    let error: any;
    http.post('/api/auth/login/', {}).subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/auth/login/')
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    httpTesting.expectNone('/api/auth/refresh/');
    expect(error).toBeTruthy();
  });

  it('does not attempt refresh on 401 from non-API request', () => {
    tokens.setAuthenticated();

    let error: any;
    http.get('https://cdn.example.com/file.js').subscribe({ error: e => error = e });

    httpTesting.expectOne('https://cdn.example.com/file.js')
      .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    httpTesting.expectNone('/api/auth/refresh/');
    expect(error).toBeTruthy();
  });

  // --- Non-401 errors pass through ---

  it('passes through non-401 errors without refresh attempt', () => {
    tokens.setAuthenticated();

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush('Not Found', { status: 404, statusText: 'Not Found' });

    httpTesting.expectNone('/api/auth/refresh/');
    expect(error).toBeTruthy();
  });

  // --- 403 handling ---

  it('shows error toast on 403 with API detail message', () => {
    tokens.setAuthenticated();

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush({ detail: 'Custom permission denied message.' }, { status: 403, statusText: 'Forbidden' });

    expect(notify.error).toHaveBeenCalledWith('Custom permission denied message.');
    expect(error).toBeTruthy();
  });

  it('shows fallback message on 403 without detail', () => {
    tokens.setAuthenticated();

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush({}, { status: 403, statusText: 'Forbidden' });

    expect(notify.error).toHaveBeenCalledWith('You do not have permission to perform this action.');
    expect(error).toBeTruthy();
  });

  it('does not attempt refresh on 403', () => {
    tokens.setAuthenticated();

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush('Forbidden', { status: 403, statusText: 'Forbidden' });

    httpTesting.expectNone('/api/auth/refresh/');
    expect(error).toBeTruthy();
  });

  // --- Timeout ---

  it('returns timeout error for requests exceeding 30 seconds', fakeAsync(() => {
    let error: any;
    http.get('/api/slow/').subscribe({ error: e => error = e });

    tick(30_000);

    expect(error).toBeTruthy();
    expect(error.message).toContain('timed out');

    // clean up pending HTTP request and timers
    httpTesting.match('/api/slow/');
    discardPeriodicTasks();
  }));

  // --- 403 with mfa_setup_required ---

  it('redirects to /mfa/setup on 403 with mfa_setup_required code', () => {
    tokens.setAuthenticated();

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush({ code: 'mfa_setup_required', detail: 'MFA setup required' }, { status: 403, statusText: 'Forbidden' });

    expect(router.navigateByUrl).toHaveBeenCalledWith('/mfa/setup');
    expect(error).toBeTruthy();
  });

  // --- 402 subscription limit handling ---

  it('shows warning toast on 402 with error message', () => {
    tokens.setAuthenticated();
    spyOn(profileService, 'currentPlanName').and.returnValue('Free');

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush({ message: 'Maximum findings reached.' }, { status: 402, statusText: 'Payment Required' });

    expect(notify.warning).toHaveBeenCalledWith('Maximum findings reached.', {
      title: 'Plan Limit (Free)',
      durationMs: 8000,
    });
    expect(error).toBeTruthy();
  });

  it('shows warning toast on 402 with detail instead of message', () => {
    tokens.setAuthenticated();
    spyOn(profileService, 'currentPlanName').and.returnValue('Free');

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush({ detail: 'Limit exceeded on plan.' }, { status: 402, statusText: 'Payment Required' });

    expect(notify.warning).toHaveBeenCalledWith('Limit exceeded on plan.', jasmine.objectContaining({
      title: 'Plan Limit (Free)',
    }));
    expect(error).toBeTruthy();
  });

  it('shows fallback warning on 402 with no message or detail', () => {
    tokens.setAuthenticated();
    spyOn(profileService, 'currentPlanName').and.returnValue('Free');

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush({}, { status: 402, statusText: 'Payment Required' });

    expect(notify.warning).toHaveBeenCalledWith('You have reached a limit on your current plan.', jasmine.objectContaining({
      title: 'Plan Limit (Free)',
    }));
    expect(error).toBeTruthy();
  });

  // --- 403 tenant_closing ---

  it('clears auth state and redirects to /login?reason=tenant_closed on 403 with tenant_closing code', () => {
    tokens.setAuthenticated();

    let error: any;
    http.get('/api/data/').subscribe({ error: e => error = e });

    httpTesting.expectOne('/api/data/')
      .flush({ code: 'tenant_closing', detail: 'Tenant is closing' }, { status: 403, statusText: 'Forbidden' });

    expect(tokens.isAuthenticated()).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?reason=tenant_closed');
    expect(error).toBeTruthy();
  });
});
