import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { OrganizationsViewComponent } from './organizations-view.component';
import { OrganizationsService } from '../services/organizations.service';
import { AssetsService } from '../../assets/services/assets.service';
import { EngagementsService } from '../../engagements/services/engagements.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { Organization } from '../models/organization.model';
import { Asset } from '../../assets/models/asset.model';

const MOCK_ORG: Organization = {
  id: 'org-1',
  name: 'Acme Corp',
  website: 'https://acme.com',
  status: 'active',
  notes: 'Test notes',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

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
];

describe('OrganizationsViewComponent', () => {
  let component: OrganizationsViewComponent;
  let fixture: ComponentFixture<OrganizationsViewComponent>;

  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;
  let assetsServiceSpy: jasmine.SpyObj<AssetsService>;
  let engagementsServiceSpy: jasmine.SpyObj<EngagementsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let router: Router;
  let navigateSpy: jasmine.Spy;

  beforeEach(async () => {
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['getById', 'delete']);
    assetsServiceSpy = jasmine.createSpyObj('AssetsService', ['list']);
    engagementsServiceSpy = jasmine.createSpyObj('EngagementsService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    orgServiceSpy.getById.and.returnValue(of(MOCK_ORG));
    assetsServiceSpy.list.and.returnValue(of(MOCK_ASSETS));

    await TestBed.configureTestingModule({
      imports: [OrganizationsViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OrganizationsService, useValue: orgServiceSpy },
        { provide: AssetsService, useValue: assetsServiceSpy },
        { provide: EngagementsService, useValue: engagementsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'org-1' } },
            root: { firstChild: null } as any,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationsViewComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    navigateSpy = spyOn(router, 'navigate');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads organization on init', fakeAsync(() => {
    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(orgServiceSpy.getById).toHaveBeenCalledWith('org-1');
    expect(vm.state).toBe('ready');
    expect(vm.organization).toEqual(MOCK_ORG);
  }));

  it('loads assets on init', fakeAsync(() => {
    component.ngOnInit();

    let assetsVm: any;
    component.assetsVm$.subscribe(v => (assetsVm = v));
    tick();

    expect(assetsServiceSpy.list).toHaveBeenCalledWith('org-1');
    expect(assetsVm.state).toBe('ready');
    expect(assetsVm.assets.length).toBe(1);
    expect(assetsVm.total).toBe(1);
  }));

  it('sets state to missing on 404', fakeAsync(() => {
    orgServiceSpy.getById.and.returnValue(throwError(() => ({ status: 404 })));

    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('missing');
    expect(vm.organization).toBeNull();
  }));

  it('sets state to error on non-404 error', fakeAsync(() => {
    orgServiceSpy.getById.and.returnValue(throwError(() => ({ status: 500 })));

    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.organization).toBeNull();
  }));

  it('sets assets state to error on failure', fakeAsync(() => {
    assetsServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));

    component.ngOnInit();

    let assetsVm: any;
    component.assetsVm$.subscribe(v => (assetsVm = v));
    tick();

    expect(assetsVm.state).toBe('error');
    expect(assetsVm.assets.length).toBe(0);
    expect(assetsVm.total).toBe(0);
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

  it('refresh() reloads both org and assets', fakeAsync(() => {
    component.ngOnInit();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    let assetsVm: any;
    component.assetsVm$.subscribe(v => (assetsVm = v));
    tick();

    expect(orgServiceSpy.getById).toHaveBeenCalledTimes(1);
    expect(assetsServiceSpy.list).toHaveBeenCalledTimes(1);

    component.refresh();
    tick();

    expect(orgServiceSpy.getById).toHaveBeenCalledTimes(2);
    expect(assetsServiceSpy.list).toHaveBeenCalledTimes(2);
  }));

  // --- refreshAssets ---

  it('refreshAssets() reloads only assets', fakeAsync(() => {
    component.ngOnInit();

    // Subscribe to both observables to trigger initial loads
    component.vm$.subscribe();
    let assetsVm: any;
    component.assetsVm$.subscribe(v => (assetsVm = v));
    tick();

    expect(assetsServiceSpy.list).toHaveBeenCalledTimes(1);
    expect(orgServiceSpy.getById).toHaveBeenCalledTimes(1);

    component.refreshAssets();
    tick();

    expect(assetsServiceSpy.list).toHaveBeenCalledTimes(2);
    // org should not have been called again
    expect(orgServiceSpy.getById).toHaveBeenCalledTimes(1);
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

  // --- deleteOrganization ---

  it('deleteOrganization() deletes when no engagements exist', fakeAsync(() => {
    engagementsServiceSpy.list.and.returnValue(of([]));
    orgServiceSpy.delete.and.returnValue(of(undefined));

    component.deleteOrganization(MOCK_ORG);
    tick();

    expect(engagementsServiceSpy.list).toHaveBeenCalledWith({ client: 'org-1' });
    expect(orgServiceSpy.delete).toHaveBeenCalledWith('org-1');
    expect(component.deleting$.value).toBe(false);
    expect(navigateSpy).toHaveBeenCalledWith(['/organizations']);
  }));

  it('deleteOrganization() blocks deletion when engagements exist (plural)', fakeAsync(() => {
    engagementsServiceSpy.list.and.returnValue(of([{ id: 'eng-1' }, { id: 'eng-2' }] as any));

    component.deleteOrganization(MOCK_ORG);
    tick();

    expect(orgServiceSpy.delete).not.toHaveBeenCalled();
    expect(notifySpy.error).toHaveBeenCalledWith(
      'Cannot delete "Acme Corp" \u2014 it has 2 engagements. Remove all engagements first.',
    );
    expect(component.deleting$.value).toBe(false);
    expect(component.confirmingDelete$.value).toBe(false);
  }));

  it('deleteOrganization() blocks deletion when one engagement exists (singular)', fakeAsync(() => {
    engagementsServiceSpy.list.and.returnValue(of([{ id: 'eng-1' }] as any));

    component.deleteOrganization(MOCK_ORG);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith(
      'Cannot delete "Acme Corp" \u2014 it has 1 engagement. Remove all engagements first.',
    );
  }));

  it('deleteOrganization() shows error on delete failure with detail', fakeAsync(() => {
    engagementsServiceSpy.list.and.returnValue(of([]));
    orgServiceSpy.delete.and.returnValue(
      throwError(() => ({ error: { detail: 'Server error' } })),
    );

    component.deleteOrganization(MOCK_ORG);
    tick();

    expect(component.deleting$.value).toBe(false);
    expect(component.confirmingDelete$.value).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Server error');
  }));

  it('deleteOrganization() shows generic error when no detail', fakeAsync(() => {
    engagementsServiceSpy.list.and.returnValue(of([]));
    orgServiceSpy.delete.and.returnValue(throwError(() => ({})));

    component.deleteOrganization(MOCK_ORG);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to delete client.');
  }));

  it('deleteOrganization() sets deleting$ to true at start', () => {
    engagementsServiceSpy.list.and.returnValue(of([]));
    orgServiceSpy.delete.and.returnValue(of(undefined));

    let deletingDuringCall = false;
    engagementsServiceSpy.list.and.callFake(() => {
      deletingDuringCall = component.deleting$.value;
      return of([]);
    });
    orgServiceSpy.delete.and.returnValue(of(undefined));

    component.deleteOrganization(MOCK_ORG);

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
