import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { OrganizationFormComponent, OrganizationFormValue } from './organization-form.component';
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

describe('OrganizationFormComponent', () => {
  let component: OrganizationFormComponent;
  let fixture: ComponentFixture<OrganizationFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizationFormComponent, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationFormComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit (create mode) ---

  it('initializes form with empty values in create mode', () => {
    component.mode = 'create';
    fixture.detectChanges();

    expect(component.form.value).toEqual({
      name: '',
      website: '',
      status: 'active',
      notes: '',
    });
  });

  // --- ngOnInit (edit mode) ---

  it('initializes form with organization values in edit mode', () => {
    component.mode = 'edit';
    component.organization = MOCK_ORG;
    fixture.detectChanges();

    expect(component.form.value).toEqual({
      name: 'Acme Corp',
      website: 'https://acme.com',
      status: 'active',
      notes: 'Test notes',
    });
  });

  it('initializes with defaults when organization is null in edit mode', () => {
    component.mode = 'edit';
    component.organization = null;
    fixture.detectChanges();

    expect(component.form.value.name).toBe('');
    expect(component.form.value.status).toBe('active');
  });

  // --- onSubmit ---

  it('emits formSubmit with form values when valid', () => {
    component.mode = 'create';
    fixture.detectChanges();

    spyOn(component.formSubmit, 'emit');

    component.form.patchValue({
      name: 'New Org',
      website: 'https://new.com',
      status: 'active',
      notes: 'Some notes',
    });

    component.onSubmit();

    expect(component.formSubmit.emit).toHaveBeenCalledWith({
      name: 'New Org',
      website: 'https://new.com',
      status: 'active',
      notes: 'Some notes',
    });
  });

  it('does not emit formSubmit when form is invalid', () => {
    component.mode = 'create';
    fixture.detectChanges();

    spyOn(component.formSubmit, 'emit');

    // name is required, leave it empty
    component.form.patchValue({ name: '' });

    component.onSubmit();

    expect(component.formSubmit.emit).not.toHaveBeenCalled();
  });

  it('marks all fields as touched when form is invalid', () => {
    component.mode = 'create';
    fixture.detectChanges();

    component.form.patchValue({ name: '' });

    component.onSubmit();

    expect(component.form.get('name')?.touched).toBe(true);
  });

  // --- onCancel ---

  it('emits formCancel when onCancel is called', () => {
    fixture.detectChanges();

    spyOn(component.formCancel, 'emit');

    component.onCancel();

    expect(component.formCancel.emit).toHaveBeenCalled();
  });

  // --- Input properties ---

  it('defaults mode to create', () => {
    expect(component.mode).toBe('create');
  });

  it('defaults saving to false', () => {
    expect(component.saving).toBe(false);
  });

  it('defaults organization to null', () => {
    expect(component.organization).toBeNull();
  });
});
