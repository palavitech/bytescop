import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { AssetsCreateComponent } from './assets-create.component';
import { AssetsService } from '../services/assets.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { Asset } from '../models/asset.model';
import { OrganizationRef } from '../../organizations/models/organization.model';

const MOCK_ORGS: OrganizationRef[] = [
  { id: 'org-1', name: 'Acme Corp' },
  { id: 'org-2', name: 'Beta Inc' },
];

const MOCK_CREATED_ASSET: Asset = {
  id: 'asset-new',
  name: 'New Asset',
  client_id: 'org-1',
  client_name: 'Acme Corp',
  asset_type: 'host',
  environment: 'prod',
  criticality: 'medium',
  target: '10.0.0.1',
  notes: '',
  attributes: {},
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('AssetsCreateComponent', () => {
  let component: AssetsCreateComponent;
  let fixture: ComponentFixture<AssetsCreateComponent>;

  let assetsServiceSpy: jasmine.SpyObj<AssetsService>;
  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let routerSpy: jasmine.SpyObj<Router>;
  let profileSpy: jasmine.SpyObj<UserProfileService>;

  function setup(queryParams: { client?: string | null } = {}) {
    assetsServiceSpy = jasmine.createSpyObj('AssetsService', ['create']);
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['ref']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    profileSpy = jasmine.createSpyObj('UserProfileService', ['currentSubscription', 'refreshProfile']);
    profileSpy.currentSubscription.and.returnValue(null);
    profileSpy.refreshProfile.and.returnValue(of({}));

    orgServiceSpy.ref.and.returnValue(of(MOCK_ORGS));

    TestBed.configureTestingModule({
      imports: [AssetsCreateComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AssetsService, useValue: assetsServiceSpy },
        { provide: OrganizationsService, useValue: orgServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: Router, useValue: routerSpy },
        { provide: UserProfileService, useValue: profileSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => null },
              queryParamMap: { get: (key: string) => queryParams.client ?? null },
            },
            root: { firstChild: null } as any,
          },
        },
      ],
    });

    fixture = TestBed.createComponent(AssetsCreateComponent);
    component = fixture.componentInstance;
  }

  beforeEach(async () => {
    await TestBed.resetTestingModule();
    setup();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- constructor ---

  it('loads organization refs on construction', fakeAsync(() => {
    tick();
    expect(orgServiceSpy.ref).toHaveBeenCalled();
    expect(component.organizations$.value).toEqual(MOCK_ORGS);
  }));

  it('reads preselectedClientId from query params', () => {
    expect(component.preselectedClientId).toBeNull();
  });

  it('reads preselectedClientId when query param is set', async () => {
    await TestBed.resetTestingModule();
    setup({ client: 'org-1' });
    expect(component.preselectedClientId).toBe('org-1');
  });

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

  // --- onSubmit success (no preselected client) ---

  it('onSubmit() creates asset and navigates to assets list', fakeAsync(() => {
    assetsServiceSpy.create.and.returnValue(of(MOCK_CREATED_ASSET));

    const formValue = {
      name: 'New Asset',
      client_id: 'org-1',
      asset_type: 'host' as const,
      environment: 'prod' as const,
      criticality: 'medium' as const,
      target: '10.0.0.1',
      notes: '',
    };

    component.onSubmit(formValue);
    tick();

    expect(assetsServiceSpy.create).toHaveBeenCalledWith(formValue);
    expect(component.saving$.value).toBe(false);
    expect(notifySpy.success).not.toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/assets']);
  }));

  // --- onSubmit success (with preselected client) ---

  it('onSubmit() navigates to organization page when preselectedClientId is set', async () => {
    await TestBed.resetTestingModule();
    setup({ client: 'org-1' });

    assetsServiceSpy.create.and.returnValue(of(MOCK_CREATED_ASSET));

    component.onSubmit({
      name: 'New Asset',
      client_id: 'org-1',
      asset_type: 'host',
      environment: 'prod',
      criticality: 'medium',
      target: '',
      notes: '',
    });

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/organizations', 'org-1']);
  });

  it('onSubmit() sets saving$ to true before request', () => {
    let savingDuringCall = false;
    assetsServiceSpy.create.and.callFake(() => {
      savingDuringCall = component.saving$.value;
      return of(MOCK_CREATED_ASSET);
    });

    component.onSubmit({
      name: 'Test', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });

    expect(savingDuringCall).toBe(true);
  });

  it('onSubmit() clears serverError$ before request', fakeAsync(() => {
    assetsServiceSpy.create.and.returnValue(of(MOCK_CREATED_ASSET));
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
    assetsServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { detail: 'Bad request' } })),
    );

    component.onSubmit({
      name: 'Test', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });
    tick();

    expect(component.saving$.value).toBe(false);
    expect(component.serverError$.value).toBe('Bad request');
    expect(notifySpy.error).toHaveBeenCalledWith('Bad request');
  }));

  it('onSubmit() shows error on failure with name field error', fakeAsync(() => {
    assetsServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { name: ['Name already exists'] } })),
    );

    component.onSubmit({
      name: 'Test', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });
    tick();

    expect(component.serverError$.value).toBe('Name already exists');
  }));

  it('onSubmit() shows generic error when no specific field', fakeAsync(() => {
    assetsServiceSpy.create.and.returnValue(throwError(() => ({})));

    component.onSubmit({
      name: 'Test', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });
    tick();

    expect(component.serverError$.value).toBe('Failed to create asset.');
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to create asset.');
  }));

  // --- onCancel ---

  it('onCancel() calls location.back()', () => {
    component.onCancel();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  // --- Initial state ---

  it('saving$ starts as false', () => {
    expect(component.saving$.value).toBe(false);
  });

  it('serverError$ starts as null', () => {
    expect(component.serverError$.value).toBeNull();
  });

  // --- Subscription limit pre-checks ---

  it('blocks create when asset limit is reached', () => {
    profileSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_members: 3, max_clients: 5, max_assets: 10, max_projects: 0, max_engagements: 5, max_findings_per_engagement: 20, max_images_per_finding: 5 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 1, clients: 2, assets: 10, projects: 0, engagements: 0 },
    });

    component.onSubmit({
      name: 'Test', client_id: null, asset_type: 'host',
      environment: 'prod', criticality: 'medium', target: '', notes: '',
    });

    expect(notifySpy.error).toHaveBeenCalledWith('Asset limit reached (10/10). Upgrade your plan to add more.');
    expect(assetsServiceSpy.create).not.toHaveBeenCalled();
  });

});
