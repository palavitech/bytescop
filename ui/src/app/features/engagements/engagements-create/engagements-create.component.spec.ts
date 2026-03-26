import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError, Subject } from 'rxjs';

import { EngagementsCreateComponent } from './engagements-create.component';
import { EngagementsService } from '../services/engagements.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { Engagement } from '../models/engagement.model';
import { EngagementFormValue } from '../engagement-form/engagement-form.component';

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-new',
  name: 'New Engagement',
  client_id: 'client-1',
  client_name: 'Acme Corp',
  status: 'planned',
  description: '',
  notes: '',
  start_date: '2025-03-01',
  end_date: null,
  findings_summary: null,
  created_at: '2025-03-01T00:00:00Z',
  updated_at: '2025-03-01T00:00:00Z',
};

const MOCK_FORM_VALUE: EngagementFormValue = {
  name: 'New Engagement',
  client_id: 'client-1',
  status: 'planned',
  start_date: '2025-03-01',
  end_date: '',
  description: '',
  notes: '',
};

describe('EngagementsCreateComponent', () => {
  let component: EngagementsCreateComponent;
  let fixture: ComponentFixture<EngagementsCreateComponent>;
  let router: Router;

  let engServiceSpy: jasmine.SpyObj<EngagementsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;
  let profileSpy: jasmine.SpyObj<UserProfileService>;

  const setupTestBed = async (queryParams: Record<string, string> = {}) => {
    engServiceSpy = jasmine.createSpyObj('EngagementsService', ['create']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['ref']);
    orgServiceSpy.ref.and.returnValue(of([]));
    profileSpy = jasmine.createSpyObj('UserProfileService', ['currentSubscription', 'refreshProfile']);
    profileSpy.currentSubscription.and.returnValue(null);
    profileSpy.refreshProfile.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [EngagementsCreateComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EngagementsService, useValue: engServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: OrganizationsService, useValue: orgServiceSpy },
        { provide: UserProfileService, useValue: profileSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParams },
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementsCreateComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  };

  beforeEach(async () => {
    await setupTestBed();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('sets prefill to null when no query params', () => {
    fixture.detectChanges();
    expect(component.prefill).toBeNull();
  });

  it('sets prefill.client_id from query param', async () => {
    await TestBed.resetTestingModule();
    await setupTestBed({ client: 'org-1' });
    fixture.detectChanges();

    expect(component.prefill).toEqual(jasmine.objectContaining({ client_id: 'org-1' }));
  });

  it('sets prefill.status from query param', async () => {
    await TestBed.resetTestingModule();
    await setupTestBed({ status: 'active' });
    fixture.detectChanges();

    expect(component.prefill).toEqual(jasmine.objectContaining({ status: 'active' }));
  });

  it('sets prefill with both client and status from query params', async () => {
    await TestBed.resetTestingModule();
    await setupTestBed({ client: 'org-1', status: 'active' });
    fixture.detectChanges();

    expect(component.prefill).toEqual(jasmine.objectContaining({
      client_id: 'org-1',
      status: 'active',
    }));
  });

  // --- goBack ---

  it('goBack() calls location.back()', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  // --- toggleHelp ---

  it('toggleHelp() toggles showHelp', () => {
    expect(component.showHelp).toBe(false);
    component.toggleHelp();
    expect(component.showHelp).toBe(true);
    component.toggleHelp();
    expect(component.showHelp).toBe(false);
  });

  // --- onSubmit ---

  it('onSubmit() navigates on success', fakeAsync(() => {
    engServiceSpy.create.and.returnValue(of(MOCK_ENGAGEMENT));
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.saving$.value).toBe(false);
    expect(notifySpy.success).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-new']);
  }));

  it('onSubmit() sets saving$ while in progress', fakeAsync(() => {
    const subject = new Subject<Engagement>();
    engServiceSpy.create.and.returnValue(subject.asObservable());
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    expect(component.saving$.value).toBe(true);

    subject.next(MOCK_ENGAGEMENT);
    subject.complete();
    tick();

    expect(component.saving$.value).toBe(false);
  }));

  it('onSubmit() clears serverError$ before submit', fakeAsync(() => {
    engServiceSpy.create.and.returnValue(of(MOCK_ENGAGEMENT));
    component.serverError$.next('Previous error');
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.serverError$.value).toBeNull();
  }));

  it('onSubmit() shows error with detail on failure', fakeAsync(() => {
    engServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { detail: 'Limit reached' } })),
    );
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.saving$.value).toBe(false);
    expect(component.serverError$.value).toBe('Limit reached');
    expect(notifySpy.error).toHaveBeenCalledWith('Limit reached');
  }));

  it('onSubmit() shows name validation error from server', fakeAsync(() => {
    engServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { name: ['Name already exists'] } })),
    );
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.serverError$.value).toBe('Name already exists');
    expect(notifySpy.error).toHaveBeenCalledWith('Name already exists');
  }));

  it('onSubmit() shows generic error when no detail or name error', fakeAsync(() => {
    engServiceSpy.create.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.serverError$.value).toBe('Failed to create engagement.');
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to create engagement.');
  }));

  // --- onCancel ---

  it('onCancel() calls location.back()', () => {
    component.onCancel();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  // --- Subscription limit pre-checks ---

  it('blocks create when engagement limit is reached', () => {
    profileSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_members: 3, max_clients: 5, max_assets: 10, max_engagements: 5, max_findings_per_engagement: 20, max_images_per_finding: 5 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 1, clients: 2, assets: 3, engagements: 5 },
    });
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);

    expect(notifySpy.error).toHaveBeenCalledWith('Engagement limit reached (5/5). Upgrade your plan to add more.');
    expect(engServiceSpy.create).not.toHaveBeenCalled();
  });

});
