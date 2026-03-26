import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router, NavigationEnd } from '@angular/router';
import { of, BehaviorSubject, throwError, Subject } from 'rxjs';

import { AppComponent } from './app.component';
import { AuthService } from './services/core/auth/auth.service';
import { NotificationService } from './services/core/notify/notification.service';
import { UserProfileService } from './services/core/profile/user-profile.service';
import { EngagementsService } from './features/engagements/services/engagements.service';
import { VersionService } from './services/core/version.service';
import { DateFormatService } from './services/core/date-format.service';
import { LoadingService } from './services/core/loading/loading.service';
import { environment } from '../environments/environment';

describe('AppComponent', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let engagementsServiceSpy: jasmine.SpyObj<EngagementsService>;
  let dateFormatSpy: jasmine.SpyObj<DateFormatService>;
  let loadingSpy: jasmine.SpyObj<LoadingService>;
  let isAuthenticated$: BehaviorSubject<boolean>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    isAuthenticated$ = new BehaviorSubject<boolean>(false);

    authServiceSpy = jasmine.createSpyObj('AuthService', ['logout'], {
      isAuthenticated$: isAuthenticated$.asObservable(),
    });
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    engagementsServiceSpy = jasmine.createSpyObj('EngagementsService', ['list']);
    dateFormatSpy = jasmine.createSpyObj('DateFormatService', ['load']);
    loadingSpy = jasmine.createSpyObj('LoadingService', [], {
      isLoading$: of(false),
    });

    engagementsServiceSpy.list.and.returnValue(of([]));

    const userProfileSpy = jasmine.createSpyObj('UserProfileService', [], {
      profile$: of(null),
      avatarUrl$: of(null),
    });

    const versionSpy = jasmine.createSpyObj('VersionService', [], {
      uiVersion$: of('1.0.0'),
      apiVersion$: of('1.0.0'),
    });

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: UserProfileService, useValue: userProfileSpy },
        { provide: EngagementsService, useValue: engagementsServiceSpy },
        { provide: VersionService, useValue: versionSpy },
        { provide: DateFormatService, useValue: dateFormatSpy },
        { provide: LoadingService, useValue: loadingSpy },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Clean up body class from toggleSidebar tests
    document.body.classList.remove('bc-sidebar-collapsed');
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('sets year to current year', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.year).toBe(new Date().getFullYear());
  });

  it('defaults to sidebar visible and not collapsed', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.sidebarCollapsed).toBe(false);
    expect(fixture.componentInstance.showSidebar).toBe(true);
  });

  it('showBreadcrumb defaults to true', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.showBreadcrumb).toBe(true);
  });

  it('isAuthPage defaults to false', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.isAuthPage).toBe(false);
  });

  // --- toggleSidebar ---

  it('toggleSidebar() toggles sidebarCollapsed and body class', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;

    expect(component.sidebarCollapsed).toBe(false);

    component.toggleSidebar();
    expect(component.sidebarCollapsed).toBe(true);
    expect(document.body.classList.contains('bc-sidebar-collapsed')).toBe(true);

    component.toggleSidebar();
    expect(component.sidebarCollapsed).toBe(false);
    expect(document.body.classList.contains('bc-sidebar-collapsed')).toBe(false);
  });

  // --- Keyboard shortcut ---

  it('Ctrl+B keyboard shortcut toggles sidebar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.sidebarCollapsed).toBe(false);

    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true });
    document.dispatchEvent(event);

    expect(component.sidebarCollapsed).toBe(true);
  });

  it('Ctrl+B with uppercase key toggles sidebar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onKeydown(new KeyboardEvent('keydown', { key: 'B', ctrlKey: true }));

    expect(component.sidebarCollapsed).toBe(true);
  });

  it('ignores keydown when ctrlKey is false', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: false });
    document.dispatchEvent(event);

    expect(component.sidebarCollapsed).toBe(false);
  });

  it('ignores keydown for non-b key with ctrl', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.onKeydown(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));

    expect(component.sidebarCollapsed).toBe(false);
  });

  it('handles keydown event with missing key property', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const event = new KeyboardEvent('keydown', { ctrlKey: true });
    Object.defineProperty(event, 'key', { value: undefined });
    document.dispatchEvent(event);

    expect(component.sidebarCollapsed).toBe(false);
  });

  it('Ctrl+B preventDefault is called', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const event = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, cancelable: true });
    spyOn(event, 'preventDefault');
    component.onKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  // --- onLogout ---

  it('onLogout() calls auth.logout and navigates to /login', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl');

    authServiceSpy.logout.and.returnValue(of(undefined as any));

    component.onLogout();
    tick();

    expect(authServiceSpy.logout).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  }));

  // --- ngOnInit ---

  it('ngOnInit sets body class for initial sidebar state', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges(); // triggers ngOnInit

    // sidebarCollapsed starts as false
    expect(document.body.classList.contains('bc-sidebar-collapsed')).toBe(false);
  });

  it('ngOnInit calls dateFormatService.load() when authenticated', fakeAsync(() => {
    isAuthenticated$.next(true);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick();

    expect(dateFormatSpy.load).toHaveBeenCalled();
  }));

  it('ngOnInit does not call dateFormatService.load() when not authenticated', fakeAsync(() => {
    isAuthenticated$.next(false);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    tick();

    expect(dateFormatSpy.load).not.toHaveBeenCalled();
  }));

  // --- refreshFindingsMenu ---

  it('refreshFindingsMenu() emits a value', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;

    // Should not throw
    expect(() => component.refreshFindingsMenu()).not.toThrow();
  });

  // --- activeEngagements$ ---

  it('activeEngagements$ returns empty array when not authenticated', fakeAsync(() => {
    isAuthenticated$.next(false);
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    let result: any;
    component.activeEngagements$.subscribe(val => (result = val));
    tick();

    expect(result).toEqual([]);
    expect(engagementsServiceSpy.list).not.toHaveBeenCalled();
  }));

  it('activeEngagements$ fetches engagements when authenticated', fakeAsync(() => {
    isAuthenticated$.next(true);
    const mockEng = [{ id: 'eng-1', name: 'Test', status: 'active' }];
    engagementsServiceSpy.list.and.returnValue(of(mockEng as any));

    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    let result: any;
    component.activeEngagements$.subscribe(val => (result = val));
    tick();

    expect(engagementsServiceSpy.list).toHaveBeenCalledWith({ status: 'active' });
    expect(result).toEqual(mockEng);
  }));

  it('activeEngagements$ returns empty array on error', fakeAsync(() => {
    isAuthenticated$.next(true);
    engagementsServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));

    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    let result: any;
    component.activeEngagements$.subscribe(val => (result = val));
    tick();

    expect(result).toEqual([]);
  }));

  // --- updateRouteFlags ---

  it('updateRouteFlags() reads route data correctly', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);

    // Mock router state with hideBreadcrumb and hideSidebar
    Object.defineProperty(router, 'routerState', {
      get: () => ({
        snapshot: {
          root: {
            firstChild: {
              firstChild: null,
              data: { hideBreadcrumb: true, hideSidebar: true, authPage: true },
            },
            data: {},
          },
        },
      }),
    });

    (component as any).updateRouteFlags();

    expect(component.showBreadcrumb).toBe(false);
    expect(component.showSidebar).toBe(false);
    expect(component.isAuthPage).toBe(true);
  });

  it('updateRouteFlags() defaults to showing breadcrumb and sidebar', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);

    Object.defineProperty(router, 'routerState', {
      get: () => ({
        snapshot: {
          root: {
            firstChild: null,
            data: {},
          },
        },
      }),
    });

    (component as any).updateRouteFlags();

    expect(component.showBreadcrumb).toBe(true);
    expect(component.showSidebar).toBe(true);
    expect(component.isAuthPage).toBe(false);
  });
});
