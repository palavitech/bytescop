import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { AssetsListComponent } from './assets-list.component';
import { AssetsService } from '../services/assets.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { Asset } from '../models/asset.model';

const MOCK_ASSETS: Asset[] = [
  {
    id: 'asset-1',
    name: 'Web Server',
    client_id: 'org-1',
    client_name: 'Acme Corp',
    asset_type: 'host',
    environment: 'prod',
    criticality: 'high',
    target: '10.0.0.1',
    notes: '',
    attributes: {},
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'asset-2',
    name: 'API Gateway',
    client_id: 'org-1',
    client_name: 'Acme Corp',
    asset_type: 'api',
    environment: 'staging',
    criticality: 'medium',
    target: 'https://api.acme.com',
    notes: '',
    attributes: {},
    created_at: '2025-02-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
  },
];

describe('AssetsListComponent', () => {
  let component: AssetsListComponent;
  let fixture: ComponentFixture<AssetsListComponent>;

  let assetsServiceSpy: jasmine.SpyObj<AssetsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let profileServiceSpy: jasmine.SpyObj<UserProfileService>;

  function setup(queryParams: { client?: string | null } = {}) {
    assetsServiceSpy = jasmine.createSpyObj('AssetsService', ['list', 'delete']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    profileServiceSpy = jasmine.createSpyObj('UserProfileService', ['currentSubscription']);

    assetsServiceSpy.list.and.returnValue(of(MOCK_ASSETS));

    TestBed.configureTestingModule({
      imports: [AssetsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AssetsService, useValue: assetsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: UserProfileService, useValue: profileServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: (key: string) => queryParams.client ?? null },
            },
            root: { firstChild: null } as any,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(AssetsListComponent);
    component = fixture.componentInstance;
  }

  beforeEach(async () => {
    await TestBed.resetTestingModule();
    setup();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads assets on init without client filter', fakeAsync(() => {
    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(assetsServiceSpy.list).toHaveBeenCalledWith(undefined);
    expect(vm.state).toBe('ready');
    expect(vm.assets.length).toBe(2);
    expect(vm.total).toBe(2);
    expect(vm.deletingId).toBeNull();
    expect(vm.clientFilter).toBeNull();
  }));

  it('loads assets with client filter from query param', async () => {
    await TestBed.resetTestingModule();
    setup({ client: 'org-1' });

    component.ngOnInit();

    let vm: any;
    await new Promise<void>(resolve => {
      component.vm$.subscribe(v => {
        vm = v;
        resolve();
      });
    });

    expect(assetsServiceSpy.list).toHaveBeenCalledWith('org-1');
    expect(vm.clientFilter).toBe('org-1');
  });

  it('handles error on asset load', fakeAsync(() => {
    assetsServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));

    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.assets.length).toBe(0);
  }));

  // --- goBack ---

  it('goBack() calls location.back()', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  // --- toggleHelp ---

  it('toggleHelp() toggles showHelp flag', () => {
    expect(component.showHelp).toBe(false);
    component.toggleHelp();
    expect(component.showHelp).toBe(true);
    component.toggleHelp();
    expect(component.showHelp).toBe(false);
  });

  // --- refresh ---

  it('refresh() triggers a reload', fakeAsync(() => {
    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(assetsServiceSpy.list).toHaveBeenCalledTimes(1);

    component.refresh();
    tick();

    expect(assetsServiceSpy.list).toHaveBeenCalledTimes(2);
  }));

  // --- confirmDelete / cancelDelete ---

  it('confirmDelete() sets deletingId in vm$', fakeAsync(() => {
    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('asset-1');
    tick();

    expect(vm.deletingId).toBe('asset-1');
  }));

  it('cancelDelete() clears deletingId', fakeAsync(() => {
    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('asset-1');
    tick();
    expect(vm.deletingId).toBe('asset-1');

    component.cancelDelete();
    tick();
    expect(vm.deletingId).toBeNull();
  }));

  // --- deleteAsset ---

  it('deleteAsset() calls delete and refreshes on success', fakeAsync(() => {
    assetsServiceSpy.delete.and.returnValue(of(undefined));

    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.deleteAsset(MOCK_ASSETS[0]);
    tick();

    expect(assetsServiceSpy.delete).toHaveBeenCalledWith('asset-1');
    expect(assetsServiceSpy.list).toHaveBeenCalledTimes(2);
  }));

  it('deleteAsset() shows error on failure with detail', fakeAsync(() => {
    assetsServiceSpy.delete.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot delete' } })),
    );

    component.deleteAsset(MOCK_ASSETS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Cannot delete');
  }));

  it('deleteAsset() shows generic error when no detail', fakeAsync(() => {
    assetsServiceSpy.delete.and.returnValue(throwError(() => ({})));

    component.deleteAsset(MOCK_ASSETS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to delete asset.');
  }));

  it('deleteAsset() clears deletingId via finalize', fakeAsync(() => {
    assetsServiceSpy.delete.and.returnValue(of(undefined));

    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('asset-1');
    tick();
    expect(vm.deletingId).toBe('asset-1');

    component.deleteAsset(MOCK_ASSETS[0]);
    tick();

    expect(vm.deletingId).toBeNull();
  }));

  // --- exportCsv ---

  it('exportCsv() creates a CSV and triggers download', () => {
    const createElementSpy = spyOn(document, 'createElement').and.callThrough();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.exportCsv(MOCK_ASSETS);

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(createElementSpy).toHaveBeenCalledWith('a');
  });

  // --- label helpers ---

  it('typeLabel() returns mapped label for known type', () => {
    expect(component.typeLabel('host')).toBe('Host');
    expect(component.typeLabel('webapp')).toBe('WebApp');
    expect(component.typeLabel('api')).toBe('API');
    expect(component.typeLabel('cloud')).toBe('Cloud');
    expect(component.typeLabel('network_device')).toBe('Network Device');
    expect(component.typeLabel('mobile_app')).toBe('Mobile App');
    expect(component.typeLabel('other')).toBe('Other');
  });

  it('typeLabel() returns raw value for unknown type', () => {
    expect(component.typeLabel('unknown')).toBe('unknown');
  });

  it('envLabel() returns mapped label for known env', () => {
    expect(component.envLabel('prod')).toBe('Prod');
    expect(component.envLabel('staging')).toBe('Staging');
    expect(component.envLabel('dev')).toBe('Dev');
    expect(component.envLabel('lab')).toBe('Lab');
  });

  it('envLabel() returns raw value for unknown env', () => {
    expect(component.envLabel('unknown')).toBe('unknown');
  });

  it('critLabel() returns mapped label for known criticality', () => {
    expect(component.critLabel('low')).toBe('Low');
    expect(component.critLabel('medium')).toBe('Medium');
    expect(component.critLabel('high')).toBe('High');
  });

  it('critLabel() returns raw value for unknown criticality', () => {
    expect(component.critLabel('unknown')).toBe('unknown');
  });

  // --- createAsset ---

  it('createAsset() navigates when subscription is null', () => {
    profileServiceSpy.currentSubscription.and.returnValue(null);
    const routerSpy = spyOn(component['router'], 'navigate');

    component.createAsset();

    expect(routerSpy).toHaveBeenCalledWith(['/assets/create'], { queryParams: {} });
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createAsset() navigates when limits is undefined', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: undefined as any,
      features: {},
      usage: { assets: 3 },
    } as any);
    const routerSpy = spyOn(component['router'], 'navigate');

    component.createAsset();

    expect(routerSpy).toHaveBeenCalledWith(['/assets/create'], { queryParams: {} });
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createAsset() navigates when max_assets is 0 (unlimited)', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'pro',
      plan_name: 'Pro',
      limits: { max_assets: 0 },
      features: {},
      usage: { assets: 100 },
    } as any);
    const routerSpy = spyOn(component['router'], 'navigate');

    component.createAsset();

    expect(routerSpy).toHaveBeenCalledWith(['/assets/create'], { queryParams: {} });
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createAsset() navigates when usage is below limit', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_assets: 10 },
      features: {},
      usage: { assets: 5 },
    } as any);
    const routerSpy = spyOn(component['router'], 'navigate');

    component.createAsset();

    expect(routerSpy).toHaveBeenCalledWith(['/assets/create'], { queryParams: {} });
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createAsset() shows error when asset limit is reached', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_assets: 10 },
      features: {},
      usage: { assets: 10 },
    } as any);
    const routerSpy = spyOn(component['router'], 'navigate');

    component.createAsset();

    expect(notifySpy.error).toHaveBeenCalledWith('Asset limit reached (10/10). Upgrade your plan to add more.');
    expect(routerSpy).not.toHaveBeenCalled();
  });

  it('createAsset() shows error when usage exceeds limit', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_assets: 5 },
      features: {},
      usage: { assets: 7 },
    } as any);
    const routerSpy = spyOn(component['router'], 'navigate');

    component.createAsset();

    expect(notifySpy.error).toHaveBeenCalledWith('Asset limit reached (7/5). Upgrade your plan to add more.');
    expect(routerSpy).not.toHaveBeenCalled();
  });

  it('createAsset() passes client filter as query param when set', async () => {
    await TestBed.resetTestingModule();
    setup({ client: 'org-1' });

    profileServiceSpy.currentSubscription.and.returnValue(null);
    const routerSpy = spyOn(component['router'], 'navigate');

    component.ngOnInit();
    component.createAsset();

    expect(routerSpy).toHaveBeenCalledWith(['/assets/create'], { queryParams: { client: 'org-1' } });
  });

  it('createAsset() navigates with empty query params when no client filter', () => {
    profileServiceSpy.currentSubscription.and.returnValue(null);
    const routerSpy = spyOn(component['router'], 'navigate');

    component.ngOnInit();
    component.createAsset();

    expect(routerSpy).toHaveBeenCalledWith(['/assets/create'], { queryParams: {} });
  });

  it('createAsset() navigates when usage is undefined but limit is set', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_assets: 10 },
      features: {},
      usage: undefined as any,
    } as any);
    const routerSpy = spyOn(component['router'], 'navigate');

    component.createAsset();

    expect(routerSpy).toHaveBeenCalledWith(['/assets/create'], { queryParams: {} });
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  // --- deleteAsset error with null err ---

  it('deleteAsset() shows generic error when err is null', fakeAsync(() => {
    assetsServiceSpy.delete.and.returnValue(throwError(() => null));

    component.deleteAsset(MOCK_ASSETS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to delete asset.');
  }));
});
