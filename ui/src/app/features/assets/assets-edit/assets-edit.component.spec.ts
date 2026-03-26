import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { AssetsEditComponent } from './assets-edit.component';
import { AssetsService } from '../services/assets.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { Asset } from '../models/asset.model';
import { OrganizationRef } from '../../organizations/models/organization.model';

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

const MOCK_ORGS: OrganizationRef[] = [
  { id: 'org-1', name: 'Acme Corp' },
  { id: 'org-2', name: 'Beta Inc' },
];

describe('AssetsEditComponent', () => {
  let component: AssetsEditComponent;
  let fixture: ComponentFixture<AssetsEditComponent>;

  let assetsServiceSpy: jasmine.SpyObj<AssetsService>;
  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    assetsServiceSpy = jasmine.createSpyObj('AssetsService', ['getById', 'update']);
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['ref']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    assetsServiceSpy.getById.and.returnValue(of(MOCK_ASSET));
    orgServiceSpy.ref.and.returnValue(of(MOCK_ORGS));

    await TestBed.configureTestingModule({
      imports: [AssetsEditComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AssetsService, useValue: assetsServiceSpy },
        { provide: OrganizationsService, useValue: orgServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'asset-1' } },
            root: { firstChild: null } as any,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssetsEditComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads asset and organizations on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(assetsServiceSpy.getById).toHaveBeenCalledWith('asset-1');
    expect(orgServiceSpy.ref).toHaveBeenCalled();
    expect(component.asset$.value).toEqual(MOCK_ASSET);
    expect(component.organizations$.value).toEqual(MOCK_ORGS);
    expect(component.loading$.value).toBe(false);
  }));

  it('shows error when forkJoin fails', fakeAsync(() => {
    assetsServiceSpy.getById.and.returnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to load asset details.');
    expect(component.loading$.value).toBe(false);
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

  // --- onSubmit success ---

  it('onSubmit() calls update and navigates to org on success (with client)', fakeAsync(() => {
    assetsServiceSpy.update.and.returnValue(of(MOCK_ASSET));
    fixture.detectChanges();
    tick();

    const formValue = {
      name: 'Updated', client_id: 'org-1', asset_type: 'host' as const,
      environment: 'prod' as const, criticality: 'high' as const, target: '', notes: '',
    };
    component.onSubmit(formValue);
    tick();

    expect(assetsServiceSpy.update).toHaveBeenCalledWith('asset-1', formValue);
    expect(component.saving$.value).toBe(false);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/organizations', 'org-1']);
  }));

  it('onSubmit() navigates to /assets when asset has no client', fakeAsync(() => {
    assetsServiceSpy.getById.and.returnValue(of(MOCK_ASSET_NO_CLIENT));
    assetsServiceSpy.update.and.returnValue(of(MOCK_ASSET_NO_CLIENT));

    fixture.detectChanges();
    tick();

    component.onSubmit({
      name: 'Updated', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });
    tick();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/assets']);
  }));

  it('onSubmit() sets saving$ to true before request', fakeAsync(() => {
    let savingDuringCall = false;
    assetsServiceSpy.update.and.callFake(() => {
      savingDuringCall = component.saving$.value;
      return of(MOCK_ASSET);
    });

    fixture.detectChanges();
    tick();

    component.onSubmit({
      name: 'Test', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });
    tick();

    expect(savingDuringCall).toBe(true);
  }));

  it('onSubmit() clears serverError$ before request', fakeAsync(() => {
    assetsServiceSpy.update.and.returnValue(of(MOCK_ASSET));
    fixture.detectChanges();
    tick();

    component.serverError$.next('old error');
    component.onSubmit({
      name: 'Test', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });
    tick();

    expect(component.serverError$.value).toBeNull();
  }));

  // --- onSubmit error ---

  it('onSubmit() shows error on failure with detail', fakeAsync(() => {
    assetsServiceSpy.update.and.returnValue(
      throwError(() => ({ error: { detail: 'Validation failed' } })),
    );
    fixture.detectChanges();
    tick();

    component.onSubmit({
      name: 'Test', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });
    tick();

    expect(component.saving$.value).toBe(false);
    expect(component.serverError$.value).toBe('Validation failed');
    expect(notifySpy.error).toHaveBeenCalledWith('Validation failed');
  }));

  it('onSubmit() shows generic error when no detail', fakeAsync(() => {
    assetsServiceSpy.update.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.onSubmit({
      name: 'Test', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });
    tick();

    expect(component.serverError$.value).toBe('Failed to update asset.');
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to update asset.');
  }));

  // --- onCancel ---

  it('onCancel() navigates to org when asset has client_id', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.onCancel();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/organizations', 'org-1']);
  }));

  it('onCancel() navigates to /assets when asset has no client_id', fakeAsync(() => {
    assetsServiceSpy.getById.and.returnValue(of(MOCK_ASSET_NO_CLIENT));

    fixture.detectChanges();
    tick();

    component.onCancel();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/assets']);
  }));

  // --- Initial state ---

  it('saving$ starts as false', () => {
    expect(component.saving$.value).toBe(false);
  });

  it('loading$ starts as true', () => {
    expect(component.loading$.value).toBe(true);
  });

  it('asset$ starts as null', () => {
    expect(component.asset$.value).toBeNull();
  });

  it('organizations$ starts as empty array', () => {
    expect(component.organizations$.value).toEqual([]);
  });

  it('serverError$ starts as null', () => {
    expect(component.serverError$.value).toBeNull();
  });
});
