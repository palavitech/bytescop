import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PermissionService, AuthorizationPayload } from './permission.service';
import { NotificationService } from '../notify/notification.service';
import { requirePermission } from './require-permission.guard';

describe('requirePermission guard', () => {
  let permissions: PermissionService;
  let router: Router;
  let notify: NotificationService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'dashboard', component: class {} as any },
          { path: 'admin', canActivate: [requirePermission('user.view')], component: class {} as any },
        ]),
      ],
    });
    permissions = TestBed.inject(PermissionService);
    router = TestBed.inject(Router);
    notify = TestBed.inject(NotificationService);
    spyOn(notify, 'warning');
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('allows access when user has the required permission', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['user.view', 'user.create'],
      groups: [],
    });

    const guard = requirePermission('user.view');
    const result = TestBed.runInInjectionContext(() =>
      guard({} as any, {} as any),
    );

    expect(result).toBe(true);
    expect(notify.warning).not.toHaveBeenCalled();
  });

  it('denies access and redirects to /dashboard when missing permission', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['client.view'],
      groups: [],
    });

    const guard = requirePermission('user.view');
    const result = TestBed.runInInjectionContext(() =>
      guard({} as any, {} as any),
    );

    expect(result).not.toBe(true);
    // Should be a UrlTree pointing to /dashboard
    expect(result.toString()).toBe('/dashboard');
    expect(notify.warning).toHaveBeenCalledWith('You do not have permission to access this page.');
  });

  it('allows access for root user regardless of permissions', () => {
    permissions.setFromAuthResponse({
      is_root: true,
      permissions: [],
      groups: [],
    });

    const guard = requirePermission('user.view', 'group.view');
    const result = TestBed.runInInjectionContext(() =>
      guard({} as any, {} as any),
    );

    expect(result).toBe(true);
    expect(notify.warning).not.toHaveBeenCalled();
  });

  it('allows when user has any of multiple required permissions', () => {
    permissions.setFromAuthResponse({
      is_root: false,
      permissions: ['group.view'],
      groups: [],
    });

    const guard = requirePermission('user.view', 'group.view');
    const result = TestBed.runInInjectionContext(() =>
      guard({} as any, {} as any),
    );

    expect(result).toBe(true);
  });
});
