import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError, Subject } from 'rxjs';

import { EngagementsEditComponent } from './engagements-edit.component';
import { EngagementsService } from '../services/engagements.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { Engagement } from '../models/engagement.model';
import { EngagementFormValue } from '../engagement-form/engagement-form.component';

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-1',
  name: 'Test Engagement',
  client_id: 'client-1',
  client_name: 'Acme Corp',
  status: 'active',
  description: '',
  notes: '',
  start_date: '2025-01-01',
  end_date: '2025-06-01',
  findings_summary: null,
  engagement_type: 'general',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_FORM_VALUE: EngagementFormValue = {
  name: 'Updated Engagement',
  client_id: 'client-1',
  status: 'active',
  start_date: '2025-01-01',
  end_date: '2025-06-01',
  description: 'Updated desc',
  notes: 'Updated notes',
};

describe('EngagementsEditComponent', () => {
  let component: EngagementsEditComponent;
  let fixture: ComponentFixture<EngagementsEditComponent>;
  let router: Router;

  let engServiceSpy: jasmine.SpyObj<EngagementsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;

  beforeEach(async () => {
    engServiceSpy = jasmine.createSpyObj('EngagementsService', ['getById', 'update']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['ref']);

    engServiceSpy.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    orgServiceSpy.ref.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [EngagementsEditComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EngagementsService, useValue: engServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: OrganizationsService, useValue: orgServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'eng-1' } },
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementsEditComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('reads engagement id from route and loads engagement', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(engServiceSpy.getById).toHaveBeenCalledWith('eng-1');
    expect(component.engagement$.value).toEqual(MOCK_ENGAGEMENT);
    expect(component.loading$.value).toBe(false);
  }));

  it('shows error and sets loading to false when getById fails', fakeAsync(() => {
    engServiceSpy.getById.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to load engagement details.');
    expect(component.loading$.value).toBe(false);
    expect(component.engagement$.value).toBeNull();
  }));

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
    const updated = { ...MOCK_ENGAGEMENT, name: 'Updated Engagement' };
    engServiceSpy.update.and.returnValue(of(updated));
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.saving$.value).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1']);
  }));

  it('onSubmit() sets saving$ while in progress', fakeAsync(() => {
    const subject = new Subject<Engagement>();
    engServiceSpy.update.and.returnValue(subject.asObservable());
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    expect(component.saving$.value).toBe(true);

    subject.next({ ...MOCK_ENGAGEMENT, name: 'Updated' });
    subject.complete();
    tick();

    expect(component.saving$.value).toBe(false);
  }));

  it('onSubmit() clears serverError$ before submit', fakeAsync(() => {
    engServiceSpy.update.and.returnValue(of(MOCK_ENGAGEMENT));
    component.serverError$.next('Previous error');
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.serverError$.value).toBeNull();
  }));

  it('onSubmit() shows error with detail on failure', fakeAsync(() => {
    engServiceSpy.update.and.returnValue(
      throwError(() => ({ error: { detail: 'Conflict' } })),
    );
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.saving$.value).toBe(false);
    expect(component.serverError$.value).toBe('Conflict');
    expect(notifySpy.error).toHaveBeenCalledWith('Conflict');
  }));

  it('onSubmit() shows name validation error from server', fakeAsync(() => {
    engServiceSpy.update.and.returnValue(
      throwError(() => ({ error: { name: ['Name already exists'] } })),
    );
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.serverError$.value).toBe('Name already exists');
    expect(notifySpy.error).toHaveBeenCalledWith('Name already exists');
  }));

  it('onSubmit() shows generic error when no detail or name error', fakeAsync(() => {
    engServiceSpy.update.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();

    component.onSubmit(MOCK_FORM_VALUE);
    tick();

    expect(component.serverError$.value).toBe('Failed to update engagement.');
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to update engagement.');
  }));

  // --- onCancel ---

  it('onCancel() navigates to engagement view', () => {
    fixture.detectChanges();
    component.onCancel();
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1']);
  });

  // --- Route param fallback ---

  it('defaults engagementId to empty string when route param is null', async () => {
    await TestBed.resetTestingModule();
    engServiceSpy.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    orgServiceSpy.ref.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [EngagementsEditComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EngagementsService, useValue: engServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: OrganizationsService, useValue: orgServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } } },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    const f = TestBed.createComponent(EngagementsEditComponent);
    f.detectChanges();
    expect(engServiceSpy.getById).toHaveBeenCalledWith('');
  });
});
