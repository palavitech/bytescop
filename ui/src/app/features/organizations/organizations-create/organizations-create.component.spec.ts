import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { OrganizationsCreateComponent } from './organizations-create.component';
import { OrganizationsService } from '../services/organizations.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { Organization } from '../models/organization.model';

const MOCK_CREATED_ORG: Organization = {
  id: 'org-new',
  name: 'New Org',
  website: 'https://new.com',
  status: 'active',
  notes: '',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('OrganizationsCreateComponent', () => {
  let component: OrganizationsCreateComponent;
  let fixture: ComponentFixture<OrganizationsCreateComponent>;

  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let routerSpy: jasmine.SpyObj<Router>;
  let profileSpy: jasmine.SpyObj<UserProfileService>;

  beforeEach(async () => {
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['create']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    profileSpy = jasmine.createSpyObj('UserProfileService', ['currentSubscription', 'refreshProfile']);
    profileSpy.currentSubscription.and.returnValue(null);
    profileSpy.refreshProfile.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [OrganizationsCreateComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OrganizationsService, useValue: orgServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: Router, useValue: routerSpy },
        { provide: UserProfileService, useValue: profileSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationsCreateComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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

  // --- onSubmit success ---

  it('onSubmit() calls create and navigates on success', fakeAsync(() => {
    orgServiceSpy.create.and.returnValue(of(MOCK_CREATED_ORG));

    const formValue = { name: 'New Org', website: 'https://new.com', status: 'active' as const, notes: '' };

    component.onSubmit(formValue);
    tick();

    expect(orgServiceSpy.create).toHaveBeenCalledWith(formValue);
    expect(component.saving$.value).toBe(false);
    expect(notifySpy.success).not.toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/organizations']);
  }));

  it('onSubmit() sets saving$ to true before request', () => {
    orgServiceSpy.create.and.returnValue(of(MOCK_CREATED_ORG));

    // Check saving$ is true during the call
    let savingDuringCall = false;
    orgServiceSpy.create.and.callFake(() => {
      savingDuringCall = component.saving$.value;
      return of(MOCK_CREATED_ORG);
    });

    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });

    expect(savingDuringCall).toBe(true);
  });

  it('onSubmit() clears serverError$ before request', fakeAsync(() => {
    orgServiceSpy.create.and.returnValue(of(MOCK_CREATED_ORG));
    component.serverError$.next('old error');

    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });
    tick();

    expect(component.serverError$.value).toBeNull();
  }));

  // --- onSubmit error ---

  it('onSubmit() shows error on failure with detail', fakeAsync(() => {
    orgServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { detail: 'Name taken' } })),
    );

    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });
    tick();

    expect(component.saving$.value).toBe(false);
    expect(component.serverError$.value).toBe('Name taken');
    expect(notifySpy.error).toHaveBeenCalledWith('Name taken');
  }));

  it('onSubmit() shows error on failure with name field error', fakeAsync(() => {
    orgServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { name: ['Name already exists'] } })),
    );

    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });
    tick();

    expect(component.serverError$.value).toBe('Name already exists');
    expect(notifySpy.error).toHaveBeenCalledWith('Name already exists');
  }));

  it('onSubmit() shows generic error when no specific field', fakeAsync(() => {
    orgServiceSpy.create.and.returnValue(throwError(() => ({})));

    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });
    tick();

    expect(component.serverError$.value).toBe('Failed to create client.');
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to create client.');
  }));

  // --- onCancel ---

  it('onCancel() navigates to organizations list', () => {
    component.onCancel();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/organizations']);
  });

  // --- Initial state ---

  it('saving$ starts as false', () => {
    expect(component.saving$.value).toBe(false);
  });

  it('serverError$ starts as null', () => {
    expect(component.serverError$.value).toBeNull();
  });

  // --- Subscription limit pre-checks ---

  it('blocks create when client limit is reached', () => {
    profileSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_members: 3, max_clients: 5, max_assets: 10, max_projects: 0, max_engagements: 5, max_findings_per_engagement: 20, max_images_per_finding: 5 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 1, clients: 5, assets: 0, projects: 0, engagements: 0 },
    });

    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });

    expect(notifySpy.error).toHaveBeenCalledWith('Client limit reached (5/5). Upgrade your plan to add more.');
    expect(orgServiceSpy.create).not.toHaveBeenCalled();
  });

});
