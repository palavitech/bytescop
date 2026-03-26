import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReactiveFormsModule } from '@angular/forms';

import { UserFormComponent, UserFormValue } from './user-form.component';
import { TenantMember, MemberGroup } from '../models/member.model';

const mockMember: TenantMember = {
  id: 'mem-1',
  user: {
    id: 'u-1',
    email: 'jane@test.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '555-0100',
    timezone: 'America/New_York',
    avatar_url: null,
    mfa_enabled: false,
  },
  role: 'member',
  is_active: true,
  invite_status: 'none' as const,
  groups: [{ id: 'g-1', name: 'Analysts', is_default: false }],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockGroups: MemberGroup[] = [
  { id: 'g-1', name: 'Analysts', is_default: false },
  { id: 'g-2', name: 'Managers', is_default: false },
];

describe('UserFormComponent', () => {
  let fixture: ComponentFixture<UserFormComponent>;
  let component: UserFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserFormComponent, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  function createComponent(mode: 'create' | 'edit' = 'create', member: TenantMember | null = null): void {
    fixture = TestBed.createComponent(UserFormComponent);
    component = fixture.componentInstance;
    component.mode = mode;
    component.member = member;
    component.availableGroups = mockGroups;
    fixture.detectChanges();
  }

  // --- Create mode ---

  it('should create in create mode', () => {
    createComponent('create');
    expect(component).toBeTruthy();
  });

  it('creates form with empty values in create mode', () => {
    createComponent('create');
    expect(component.form.get('email')?.value).toBe('');
    expect(component.form.get('first_name')?.value).toBe('');
    expect(component.form.get('last_name')?.value).toBe('');
    expect(component.form.get('group_ids')?.value).toEqual([]);
  });

  it('form has no phone or timezone fields', () => {
    createComponent('create');
    expect(component.form.get('phone')).toBeNull();
    expect(component.form.get('timezone')).toBeNull();
  });

  it('form has password and password_confirm fields in create mode', () => {
    createComponent('create');
    expect(component.form.get('password')).not.toBeNull();
    expect(component.form.get('password_confirm')).not.toBeNull();
  });

  it('email is enabled in create mode', () => {
    createComponent('create');
    expect(component.form.get('email')?.disabled).toBeFalse();
  });

  // --- Edit mode ---

  it('pre-fills form with member data in edit mode', () => {
    createComponent('edit', mockMember);
    expect(component.form.get('email')?.value).toBe('jane@test.com');
    expect(component.form.get('first_name')?.value).toBe('Jane');
    expect(component.form.get('last_name')?.value).toBe('Doe');
    expect(component.form.get('group_ids')?.value).toEqual(['g-1']);
  });

  it('disables email in edit mode', () => {
    createComponent('edit', mockMember);
    expect(component.form.get('email')?.disabled).toBeTrue();
  });

  // --- Group selection ---

  it('isGroupSelected returns true for selected group', () => {
    createComponent('edit', mockMember);
    expect(component.isGroupSelected('g-1')).toBeTrue();
    expect(component.isGroupSelected('g-2')).toBeFalse();
  });

  it('toggleGroup adds group when not selected', () => {
    createComponent('edit', mockMember);
    component.toggleGroup('g-2');
    expect(component.isGroupSelected('g-2')).toBeTrue();
  });

  it('toggleGroup removes group when already selected', () => {
    createComponent('edit', mockMember);
    component.toggleGroup('g-1');
    expect(component.isGroupSelected('g-1')).toBeFalse();
  });

  // --- Form submission ---

  it('onSubmit emits formSubmit when form is valid', () => {
    createComponent('create');
    component.form.patchValue({
      email: 'new@test.com',
      first_name: 'New',
      last_name: 'User',
      password: 'Str0ngP@ss!99',
      password_confirm: 'Str0ngP@ss!99',
    });

    let emitted: UserFormValue | undefined;
    component.formSubmit.subscribe(v => emitted = v);
    component.onSubmit();

    expect(emitted).toBeDefined();
    expect(emitted!.email).toBe('new@test.com');
    expect(emitted!.first_name).toBe('New');
  });

  it('onSubmit does nothing when form is invalid', () => {
    createComponent('create');

    let emitted: UserFormValue | undefined;
    component.formSubmit.subscribe(v => emitted = v);
    component.onSubmit();

    expect(emitted).toBeUndefined();
    expect(component.form.get('email')?.touched).toBeTrue();
  });

  it('onSubmit getRawValue includes disabled email in edit mode', () => {
    createComponent('edit', mockMember);
    component.form.patchValue({
      first_name: 'Updated',
      last_name: 'User',
    });

    let emitted: UserFormValue | undefined;
    component.formSubmit.subscribe(v => emitted = v);
    component.onSubmit();

    expect(emitted).toBeDefined();
    expect(emitted!.email).toBe('jane@test.com');
  });

  // --- Cancel ---

  it('onCancel emits formCancel', () => {
    createComponent('create');
    let emitted = false;
    component.formCancel.subscribe(() => emitted = true);
    component.onCancel();
    expect(emitted).toBeTrue();
  });
});
