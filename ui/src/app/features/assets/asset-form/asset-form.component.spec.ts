import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AssetFormComponent, AssetFormValue } from './asset-form.component';
import { Asset } from '../models/asset.model';
import { OrganizationRef } from '../../organizations/models/organization.model';

const MOCK_ASSET: Asset = {
  id: 'asset-1',
  name: 'Web Server',
  client_id: 'org-1',
  client_name: 'Acme Corp',
  asset_type: 'webapp',
  environment: 'staging',
  criticality: 'high',
  target: 'https://app.acme.com',
  notes: 'Production web app',
  attributes: {},
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_ORGS: OrganizationRef[] = [
  { id: 'org-1', name: 'Acme Corp' },
  { id: 'org-2', name: 'Beta Inc' },
];

describe('AssetFormComponent', () => {
  let component: AssetFormComponent;
  let fixture: ComponentFixture<AssetFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssetFormComponent, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AssetFormComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit (create mode, no preselection) ---

  it('initializes form with defaults in create mode', () => {
    component.mode = 'create';
    fixture.detectChanges();

    expect(component.form.value.name).toBe('');
    expect(component.form.getRawValue().client_id).toBeNull();
    expect(component.form.value.asset_type).toBe('host');
    expect(component.form.value.environment).toBe('prod');
    expect(component.form.value.criticality).toBe('medium');
    expect(component.form.value.target).toBe('');
    expect(component.form.value.notes).toBe('');
  });

  // --- ngOnInit (create mode, preselected client) ---

  it('preselects and disables client_id when preselectedClientId is set', () => {
    component.mode = 'create';
    component.preselectedClientId = 'org-1';
    fixture.detectChanges();

    expect(component.form.getRawValue().client_id).toBe('org-1');
    expect(component.form.get('client_id')?.disabled).toBe(true);
  });

  // --- ngOnInit (edit mode) ---

  it('initializes form with asset values in edit mode', () => {
    component.mode = 'edit';
    component.asset = MOCK_ASSET;
    fixture.detectChanges();

    expect(component.form.value.name).toBe('Web Server');
    expect(component.form.getRawValue().client_id).toBe('org-1');
    expect(component.form.value.asset_type).toBe('webapp');
    expect(component.form.value.environment).toBe('staging');
    expect(component.form.value.criticality).toBe('high');
    expect(component.form.value.target).toBe('https://app.acme.com');
    expect(component.form.value.notes).toBe('Production web app');
  });

  it('initializes with defaults when asset is null in edit mode', () => {
    component.mode = 'edit';
    component.asset = null;
    fixture.detectChanges();

    expect(component.form.value.name).toBe('');
    expect(component.form.value.asset_type).toBe('host');
  });

  // --- onSubmit ---

  it('emits formSubmit with form values when valid', () => {
    component.mode = 'create';
    component.organizations = MOCK_ORGS;
    fixture.detectChanges();

    spyOn(component.formSubmit, 'emit');

    component.form.patchValue({
      name: 'New Asset',
      client_id: 'org-1',
      asset_type: 'api',
      environment: 'dev',
      criticality: 'low',
      target: 'https://api.example.com',
      notes: 'Test',
    });

    component.onSubmit();

    expect(component.formSubmit.emit).toHaveBeenCalledWith(jasmine.objectContaining({
      name: 'New Asset',
      client_id: 'org-1',
      asset_type: 'api',
      environment: 'dev',
      criticality: 'low',
      target: 'https://api.example.com',
      notes: 'Test',
    }));
  });

  it('converts empty string client_id to null on submit', () => {
    component.mode = 'create';
    fixture.detectChanges();

    spyOn(component.formSubmit, 'emit');

    component.form.patchValue({
      name: 'No Client Asset',
      client_id: '',
    });

    component.onSubmit();

    const emittedValue = (component.formSubmit.emit as jasmine.Spy).calls.first().args[0];
    expect(emittedValue.client_id).toBeNull();
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

  // --- Input defaults ---

  it('defaults mode to create', () => {
    expect(component.mode).toBe('create');
  });

  it('defaults saving to false', () => {
    expect(component.saving).toBe(false);
  });

  it('defaults asset to null', () => {
    expect(component.asset).toBeNull();
  });

  it('defaults organizations to empty array', () => {
    expect(component.organizations).toEqual([]);
  });

  it('defaults preselectedClientId to null', () => {
    expect(component.preselectedClientId).toBeNull();
  });

  // --- Option arrays ---

  it('exposes typeOptions with all asset types', () => {
    expect(component.typeOptions.length).toBe(7);
    expect(component.typeOptions[0]).toEqual(['host', 'Host']);
  });

  it('exposes envOptions with all environments', () => {
    expect(component.envOptions.length).toBe(4);
  });

  it('exposes critOptions with all criticality levels', () => {
    expect(component.critOptions.length).toBe(3);
  });

  // --- client_id not disabled without preselection ---

  it('does not disable client_id when no preselectedClientId', () => {
    component.mode = 'create';
    component.preselectedClientId = null;
    fixture.detectChanges();

    expect(component.form.get('client_id')?.disabled).toBe(false);
  });
});
