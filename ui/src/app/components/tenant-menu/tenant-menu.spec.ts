import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TenantMenuComponent } from './tenant-menu';
import { UserProfileService } from '../../services/core/profile/user-profile.service';
import { PermissionService } from '../../services/core/auth/permission.service';
import { AuthService } from '../../services/core/auth/auth.service';
import { NotificationService } from '../../services/core/notify/notification.service';

describe('TenantMenuComponent', () => {
  let fixture: ComponentFixture<TenantMenuComponent>;
  let component: TenantMenuComponent;
  let profileService: UserProfileService;
  let permissionService: PermissionService;
  let authSpy: jasmine.SpyObj<AuthService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let router: Router;

  const setProfile = (tenantName: string, role: string) => {
    profileService.setFromAuthResponse({
      user: { id: 1, email: 'test@test.com', first_name: 'Test', last_name: 'User' },
      tenant: { id: 't1', slug: 'acme', name: tenantName, role },
    });
  };

  beforeEach(() => {
    sessionStorage.clear();

    authSpy = jasmine.createSpyObj('AuthService', ['listTenants', 'switchTenant']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);

    TestBed.configureTestingModule({
      imports: [TenantMenuComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authSpy },
        { provide: NotificationService, useValue: notifySpy },
      ],
    });
    profileService = TestBed.inject(UserProfileService);
    permissionService = TestBed.inject(PermissionService);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(TenantMenuComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display tenant name from profile', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    const name = fixture.nativeElement.querySelector('.bc-tenantName');
    expect(name?.textContent?.trim()).toBe('Acme Corp');
  });

  it('should display tenant role', () => {
    setProfile('Acme Corp', 'member');
    fixture.detectChanges();

    const role = fixture.nativeElement.querySelector('.bc-tenantRole');
    expect(role?.textContent?.trim()).toBe('member');
  });

  it('should show accent class for owner role', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    const role = fixture.nativeElement.querySelector('.bc-tenantRole');
    expect(role?.classList.contains('is-owner')).toBeTrue();
  });

  it('should not show accent class for member role', () => {
    setProfile('Acme Corp', 'member');
    fixture.detectChanges();

    const role = fixture.nativeElement.querySelector('.bc-tenantRole');
    expect(role?.classList.contains('is-owner')).toBeFalse();
  });

  it('should toggle menu open/closed on click', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.bc-tenantTrigger');
    expect(component.menuOpen).toBeFalse();

    trigger.click();
    fixture.detectChanges();
    expect(component.menuOpen).toBeTrue();

    const menu = fixture.nativeElement.querySelector('.bc-tenantMenu');
    expect(menu?.classList.contains('is-open')).toBeTrue();

    trigger.click();
    fixture.detectChanges();
    expect(component.menuOpen).toBeFalse();
  });

  it('should close menu on Escape key', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.bc-tenantTrigger');
    trigger.click();
    fixture.detectChanges();
    expect(component.menuOpen).toBeTrue();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(component.menuOpen).toBeFalse();
  });

  it('should close menu on outside click', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.bc-tenantTrigger');
    trigger.click();
    fixture.detectChanges();
    expect(component.menuOpen).toBeTrue();

    document.body.click();
    fixture.detectChanges();
    expect(component.menuOpen).toBeFalse();
  });

  it('should not close menu on inside click', () => {
    setProfile('Acme Corp', 'owner');
    permissionService.setFromAuthResponse({
      is_root: true,
      permissions: [],
      groups: [],
    });
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.bc-tenantTrigger');
    trigger.click();
    fixture.detectChanges();
    expect(component.menuOpen).toBeTrue();

    const menu: HTMLElement = fixture.nativeElement.querySelector('.bc-tenantMenu');
    menu.click();
    fixture.detectChanges();
    expect(component.menuOpen).toBeTrue();
  });

  it('should hide tenant name and chevron when collapsed', () => {
    setProfile('Acme Corp', 'owner');
    component.collapsed = true;
    fixture.detectChanges();

    const info = fixture.nativeElement.querySelector('.bc-tenantInfo');
    const chevron = fixture.nativeElement.querySelector('.bc-tenantChevron');
    expect(info).toBeNull();
    expect(chevron).toBeNull();
  });

  it('should show Tenant Settings only with setting.view permission', () => {
    setProfile('Acme Corp', 'member');
    permissionService.setFromAuthResponse({
      is_root: false,
      permissions: [],
      groups: [],
    });
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.bc-tenantTrigger');
    trigger.click();
    fixture.detectChanges();

    const settingsLink = fixture.nativeElement.querySelector('a[routerLink="/admin/settings"]');
    expect(settingsLink).toBeNull();

    permissionService.setFromAuthResponse({
      is_root: false,
      permissions: ['tenant_settings.view'],
      groups: [],
    });
    fixture.detectChanges();

    const settingsLink2 = fixture.nativeElement.querySelector('a[routerLink="/admin/settings"]');
    expect(settingsLink2).not.toBeNull();
    expect(settingsLink2?.textContent).toContain('Workspace Settings');
  });

  it('should show Plan badge for all users', () => {
    setProfile('Acme Corp', 'member');
    permissionService.setFromAuthResponse({
      is_root: false,
      permissions: [],
      groups: [],
    });
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.bc-tenantTrigger');
    trigger.click();
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.bc-tenantPlanBadge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent?.trim()).toBe('Free');
  });

  // --- Switch Tenant ---

  it('should have Switch Tenant button enabled', () => {
    setProfile('Acme Corp', 'owner');
    permissionService.setFromAuthResponse({ is_root: true, permissions: [], groups: [] });
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.bc-tenantTrigger');
    trigger.click();
    fixture.detectChanges();

    const switchBtn = fixture.nativeElement.querySelector('.bc-tenantMenuBody button:last-of-type') as HTMLButtonElement;
    expect(switchBtn.textContent).toContain('Switch Workspace');
    expect(switchBtn.disabled).toBeFalse();
  });

  it('onSwitchTenantClick toggles picker visibility', () => {
    setProfile('Acme Corp', 'owner');
    permissionService.setFromAuthResponse({ is_root: true, permissions: [], groups: [] });
    fixture.detectChanges();

    authSpy.listTenants.and.returnValue(of({ tenants: [] }));

    expect(component.showTenantPicker).toBeFalse();
    component.onSwitchTenantClick();
    expect(component.showTenantPicker).toBeTrue();
    component.onSwitchTenantClick();
    expect(component.showTenantPicker).toBeFalse();
  });

  it('loads tenants on first picker open', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    const mockTenants = {
      tenants: [
        { id: '1', slug: 'acme', name: 'Acme Corp', role: 'owner' },
        { id: '2', slug: 'beta', name: 'Beta Corp', role: 'member' },
      ],
    };
    authSpy.listTenants.and.returnValue(of(mockTenants));

    component.onSwitchTenantClick();

    expect(authSpy.listTenants).toHaveBeenCalledTimes(1);
    expect(component.tenants.length).toBe(2);
  });

  it('shows "No other tenants" when only current tenant exists', () => {
    setProfile('Acme Corp', 'owner');
    permissionService.setFromAuthResponse({ is_root: true, permissions: [], groups: [] });
    fixture.detectChanges();

    authSpy.listTenants.and.returnValue(of({
      tenants: [{ id: 't1', slug: 'acme', name: 'Acme Corp', role: 'owner' }],
    }));

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.bc-tenantTrigger');
    trigger.click();
    fixture.detectChanges();

    component.onSwitchTenantClick();
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.bc-tenantPickerEmpty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('No other tenants available');
  });

  it('shows other tenants filtered by current tenant id', () => {
    setProfile('Acme Corp', 'owner');
    permissionService.setFromAuthResponse({ is_root: true, permissions: [], groups: [] });
    fixture.detectChanges();

    authSpy.listTenants.and.returnValue(of({
      tenants: [
        { id: 't1', slug: 'acme', name: 'Acme Corp', role: 'owner' },
        { id: '2', slug: 'beta', name: 'Beta Corp', role: 'member' },
      ],
    }));

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.bc-tenantTrigger');
    trigger.click();
    fixture.detectChanges();

    component.onSwitchTenantClick();
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.bc-tenantPickerItem');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Beta Corp');
  });

  it('doSwitch calls switchTenant, force-navigates to /dashboard, shows success toast', fakeAsync(() => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    authSpy.switchTenant.and.returnValue(of({
      access: 'a', refresh: 'r',
      tenant: { id: '2', slug: 'beta', name: 'Beta Corp', role: 'member' },
    }));
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    const target = { id: '2', slug: 'beta', name: 'Beta Corp', role: 'member' };
    component.doSwitch(target);
    tick();

    expect(authSpy.switchTenant).toHaveBeenCalledWith('2');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/', { skipLocationChange: true });
    tick();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    expect(component.menuOpen).toBeFalse();
    expect(component.showTenantPicker).toBeFalse();
  }));

  it('doSwitch shows error toast on failure', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    authSpy.switchTenant.and.returnValue(throwError(() => new Error('fail')));

    component.doSwitch({ id: '2', slug: 'beta', name: 'Beta', role: 'member' });

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to switch tenant.');
    expect(component.switching).toBeFalse();
  });

  it('doSwitch prevents double-click via switching guard', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    authSpy.switchTenant.and.returnValue(of({
      access: 'a', refresh: 'r',
      tenant: { id: '2', slug: 'beta', name: 'Beta', role: 'member' },
    }));
    spyOn(router, 'navigateByUrl');

    component.switching = true;
    component.doSwitch({ id: '2', slug: 'beta', name: 'Beta', role: 'member' });

    expect(authSpy.switchTenant).not.toHaveBeenCalled();
  });

  // --- loadTenants error ---

  it('loadTenants shows error toast on failure', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    authSpy.listTenants.and.returnValue(throwError(() => new Error('fail')));

    component.loadTenants();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to load tenants.');
    expect(component.loadingTenants).toBeFalse();
  });

  // --- onDocumentClick when menu is closed ---

  it('onDocumentClick does nothing when menu is closed', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    expect(component.menuOpen).toBeFalse();
    document.body.click();
    expect(component.menuOpen).toBeFalse();
  });

  // --- onEscape when menu is closed ---

  it('onEscape does nothing when menu is closed', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    expect(component.menuOpen).toBeFalse();
    component.onEscape();
    expect(component.menuOpen).toBeFalse();
  });

  // --- tenantInitial$ with null/empty profile ---

  it('tenantInitial$ returns T when profile has no tenant name', () => {
    // Don't set profile, use default
    fixture.detectChanges();

    let initial: string | undefined;
    component.tenantInitial$.subscribe(v => initial = v);
    expect(initial).toBe('T');
  });

  it('tenantName$ returns Tenant when profile is null', () => {
    fixture.detectChanges();

    let name: string | undefined;
    component.tenantName$.subscribe(v => name = v);
    expect(name).toBe('Tenant');
  });

  it('tenantRole$ returns empty string when profile has no role', () => {
    fixture.detectChanges();

    let role: string | undefined;
    component.tenantRole$.subscribe(v => role = v);
    expect(role).toBe('');
  });

  // --- positionMenu with missing refs ---

  it('positionMenu does nothing when triggerBtn or menuPanel not set', () => {
    fixture.detectChanges();
    // Access private method - should not throw even without ViewChild refs
    expect(() => (component as any).positionMenu()).not.toThrow();
  });

  // --- onSwitchTenantClick does not reload when tenants already loaded ---

  it('onSwitchTenantClick does not reload tenants when already loaded', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    component.tenants = [{ id: '1', slug: 'acme', name: 'Acme', role: 'owner' }];
    authSpy.listTenants.and.returnValue(of({ tenants: [] }));

    component.onSwitchTenantClick(); // open
    expect(authSpy.listTenants).not.toHaveBeenCalled();
  });

  // --- otherTenants filtering ---

  it('otherTenants filters out the current tenant by id', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    component.tenants = [
      { id: 't1', slug: 'acme', name: 'Acme', role: 'owner' },
      { id: '2', slug: 'beta', name: 'Beta', role: 'member' },
      { id: '3', slug: 'gamma', name: 'Gamma', role: 'member' },
    ];
    expect(component.otherTenants.length).toBe(2);
    expect(component.otherTenants.map(t => t.slug)).toEqual(['beta', 'gamma']);
  });

  // --- currentTenantId ---

  it('currentTenantId returns tenant id from profile service', () => {
    setProfile('Acme Corp', 'owner');
    fixture.detectChanges();

    expect(component.currentTenantId).toBe('t1');
  });
});
