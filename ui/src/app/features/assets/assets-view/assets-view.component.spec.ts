import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { AssetsViewComponent } from './assets-view.component';
import { AssetsService } from '../services/assets.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { Asset } from '../models/asset.model';

const MOCK_ASSET: Asset = {
  id: 'asset-1',
  name: 'Web Server',
  client_id: 'org-1',
  client_name: 'Acme Corp',
  asset_type: 'host',
  environment: 'prod',
  criticality: 'high',
  target: '10.0.0.1',
  notes: 'Production server',
  attributes: {},
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_ASSET_NO_CLIENT: Asset = {
  ...MOCK_ASSET,
  id: 'asset-2',
  client_id: null,
  client_name: '',
};

describe('AssetsViewComponent', () => {
  let component: AssetsViewComponent;
  let fixture: ComponentFixture<AssetsViewComponent>;

  let assetsServiceSpy: jasmine.SpyObj<AssetsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let router: Router;
  let navigateSpy: jasmine.Spy;

  beforeEach(async () => {
    assetsServiceSpy = jasmine.createSpyObj('AssetsService', ['getById', 'delete', 'scopeUsage']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    assetsServiceSpy.getById.and.returnValue(of(MOCK_ASSET));

    await TestBed.configureTestingModule({
      imports: [AssetsViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AssetsService, useValue: assetsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'asset-1' } },
            root: { firstChild: null } as any,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssetsViewComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    navigateSpy = spyOn(router, 'navigate');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads asset on init', fakeAsync(() => {
    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(assetsServiceSpy.getById).toHaveBeenCalledWith('asset-1');
    expect(vm.state).toBe('ready');
    expect(vm.asset).toEqual(MOCK_ASSET);
  }));

  it('sets state to missing on 404', fakeAsync(() => {
    assetsServiceSpy.getById.and.returnValue(throwError(() => ({ status: 404 })));

    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('missing');
    expect(vm.asset).toBeNull();
  }));

  it('sets state to error on non-404 error', fakeAsync(() => {
    assetsServiceSpy.getById.and.returnValue(throwError(() => ({ status: 500 })));

    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.asset).toBeNull();
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

  it('refresh() reloads asset', fakeAsync(() => {
    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(assetsServiceSpy.getById).toHaveBeenCalledTimes(1);

    component.refresh();
    tick();

    expect(assetsServiceSpy.getById).toHaveBeenCalledTimes(2);
  }));

  // --- confirmDelete / cancelDelete ---

  it('confirmDelete() sets confirmingDelete$ to true', () => {
    component.confirmDelete();
    expect(component.confirmingDelete$.value).toBe(true);
  });

  it('cancelDelete() sets confirmingDelete$ to false', () => {
    component.confirmDelete();
    component.cancelDelete();
    expect(component.confirmingDelete$.value).toBe(false);
  });

  // --- deleteAsset (no scope usage) ---

  it('deleteAsset() deletes when scope usage is 0 and navigates to org', fakeAsync(() => {
    assetsServiceSpy.scopeUsage.and.returnValue(of({ count: 0 }));
    assetsServiceSpy.delete.and.returnValue(of(undefined));

    component.deleteAsset(MOCK_ASSET);
    tick();

    expect(assetsServiceSpy.scopeUsage).toHaveBeenCalledWith('asset-1');
    expect(assetsServiceSpy.delete).toHaveBeenCalledWith('asset-1');
    expect(component.deleting$.value).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/organizations', 'org-1']);
  }));

  it('deleteAsset() navigates to /assets when asset has no client_id', fakeAsync(() => {
    assetsServiceSpy.scopeUsage.and.returnValue(of({ count: 0 }));
    assetsServiceSpy.delete.and.returnValue(of(undefined));

    component.deleteAsset(MOCK_ASSET_NO_CLIENT);
    tick();

    expect(navigateSpy).toHaveBeenCalledWith(['/assets']);
  }));

  // --- deleteAsset (blocked by scope usage) ---

  it('deleteAsset() blocks deletion when scope usage > 0 (plural)', fakeAsync(() => {
    assetsServiceSpy.scopeUsage.and.returnValue(of({ count: 3 }));

    component.deleteAsset(MOCK_ASSET);
    tick();

    expect(assetsServiceSpy.delete).not.toHaveBeenCalled();
    expect(notifySpy.error).toHaveBeenCalledWith(
      'Cannot delete "Web Server" \u2014 it is referenced in 3 Statements of Work. Remove it from all engagement scopes first.',
    );
    expect(component.deleting$.value).toBe(false);
    expect(component.confirmingDelete$.value).toBe(false);
  }));

  it('deleteAsset() blocks deletion when scope usage is 1 (singular)', fakeAsync(() => {
    assetsServiceSpy.scopeUsage.and.returnValue(of({ count: 1 }));

    component.deleteAsset(MOCK_ASSET);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith(
      'Cannot delete "Web Server" \u2014 it is referenced in 1 Statement of Work. Remove it from all engagement scopes first.',
    );
  }));

  // --- deleteAsset (error) ---

  it('deleteAsset() shows error on delete failure with detail', fakeAsync(() => {
    assetsServiceSpy.scopeUsage.and.returnValue(of({ count: 0 }));
    assetsServiceSpy.delete.and.returnValue(
      throwError(() => ({ error: { detail: 'Server error' } })),
    );

    component.deleteAsset(MOCK_ASSET);
    tick();

    expect(component.deleting$.value).toBe(false);
    expect(component.confirmingDelete$.value).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Server error');
  }));

  it('deleteAsset() shows generic error when no detail', fakeAsync(() => {
    assetsServiceSpy.scopeUsage.and.returnValue(of({ count: 0 }));
    assetsServiceSpy.delete.and.returnValue(throwError(() => ({})));

    component.deleteAsset(MOCK_ASSET);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to delete asset.');
  }));

  it('deleteAsset() sets deleting$ to true at start', () => {
    let deletingDuringCall = false;
    assetsServiceSpy.scopeUsage.and.callFake(() => {
      deletingDuringCall = component.deleting$.value;
      return of({ count: 0 });
    });
    assetsServiceSpy.delete.and.returnValue(of(undefined));

    component.deleteAsset(MOCK_ASSET);

    expect(deletingDuringCall).toBe(true);
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
});
