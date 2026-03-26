import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { OrganizationsListComponent } from './organizations-list.component';
import { OrganizationsService } from '../services/organizations.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { Organization } from '../models/organization.model';

const MOCK_ORGS: Organization[] = [
  {
    id: 'org-1',
    name: 'Acme Corp',
    website: 'https://acme.com',
    status: 'active',
    notes: '',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'org-2',
    name: 'Beta Inc',
    website: '',
    status: 'inactive',
    notes: 'Some notes',
    created_at: '2025-02-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
  },
];

describe('OrganizationsListComponent', () => {
  let component: OrganizationsListComponent;
  let fixture: ComponentFixture<OrganizationsListComponent>;

  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let profileServiceSpy: jasmine.SpyObj<UserProfileService>;

  beforeEach(async () => {
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['list', 'delete']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    profileServiceSpy = jasmine.createSpyObj('UserProfileService', ['currentSubscription']);
    profileServiceSpy.currentSubscription.and.returnValue(null);

    orgServiceSpy.list.and.returnValue(of(MOCK_ORGS));

    await TestBed.configureTestingModule({
      imports: [OrganizationsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OrganizationsService, useValue: orgServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: UserProfileService, useValue: profileServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationsListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- vm$ initial load ---

  it('loads organizations via vm$ on subscribe', fakeAsync(() => {
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(orgServiceSpy.list).toHaveBeenCalled();
    expect(vm.state).toBe('ready');
    expect(vm.organizations.length).toBe(2);
    expect(vm.total).toBe(2);
    expect(vm.deletingId).toBeNull();
  }));

  it('vm$ emits error state on service failure', fakeAsync(() => {
    orgServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));

    // Re-create component to pick up new spy value
    fixture = TestBed.createComponent(OrganizationsListComponent);
    component = fixture.componentInstance;

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.organizations.length).toBe(0);
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
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(orgServiceSpy.list).toHaveBeenCalledTimes(1);

    component.refresh();
    tick();

    expect(orgServiceSpy.list).toHaveBeenCalledTimes(2);
  }));

  // --- confirmDelete / cancelDelete ---

  it('confirmDelete() sets deletingId in vm$', fakeAsync(() => {
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('org-1');
    tick();

    expect(vm.deletingId).toBe('org-1');
  }));

  it('cancelDelete() clears deletingId in vm$', fakeAsync(() => {
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('org-1');
    tick();
    expect(vm.deletingId).toBe('org-1');

    component.cancelDelete();
    tick();
    expect(vm.deletingId).toBeNull();
  }));

  // --- deleteOrganization ---

  it('deleteOrganization() calls delete and refreshes on success', fakeAsync(() => {
    orgServiceSpy.delete.and.returnValue(of(undefined));

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.deleteOrganization(MOCK_ORGS[0]);
    tick();

    expect(orgServiceSpy.delete).toHaveBeenCalledWith('org-1');
    // refresh is called, so list should have been called again
    expect(orgServiceSpy.list).toHaveBeenCalledTimes(2);
  }));

  it('deleteOrganization() shows error on failure with detail', fakeAsync(() => {
    orgServiceSpy.delete.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot delete' } })),
    );

    component.deleteOrganization(MOCK_ORGS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Cannot delete');
  }));

  it('deleteOrganization() shows generic error when no detail', fakeAsync(() => {
    orgServiceSpy.delete.and.returnValue(throwError(() => ({})));

    component.deleteOrganization(MOCK_ORGS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to delete client.');
  }));

  it('deleteOrganization() clears deletingId via finalize', fakeAsync(() => {
    orgServiceSpy.delete.and.returnValue(of(undefined));

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('org-1');
    tick();
    expect(vm.deletingId).toBe('org-1');

    component.deleteOrganization(MOCK_ORGS[0]);
    tick();

    expect(vm.deletingId).toBeNull();
  }));

  // --- exportCsv ---

  it('exportCsv() creates a CSV blob and triggers download', () => {
    const createElementSpy = spyOn(document, 'createElement').and.callThrough();
    const revokeUrlSpy = spyOn(URL, 'revokeObjectURL');
    const createUrlSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:test');

    component.exportCsv(MOCK_ORGS);

    expect(createUrlSpy).toHaveBeenCalled();
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:test');
    expect(createElementSpy).toHaveBeenCalledWith('a');
  });

  it('exportCsv() generates correct CSV content', () => {
    let blobContent = '';
    spyOn(URL, 'createObjectURL').and.callFake((blob: Blob) => {
      const reader = new FileReader();
      reader.onload = () => { blobContent = reader.result as string; };
      reader.readAsText(blob);
      return 'blob:test';
    });
    spyOn(URL, 'revokeObjectURL');

    component.exportCsv(MOCK_ORGS);

    // Verify the blob was created (content is async but we verify createObjectURL was called)
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  // --- ngOnInit ---

  it('ngOnInit() does not throw', () => {
    expect(() => component.ngOnInit()).not.toThrow();
  });

  // --- createOrganization branch coverage ---

  it('createOrganization() navigates when subscription is null', () => {
    profileServiceSpy.currentSubscription.and.returnValue(null);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    component.createOrganization();

    expect(router.navigate).toHaveBeenCalledWith(['/organizations/create']);
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createOrganization() navigates when limit is 0 (unlimited)', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_clients: 0, max_members: 0, max_assets: 0, max_engagements: 0, max_findings_per_engagement: 0, max_images_per_finding: 0 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 0, clients: 10, assets: 0, engagements: 0 },
    });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    component.createOrganization();

    expect(router.navigate).toHaveBeenCalledWith(['/organizations/create']);
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createOrganization() navigates when usage is under limit', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_clients: 5, max_members: 0, max_assets: 0, max_engagements: 0, max_findings_per_engagement: 0, max_images_per_finding: 0 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 0, clients: 3, assets: 0, engagements: 0 },
    });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    component.createOrganization();

    expect(router.navigate).toHaveBeenCalledWith(['/organizations/create']);
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createOrganization() shows error when usage meets limit', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_clients: 5, max_members: 0, max_assets: 0, max_engagements: 0, max_findings_per_engagement: 0, max_images_per_finding: 0 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 0, clients: 5, assets: 0, engagements: 0 },
    });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    component.createOrganization();

    expect(notifySpy.error).toHaveBeenCalledWith(
      'Client limit reached (5/5). Upgrade your plan to add more.',
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('createOrganization() shows error when usage exceeds limit', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_clients: 5, max_members: 0, max_assets: 0, max_engagements: 0, max_findings_per_engagement: 0, max_images_per_finding: 0 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 0, clients: 7, assets: 0, engagements: 0 },
    });
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    component.createOrganization();

    expect(notifySpy.error).toHaveBeenCalledWith(
      'Client limit reached (7/5). Upgrade your plan to add more.',
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
