import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { EngagementFormComponent, EngagementFormValue } from './engagement-form.component';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { Engagement } from '../models/engagement.model';
import { OrganizationRef } from '../../organizations/models/organization.model';

const MOCK_ORG: OrganizationRef = { id: 'org-1', name: 'Acme Corp' };

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-1',
  name: 'Test Engagement',
  client_id: 'org-1',
  client_name: 'Acme Corp',
  status: 'active',
  description: 'A description',
  notes: 'Some notes',
  start_date: '2025-01-01',
  end_date: '2025-06-01',
  findings_summary: null,
  engagement_type: 'general',
  project_id: null,
  project_name: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('EngagementFormComponent', () => {
  let component: EngagementFormComponent;
  let fixture: ComponentFixture<EngagementFormComponent>;
  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;

  beforeEach(async () => {
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['ref']);
    orgServiceSpy.ref.and.returnValue(of([MOCK_ORG]));

    await TestBed.configureTestingModule({
      imports: [EngagementFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OrganizationsService, useValue: orgServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementFormComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit create mode ---

  it('creates form with default values in create mode', () => {
    component.mode = 'create';
    fixture.detectChanges();

    expect(component.form).toBeTruthy();
    expect(component.form.get('name')?.value).toBe('');
    expect(component.form.get('client_id')?.value).toBeNull();
    expect(component.form.get('status')?.value).toBe('planned');
    expect(component.form.get('start_date')?.value).toBe('');
    expect(component.form.get('end_date')?.value).toBe('');
    expect(component.form.get('description')?.value).toBe('');
    expect(component.form.get('notes')?.value).toBe('');
  });

  it('client_id is enabled in create mode', () => {
    component.mode = 'create';
    fixture.detectChanges();
    expect(component.form.get('client_id')?.disabled).toBe(false);
  });

  // --- ngOnInit edit mode ---

  it('populates form from engagement in edit mode', () => {
    component.mode = 'edit';
    component.engagement = MOCK_ENGAGEMENT;
    fixture.detectChanges();

    expect(component.form.get('name')?.value).toBe('Test Engagement');
    expect(component.form.get('client_id')?.value).toBe('org-1');
    expect(component.form.get('status')?.value).toBe('active');
    expect(component.form.get('start_date')?.value).toBe('2025-01-01');
    expect(component.form.get('end_date')?.value).toBe('2025-06-01');
    expect(component.form.get('description')?.value).toBe('A description');
    expect(component.form.get('notes')?.value).toBe('Some notes');
  });

  it('client_id is disabled in edit mode', () => {
    component.mode = 'edit';
    component.engagement = MOCK_ENGAGEMENT;
    fixture.detectChanges();
    expect(component.form.get('client_id')?.disabled).toBe(true);
  });

  // --- prefill ---

  it('uses prefill values when no engagement is provided', () => {
    component.mode = 'create';
    component.prefill = { client_id: 'org-2', status: 'active' };
    fixture.detectChanges();

    expect(component.form.get('client_id')?.value).toBe('org-2');
    expect(component.form.get('status')?.value).toBe('active');
  });

  it('engagement values override prefill values', () => {
    component.mode = 'edit';
    component.engagement = MOCK_ENGAGEMENT;
    component.prefill = { client_id: 'org-999' };
    fixture.detectChanges();

    expect(component.form.get('client_id')?.value).toBe('org-1');
  });

  // --- statuses ---

  it('exposes statuses list', () => {
    expect(component.statuses.length).toBe(4);
    expect(component.statuses.map(s => s.value)).toEqual(['planned', 'active', 'on_hold', 'completed']);
  });

  // --- onSubmit ---

  it('onSubmit() emits formSubmit with form values when valid', () => {
    component.mode = 'create';
    fixture.detectChanges();

    component.form.patchValue({
      name: 'New Engagement',
      client_id: 'org-1',
      status: 'planned',
      start_date: '2025-03-01',
    });

    spyOn(component.formSubmit, 'emit');
    component.onSubmit();

    expect(component.formSubmit.emit).toHaveBeenCalledWith(jasmine.objectContaining({
      name: 'New Engagement',
      client_id: 'org-1',
      status: 'planned',
      start_date: '2025-03-01',
    }));
  });

  it('onSubmit() does not emit when form is invalid', () => {
    component.mode = 'create';
    fixture.detectChanges();

    // Form is invalid because name, client_id, start_date are required
    spyOn(component.formSubmit, 'emit');
    component.onSubmit();

    expect(component.formSubmit.emit).not.toHaveBeenCalled();
  });

  it('onSubmit() marks all fields as touched when invalid', () => {
    component.mode = 'create';
    fixture.detectChanges();

    component.onSubmit();

    expect(component.form.get('name')?.touched).toBe(true);
    expect(component.form.get('client_id')?.touched).toBe(true);
    expect(component.form.get('start_date')?.touched).toBe(true);
  });

  it('onSubmit() includes disabled client_id via getRawValue in edit mode', () => {
    component.mode = 'edit';
    component.engagement = MOCK_ENGAGEMENT;
    fixture.detectChanges();

    spyOn(component.formSubmit, 'emit');
    component.onSubmit();

    const emittedValue = (component.formSubmit.emit as jasmine.Spy).calls.first().args[0] as EngagementFormValue;
    expect(emittedValue.client_id).toBe('org-1');
  });

  // --- onCancel ---

  it('onCancel() emits formCancel', () => {
    spyOn(component.formCancel, 'emit');
    component.onCancel();
    expect(component.formCancel.emit).toHaveBeenCalled();
  });

  // --- isInvalid ---

  it('isInvalid() returns false for untouched valid field', () => {
    component.mode = 'create';
    fixture.detectChanges();

    component.form.patchValue({ name: 'Valid Name' });
    expect(component.isInvalid('name')).toBe(false);
  });

  it('isInvalid() returns true for touched invalid field', () => {
    component.mode = 'create';
    fixture.detectChanges();

    component.form.get('name')?.markAsTouched();
    expect(component.isInvalid('name')).toBe(true);
  });

  it('isInvalid() returns false for untouched invalid field', () => {
    component.mode = 'create';
    fixture.detectChanges();

    // name is required, empty, but not touched
    expect(component.isInvalid('name')).toBe(false);
  });

  it('isInvalid() returns true for dirty invalid field', () => {
    component.mode = 'create';
    fixture.detectChanges();

    const nameCtrl = component.form.get('name');
    nameCtrl?.setValue('ab'); // too short (minLength 3)
    nameCtrl?.markAsDirty();
    expect(component.isInvalid('name')).toBe(true);
  });

  it('isInvalid() returns false for non-existent field', () => {
    component.mode = 'create';
    fixture.detectChanges();

    expect(component.isInvalid('nonexistent')).toBe(false);
  });

  // --- Validation rules ---

  it('name requires minimum 3 characters', () => {
    component.mode = 'create';
    fixture.detectChanges();

    component.form.get('name')?.setValue('ab');
    expect(component.form.get('name')?.valid).toBe(false);

    component.form.get('name')?.setValue('abc');
    expect(component.form.get('name')?.valid).toBe(true);
  });

  it('name requires maximum 200 characters', () => {
    component.mode = 'create';
    fixture.detectChanges();

    component.form.get('name')?.setValue('x'.repeat(201));
    expect(component.form.get('name')?.valid).toBe(false);

    component.form.get('name')?.setValue('x'.repeat(200));
    expect(component.form.get('name')?.valid).toBe(true);
  });

  it('description requires maximum 5000 characters', () => {
    component.mode = 'create';
    fixture.detectChanges();

    component.form.get('description')?.setValue('x'.repeat(5001));
    expect(component.form.get('description')?.valid).toBe(false);

    component.form.get('description')?.setValue('x'.repeat(5000));
    expect(component.form.get('description')?.valid).toBe(true);
  });

  it('notes requires maximum 5000 characters', () => {
    component.mode = 'create';
    fixture.detectChanges();

    component.form.get('notes')?.setValue('x'.repeat(5001));
    expect(component.form.get('notes')?.valid).toBe(false);
  });

  it('organizations$ is set from orgService.ref()', () => {
    fixture.detectChanges();
    let result: OrganizationRef[] | undefined;
    component.organizations$.subscribe(orgs => (result = orgs));
    expect(result).toEqual([MOCK_ORG]);
  });
});
