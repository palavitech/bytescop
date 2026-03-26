import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { GroupFormComponent, GroupFormValue } from './group-form.component';
import { PermissionItem, TenantGroupDetail } from '../models/group.model';
import { PERMISSION_PRESETS, PermissionPreset } from './permission-presets';

// ---------------------------------------------------------------------------
// Mock data — a minimal permission set covering resources used by presets
// ---------------------------------------------------------------------------

let nextId = 1;
function perm(codename: string): PermissionItem {
  const [resource, action] = codename.split('.');
  return {
    id: `perm-${nextId++}`,
    codename,
    name: `${action} ${resource}`,
    category: resource,
    resource,
  };
}

function buildAllPermissions(): PermissionItem[] {
  nextId = 1; // reset for deterministic IDs
  const codenames = [
    'engagement.view', 'engagement.create', 'engagement.update', 'engagement.delete',
    'finding.view', 'finding.create', 'finding.update', 'finding.delete',
    'evidence.view', 'evidence.create', 'evidence.update', 'evidence.delete',
    'sow.view', 'sow.create', 'sow.update', 'sow.delete',
    'scope.view', 'scope.manage',
    'engagement_settings.view',
    'client.view', 'client.create', 'client.update', 'client.delete',
    'asset.view', 'asset.create', 'asset.update', 'asset.delete',
    'user.view', 'user.create', 'user.update', 'user.delete',
    'group.view', 'group.create', 'group.update', 'group.delete',
    'tenant_settings.view', 'tenant_settings.manage',
    'billing.view', 'billing.manage',
  ];
  return codenames.map(c => perm(c));
}

function idByCodename(allPerms: PermissionItem[], codename: string): string {
  const p = allPerms.find(x => x.codename === codename);
  if (!p) throw new Error(`Permission not found: ${codename}`);
  return p.id;
}

function idsByCodenames(allPerms: PermissionItem[], codenames: string[]): string[] {
  return codenames.map(c => idByCodename(allPerms, c));
}

function presetById(id: string): PermissionPreset {
  const p = PERMISSION_PRESETS.find(x => x.id === id);
  if (!p) throw new Error(`Preset not found: ${id}`);
  return p;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GroupFormComponent — Permission Presets', () => {
  let fixture: ComponentFixture<GroupFormComponent>;
  let component: GroupFormComponent;
  let allPerms: PermissionItem[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupFormComponent, ReactiveFormsModule],
    }).compileComponents();

    allPerms = buildAllPermissions();
    fixture = TestBed.createComponent(GroupFormComponent);
    component = fixture.componentInstance;
    component.allPermissions = allPerms;
  });

  function init(): void {
    fixture.detectChanges(); // triggers ngOnInit
  }

  /** Force re-render for OnPush after programmatic state mutations. */
  function detectDom(): void {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe('rendering', () => {
    it('should render preset items in the preset list', () => {
      init();
      const items = fixture.nativeElement.querySelectorAll('.bc-presetItem');
      expect(items.length).toBe(PERMISSION_PRESETS.length);
    });

    it('should display preset labels', () => {
      init();
      const items: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.bc-presetItem');
      const labels = Array.from(items).map(c => c.textContent?.trim());
      for (const preset of PERMISSION_PRESETS) {
        expect(labels).toContain(jasmine.stringContaining(preset.label));
      }
    });

    it('should not render preset list when allPermissions is empty', () => {
      component.allPermissions = [];
      init();
      const list = fixture.nativeElement.querySelector('.bc-presetList');
      expect(list).toBeNull();
    });

    it('should display preset description as subtitle', () => {
      init();
      const desc: HTMLElement = fixture.nativeElement.querySelector('.bc-presetItem-desc');
      expect(desc.textContent?.trim()).toBe(PERMISSION_PRESETS[0].description);
    });
  });

  // -------------------------------------------------------------------------
  // Click behavior: unselected → full
  // -------------------------------------------------------------------------

  describe('clicking unselected preset', () => {
    it('should check all permissions for the preset (state → full)', () => {
      init();
      const preset = presetById('manage-assessments');

      component.togglePreset(preset);
      fixture.detectChanges();

      expect(component.getPresetState(preset)).toBe('full');
      for (const codename of preset.codenames) {
        const id = idByCodename(allPerms, codename);
        expect(component.selectedPermIds.has(id)).toBeTrue();
      }
    });

    it('should apply is-full CSS class on the chip', () => {
      init();
      const preset = presetById('manage-organizations');
      component.togglePreset(preset);
      detectDom();

      const items: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.bc-presetItem')
      );
      const chip = items.find(c => c.textContent?.includes(preset.label));
      expect(chip?.classList.contains('is-full')).toBeTrue();
    });

    it('should show check-circle-fill icon when full', () => {
      init();
      component.togglePreset(presetById('view-assessments'));
      detectDom();

      const items: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.bc-presetItem')
      );
      const item = items.find(c => c.textContent?.includes('View Assessments'));
      const icon = item?.querySelector('i.bi-check-circle-fill');
      expect(icon).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Click behavior: full → unselected
  // -------------------------------------------------------------------------

  describe('clicking full preset', () => {
    it('should remove all permissions (state → none)', () => {
      init();
      const preset = presetById('administer-users');

      component.togglePreset(preset); // → full
      expect(component.getPresetState(preset)).toBe('full');

      component.togglePreset(preset); // → none
      fixture.detectChanges();

      expect(component.getPresetState(preset)).toBe('none');
      for (const codename of preset.codenames) {
        const id = idByCodename(allPerms, codename);
        expect(component.selectedPermIds.has(id)).toBeFalse();
      }
    });

    it('should remove is-full CSS class', () => {
      init();
      const preset = presetById('manage-settings');
      component.togglePreset(preset); // full
      component.togglePreset(preset); // none
      fixture.detectChanges();

      const items: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.bc-presetItem')
      );
      const chip = items.find(c => c.textContent?.includes(preset.label));
      expect(chip?.classList.contains('is-full')).toBeFalse();
      expect(chip?.classList.contains('is-partial')).toBeFalse();
    });
  });

  // -------------------------------------------------------------------------
  // Click behavior: partial → full
  // -------------------------------------------------------------------------

  describe('clicking partial preset', () => {
    it('should restore all permissions (state → full)', () => {
      init();
      const preset = presetById('manage-assessments');

      // Select all then remove one → partial
      component.togglePreset(preset);
      const oneId = idByCodename(allPerms, 'finding.create');
      component.selectedPermIds.delete(oneId);
      expect(component.getPresetState(preset)).toBe('partial');

      // Click partial → full
      component.togglePreset(preset);
      fixture.detectChanges();

      expect(component.getPresetState(preset)).toBe('full');
      expect(component.selectedPermIds.has(oneId)).toBeTrue();
    });

    it('should apply is-full CSS class after restoring from partial', () => {
      init();
      const preset = presetById('manage-organizations');
      component.togglePreset(preset);
      component.selectedPermIds.delete(idByCodename(allPerms, 'client.delete'));
      detectDom();

      const getItem = (): HTMLButtonElement | undefined => {
        const items: HTMLButtonElement[] = Array.from(
          fixture.nativeElement.querySelectorAll('.bc-presetItem')
        );
        return items.find(c => c.textContent?.includes(preset.label));
      };

      expect(getItem()?.classList.contains('is-partial')).toBeTrue();

      component.togglePreset(preset);
      detectDom();

      expect(getItem()?.classList.contains('is-full')).toBeTrue();
    });
  });

  // -------------------------------------------------------------------------
  // Manual grid change → partial state
  // -------------------------------------------------------------------------

  describe('manual permission toggle', () => {
    it('should transition chip from full to partial when a permission is unchecked', () => {
      init();
      const preset = presetById('manage-assessments');
      component.togglePreset(preset);
      expect(component.getPresetState(preset)).toBe('full');

      // Manually uncheck one permission
      const id = idByCodename(allPerms, 'sow.update');
      component.togglePermission(id);
      fixture.detectChanges();

      expect(component.getPresetState(preset)).toBe('partial');
    });

    it('should show dash-circle icon for partial state', () => {
      init();
      const preset = presetById('view-organizations');
      // Select only one of the two
      component.selectedPermIds.add(idByCodename(allPerms, 'client.view'));
      detectDom();

      expect(component.getPresetState(preset)).toBe('partial');

      const items: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.bc-presetItem')
      );
      const item = items.find(c => c.textContent?.includes(preset.label));
      const icon = item?.querySelector('i.bi-dash-circle');
      expect(icon).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Overlapping presets
  // -------------------------------------------------------------------------

  describe('overlapping presets', () => {
    it('should not remove shared permissions when deactivating one preset', () => {
      init();
      // "Manage Assessments" includes engagement.view, finding.view, etc.
      // "View Assessments" includes engagement.view, finding.view, etc.
      const manageAssessments = presetById('manage-assessments');
      const viewAssessments = presetById('view-assessments');

      component.togglePreset(manageAssessments); // full
      component.togglePreset(viewAssessments);   // already full (subset)
      expect(component.getPresetState(viewAssessments)).toBe('full');

      // Remove "Manage Assessments" — shared view perms should stay
      component.togglePreset(manageAssessments);
      fixture.detectChanges();

      // View Assessments codenames should still be selected
      for (const codename of viewAssessments.codenames) {
        const id = idByCodename(allPerms, codename);
        expect(component.selectedPermIds.has(id))
          .withContext(`${codename} should remain selected`)
          .toBeTrue();
      }
    });

    it('should not uncheck client.view when removing Manage Clients if View Clients is partial', () => {
      init();
      const manageOrg = presetById('manage-organizations');
      const viewOrg = presetById('view-organizations');

      // Activate both — View Orgs is a subset of Manage Orgs
      component.togglePreset(manageOrg);
      expect(component.getPresetState(viewOrg)).toBe('full');

      // Now remove Manage Orgs
      component.togglePreset(manageOrg);
      fixture.detectChanges();

      // client.view and asset.view remain because View Orgs is still full
      expect(component.selectedPermIds.has(idByCodename(allPerms, 'client.view'))).toBeTrue();
      expect(component.selectedPermIds.has(idByCodename(allPerms, 'asset.view'))).toBeTrue();

      // Non-overlapping perms should be gone
      expect(component.selectedPermIds.has(idByCodename(allPerms, 'client.create'))).toBeFalse();
      expect(component.selectedPermIds.has(idByCodename(allPerms, 'asset.delete'))).toBeFalse();
    });
  });

  // -------------------------------------------------------------------------
  // Disabled state
  // -------------------------------------------------------------------------

  describe('disabled state', () => {
    it('should disable preset items when form is disabled', () => {
      component.disabled = true;
      init();

      const items: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.bc-presetItem')
      );
      for (const item of items) {
        expect(item.disabled).toBeTrue();
      }
    });

    it('should not toggle preset when disabled', () => {
      component.disabled = true;
      init();

      const preset = presetById('manage-assessments');
      component.togglePreset(preset);

      expect(component.getPresetState(preset)).toBe('none');
    });
  });

  // -------------------------------------------------------------------------
  // Existing group → derive preset state on init
  // -------------------------------------------------------------------------

  describe('existing group permissions on init', () => {
    it('should derive full preset state from existing group permissions', () => {
      const preset = presetById('view-organizations');
      const groupPerms = allPerms.filter(p => preset.codenames.includes(p.codename));

      component.group = {
        id: 'grp-1',
        name: 'Test Group',
        description: '',
        is_default: false,
        permissions: groupPerms,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      init();

      expect(component.getPresetState(preset)).toBe('full');
    });

    it('should derive partial preset state from existing group permissions', () => {
      const preset = presetById('manage-organizations');
      // Only include some codenames from the preset
      const partialPerms = allPerms.filter(
        p => p.codename === 'client.view' || p.codename === 'asset.view'
      );

      component.group = {
        id: 'grp-2',
        name: 'Partial Group',
        description: '',
        is_default: false,
        permissions: partialPerms,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      init();

      expect(component.getPresetState(preset)).toBe('partial');
    });
  });

  // -------------------------------------------------------------------------
  // Submit includes preset-selected permission IDs
  // -------------------------------------------------------------------------

  describe('form submission', () => {
    it('should include preset-selected permission IDs in output', () => {
      init();
      component.form.patchValue({ name: 'Test Group' });

      const preset = presetById('administer-users');
      component.togglePreset(preset);

      let emitted: GroupFormValue | undefined;
      component.formSubmit.subscribe(v => emitted = v);
      component.onSubmit();

      expect(emitted).toBeDefined();
      const expectedIds = idsByCodenames(allPerms, preset.codenames);
      for (const id of expectedIds) {
        expect(emitted!.permission_ids).toContain(id);
      }
    });

    it('should not emit when form is invalid (name empty)', () => {
      init();
      component.form.patchValue({ name: '' });

      let emitted: GroupFormValue | undefined;
      component.formSubmit.subscribe(v => emitted = v);
      component.onSubmit();

      expect(emitted).toBeUndefined();
    });

    it('should not emit when disabled', () => {
      component.disabled = true;
      init();
      component.form.patchValue({ name: 'Test Group' });
      // disabled form is invalid; but disabled also short-circuits
      let emitted: GroupFormValue | undefined;
      component.formSubmit.subscribe(v => emitted = v);
      component.onSubmit();

      expect(emitted).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------

  describe('cancel', () => {
    it('should emit formCancel on cancel', () => {
      init();
      let cancelled = false;
      component.formCancel.subscribe(() => cancelled = true);
      component.onCancel();
      expect(cancelled).toBeTrue();
    });
  });

  // -------------------------------------------------------------------------
  // ngOnChanges
  // -------------------------------------------------------------------------

  describe('ngOnChanges', () => {
    it('rebuilds permissionsByResource when allPermissions changes after init', () => {
      init();
      const originalLength = component.permissionsByResource.length;

      const newPerms = [perm('new.view'), perm('new.create')];
      component.allPermissions = newPerms;
      component.ngOnChanges({
        allPermissions: {
          currentValue: newPerms,
          previousValue: allPerms,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.permissionsByResource.length).toBe(1);
      expect(component.permissionsByResource[0].resource).toBe('new');
    });

    it('does not rebuild on firstChange', () => {
      init();
      const originalLength = component.permissionsByResource.length;

      component.ngOnChanges({
        allPermissions: {
          currentValue: allPerms,
          previousValue: undefined,
          firstChange: true,
          isFirstChange: () => true,
        },
      });

      expect(component.permissionsByResource.length).toBe(originalLength);
    });
  });

  // -------------------------------------------------------------------------
  // toggleAllForResource
  // -------------------------------------------------------------------------

  describe('toggleAllForResource', () => {
    it('selects all perms when none are selected', () => {
      init();
      const res = component.permissionsByResource[0];
      component.toggleAllForResource(res);

      for (const p of res.permissions) {
        expect(component.selectedPermIds.has(p.id)).toBeTrue();
      }
    });

    it('deselects all perms when all are selected', () => {
      init();
      const res = component.permissionsByResource[0];
      // Select all first
      for (const p of res.permissions) {
        component.selectedPermIds.add(p.id);
      }
      component.toggleAllForResource(res);

      for (const p of res.permissions) {
        expect(component.selectedPermIds.has(p.id)).toBeFalse();
      }
    });

    it('does nothing when disabled', () => {
      component.disabled = true;
      init();
      const res = component.permissionsByResource[0];
      component.toggleAllForResource(res);

      for (const p of res.permissions) {
        expect(component.selectedPermIds.has(p.id)).toBeFalse();
      }
    });
  });

  // -------------------------------------------------------------------------
  // isAllResourceSelected
  // -------------------------------------------------------------------------

  describe('isAllResourceSelected', () => {
    it('returns true when all perms for resource are selected', () => {
      init();
      const res = component.permissionsByResource[0];
      for (const p of res.permissions) {
        component.selectedPermIds.add(p.id);
      }
      expect(component.isAllResourceSelected(res)).toBeTrue();
    });

    it('returns false when some perms are missing', () => {
      init();
      const res = component.permissionsByResource[0];
      expect(component.isAllResourceSelected(res)).toBeFalse();
    });
  });

  // -------------------------------------------------------------------------
  // prettyAction
  // -------------------------------------------------------------------------

  describe('prettyAction', () => {
    it('extracts and capitalizes the action part', () => {
      init();
      expect(component.prettyAction('engagement.view')).toBe('View');
      expect(component.prettyAction('client.create')).toBe('Create');
    });

    it('handles codename without dot', () => {
      init();
      expect(component.prettyAction('manage')).toBe('Manage');
    });
  });

  // -------------------------------------------------------------------------
  // togglePermission
  // -------------------------------------------------------------------------

  describe('togglePermission', () => {
    it('does nothing when disabled', () => {
      component.disabled = true;
      init();
      const id = allPerms[0].id;
      component.togglePermission(id);
      expect(component.selectedPermIds.has(id)).toBeFalse();
    });
  });
});
