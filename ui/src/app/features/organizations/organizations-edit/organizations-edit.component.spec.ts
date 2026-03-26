import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { OrganizationsEditComponent } from './organizations-edit.component';
import { OrganizationsService } from '../services/organizations.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { Organization } from '../models/organization.model';

const MOCK_ORG: Organization = {
  id: 'org-1',
  name: 'Acme Corp',
  website: 'https://acme.com',
  status: 'active',
  notes: 'Test notes',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('OrganizationsEditComponent', () => {
  let component: OrganizationsEditComponent;
  let fixture: ComponentFixture<OrganizationsEditComponent>;

  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['getById', 'update']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    orgServiceSpy.getById.and.returnValue(of(MOCK_ORG));

    await TestBed.configureTestingModule({
      imports: [OrganizationsEditComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OrganizationsService, useValue: orgServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'org-1' } },
            root: { firstChild: null } as any,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationsEditComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads organization on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(orgServiceSpy.getById).toHaveBeenCalledWith('org-1');
    expect(component.organization$.value).toEqual(MOCK_ORG);
    expect(component.loading$.value).toBe(false);
  }));

  it('shows error when getById fails', fakeAsync(() => {
    orgServiceSpy.getById.and.returnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to load client details.');
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

  it('onSubmit() calls update and navigates on success', fakeAsync(() => {
    orgServiceSpy.update.and.returnValue(of(MOCK_ORG));
    fixture.detectChanges();
    tick();

    const formValue = { name: 'Updated Name', website: '', status: 'active' as const, notes: '' };
    component.onSubmit(formValue);
    tick();

    expect(orgServiceSpy.update).toHaveBeenCalledWith('org-1', formValue);
    expect(component.saving$.value).toBe(false);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/organizations', 'org-1']);
  }));

  it('onSubmit() sets saving$ to true before request', fakeAsync(() => {
    let savingDuringCall = false;
    orgServiceSpy.update.and.callFake(() => {
      savingDuringCall = component.saving$.value;
      return of(MOCK_ORG);
    });

    fixture.detectChanges();
    tick();

    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });
    tick();

    expect(savingDuringCall).toBe(true);
  }));

  it('onSubmit() clears serverError$ before request', fakeAsync(() => {
    orgServiceSpy.update.and.returnValue(of(MOCK_ORG));
    fixture.detectChanges();
    tick();

    component.serverError$.next('old error');
    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });
    tick();

    expect(component.serverError$.value).toBeNull();
  }));

  // --- onSubmit error ---

  it('onSubmit() shows error on failure with detail', fakeAsync(() => {
    orgServiceSpy.update.and.returnValue(
      throwError(() => ({ error: { detail: 'Name taken' } })),
    );
    fixture.detectChanges();
    tick();

    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });
    tick();

    expect(component.saving$.value).toBe(false);
    expect(component.serverError$.value).toBe('Name taken');
    expect(notifySpy.error).toHaveBeenCalledWith('Name taken');
  }));

  it('onSubmit() shows generic error when no detail', fakeAsync(() => {
    orgServiceSpy.update.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.onSubmit({ name: 'Test', website: '', status: 'active', notes: '' });
    tick();

    expect(component.serverError$.value).toBe('Failed to update client.');
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to update client.');
  }));

  // --- onCancel ---

  it('onCancel() navigates to organization view', () => {
    fixture.detectChanges();
    component.onCancel();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/organizations', 'org-1']);
  });

  // --- Initial state ---

  it('saving$ starts as false', () => {
    expect(component.saving$.value).toBe(false);
  });

  it('loading$ starts as true', () => {
    expect(component.loading$.value).toBe(true);
  });

  it('organization$ starts as null', () => {
    expect(component.organization$.value).toBeNull();
  });

  it('serverError$ starts as null', () => {
    expect(component.serverError$.value).toBeNull();
  });
});
