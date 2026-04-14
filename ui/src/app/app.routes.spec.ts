import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, UrlTree } from '@angular/router';
import { routes } from './app.routes';
import { TokenService } from './services/core/auth/token.service';

/** Helper: find a route by path (searches top-level and first-level children). */
function findRoute(path: string) {
  const top = routes.find(r => r.path === path);
  if (top) return top;
  for (const r of routes) {
    const child = r.children?.find(c => c.path === path);
    if (child) return child;
  }
  return undefined;
}

describe('App Routes', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
    router = TestBed.inject(Router);
  });

  // --- Route definitions ---

  it('should have a /login route', () => {
    const route = findRoute('login');
    expect(route).toBeDefined();
    expect(route!.data!['authPage']).toBe(true);
  });

  it('should have a /dashboard route', () => {
    const route = findRoute('dashboard');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Dashboard');
    expect(route!.data!['hideBreadcrumb']).toBe(true);
  });

  it('/dashboard requires auth guards', () => {
    const route = findRoute('dashboard');
    expect(route!.canActivate!.length).toBeGreaterThanOrEqual(3);
  });

  it('should have an /organizations route', () => {
    const route = findRoute('organizations');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Clients');
    expect(route!.canActivate!.length).toBeGreaterThanOrEqual(4);
  });

  it('should have an /engagements route', () => {
    const route = findRoute('engagements');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Engagements');
    expect(route!.canActivate!.length).toBeGreaterThanOrEqual(4);
  });

  it('should have an /assets route', () => {
    const route = findRoute('assets');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Assets');
    expect(route!.canActivate!.length).toBeGreaterThanOrEqual(4);
  });

  it('should have a /profile route', () => {
    const route = findRoute('profile');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Profile');
    expect(route!.canActivate!.length).toBeGreaterThanOrEqual(1);
  });

  it('should have an /admin route', () => {
    const route = findRoute('admin');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Admin');
    expect(route!.canActivate!.length).toBeGreaterThanOrEqual(4);
  });

  it('should have a /privacy route', () => {
    const route = findRoute('privacy');
    expect(route).toBeDefined();
    expect(route!.data!['hideBreadcrumb']).toBe(true);
    expect(route!.data!['hideSidebar']).toBe(true);
  });

  it('should have a /terms route', () => {
    const route = findRoute('terms');
    expect(route).toBeDefined();
    expect(route!.data!['hideBreadcrumb']).toBe(true);
    expect(route!.data!['hideSidebar']).toBe(true);
  });

  it('should have a /mfa/setup route', () => {
    const route = findRoute('mfa/setup');
    expect(route).toBeDefined();
    expect(route!.data!['authPage']).toBe(true);
    expect(route!.data!['hideSidebar']).toBe(true);
    expect(route!.canActivate!.length).toBeGreaterThanOrEqual(1);
  });

  it('should have a /verify-email route', () => {
    const route = findRoute('verify-email');
    expect(route).toBeDefined();
    expect(route!.data!['authPage']).toBe(true);
  });

  it('should have a /forgot-password route', () => {
    const route = findRoute('forgot-password');
    expect(route).toBeDefined();
    expect(route!.data!['authPage']).toBe(true);
  });

  it('should have a /reset-password route', () => {
    const route = findRoute('reset-password');
    expect(route).toBeDefined();
    expect(route!.data!['authPage']).toBe(true);
  });

  it('should have an /accept-invite route', () => {
    const route = findRoute('accept-invite');
    expect(route).toBeDefined();
    expect(route!.data!['authPage']).toBe(true);
    expect(route!.data!['hideSidebar']).toBe(true);
  });

  it('should have a /setup route', () => {
    const route = findRoute('setup');
    expect(route).toBeDefined();
    expect(route!.data!['authPage']).toBe(true);
  });

  it('should have a /closing route', () => {
    const route = findRoute('closing');
    expect(route).toBeDefined();
    expect(route!.data!['authPage']).toBe(true);
  });

  it('wildcard redirects to login', () => {
    const wildcard = findRoute('**');
    expect(wildcard).toBeDefined();
    expect(wildcard!.redirectTo).toBe('login');
  });

  // --- Lazy loading ---

  it('/dashboard has loadComponent', () => {
    expect(findRoute('dashboard')!.loadComponent).toBeDefined();
  });

  it('/organizations has loadChildren', () => {
    expect(findRoute('organizations')!.loadChildren).toBeDefined();
  });

  it('/engagements has loadChildren', () => {
    expect(findRoute('engagements')!.loadChildren).toBeDefined();
  });

  it('/assets has loadChildren', () => {
    expect(findRoute('assets')!.loadChildren).toBeDefined();
  });

  it('/admin has loadChildren', () => {
    expect(findRoute('admin')!.loadChildren).toBeDefined();
  });

  it('/profile has loadComponent', () => {
    expect(findRoute('profile')!.loadComponent).toBeDefined();
  });

  it('/login has loadComponent', () => {
    expect(findRoute('login')!.loadComponent).toBeDefined();
  });

  // --- AuthDefaultRedirectGuard (root path '' guard) ---

  it('root route redirects to /dashboard when authenticated', () => {
    const tokenService = TestBed.inject(TokenService);
    tokenService.setAuthenticated();

    // The root '' route with pathMatch is nested inside the parent container
    const parentRoute = routes.find(r => r.path === '' && r.children);
    const rootChild = parentRoute!.children!.find(c => c.path === '' && c.pathMatch === 'full');
    expect(rootChild).toBeDefined();
    expect(rootChild!.canActivate).toBeDefined();

    const guard = rootChild!.canActivate![0];
    const result = TestBed.runInInjectionContext(() => (guard as any)());
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/dashboard');
  });

  it('root route redirects to /login when not authenticated', () => {
    const tokenService = TestBed.inject(TokenService);
    tokenService.clear();

    const parentRoute = routes.find(r => r.path === '' && r.children);
    const rootChild = parentRoute!.children!.find(c => c.path === '' && c.pathMatch === 'full');
    const guard = rootChild!.canActivate![0];
    const result = TestBed.runInInjectionContext(() => (guard as any)());
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });

  // --- Lazy load functions execute ---

  it('/setup has loadComponent', () => {
    const route = findRoute('setup');
    expect(route!.loadComponent).toBeDefined();
  });

  it('/closing has loadComponent', () => {
    const route = findRoute('closing');
    expect(route!.loadComponent).toBeDefined();
  });

  it('/verify-email has loadComponent', () => {
    expect(findRoute('verify-email')!.loadComponent).toBeDefined();
  });

  it('/forgot-password has loadComponent', () => {
    expect(findRoute('forgot-password')!.loadComponent).toBeDefined();
  });

  it('/reset-password has loadComponent', () => {
    expect(findRoute('reset-password')!.loadComponent).toBeDefined();
  });

  it('/accept-invite has loadComponent', () => {
    expect(findRoute('accept-invite')!.loadComponent).toBeDefined();
  });

  it('/mfa/setup has loadComponent', () => {
    expect(findRoute('mfa/setup')!.loadComponent).toBeDefined();
  });

  it('/privacy has loadComponent', () => {
    expect(findRoute('privacy')!.loadComponent).toBeDefined();
  });

  it('/terms has loadComponent', () => {
    expect(findRoute('terms')!.loadComponent).toBeDefined();
  });

  // --- Setup gate guard on parent route ---

  it('parent container route has canActivateChild with SetupGateGuard', () => {
    const parentRoute = routes.find(r => r.path === '' && r.children);
    expect(parentRoute).toBeDefined();
    expect(parentRoute!.canActivateChild).toBeDefined();
    expect(parentRoute!.canActivateChild!.length).toBe(1);
  });

  // --- Route data completeness ---

  it('/setup has hideSidebar true', () => {
    const route = findRoute('setup');
    expect(route!.data!['hideSidebar']).toBe(true);
  });

  it('/closing has hideSidebar true', () => {
    const route = findRoute('closing');
    expect(route!.data!['hideSidebar']).toBe(true);
  });

  it('/dashboard has hideBreadcrumb true', () => {
    const route = findRoute('dashboard');
    expect(route!.data!['hideBreadcrumb']).toBe(true);
  });
});
