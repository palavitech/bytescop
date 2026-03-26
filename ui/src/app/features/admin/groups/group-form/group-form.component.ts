import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TenantGroupDetail, PermissionItem } from '../models/group.model';
import { PERMISSION_PRESETS, PermissionPreset } from './permission-presets';

export type GroupFormValue = {
  name: string;
  description: string;
  permission_ids: string[];
};

export interface PermissionsByResource {
  resource: string;
  permissions: PermissionItem[];
}

@Component({
  selector: 'app-group-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './group-form.component.html',
  styleUrl: './group-form.component.css',
})
export class GroupFormComponent implements OnInit, OnChanges {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() group: TenantGroupDetail | null = null;
  @Input() allPermissions: PermissionItem[] = [];
  @Input() saving = false;
  @Input() disabled = false;

  @Output() readonly formSubmit = new EventEmitter<GroupFormValue>();
  @Output() readonly formCancel = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  form!: FormGroup;

  readonly presets = PERMISSION_PRESETS;
  permissionsByResource: PermissionsByResource[] = [];
  selectedPermIds = new Set<string>();
  private codenameToId = new Map<string, string>();

  ngOnInit(): void {
    this.form = this.fb.group({
      name: [this.group?.name ?? '', Validators.required],
      description: [this.group?.description ?? ''],
    });

    // Build selected permission IDs from existing group
    if (this.group?.permissions) {
      this.selectedPermIds = new Set(this.group.permissions.map(p => p.id));
    }

    this.buildPermissionsByResource();

    if (this.disabled) {
      this.form.disable();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['allPermissions'] && !changes['allPermissions'].firstChange) {
      this.buildPermissionsByResource();
    }
  }

  private buildPermissionsByResource(): void {
    const resourceMap = new Map<string, PermissionItem[]>();
    for (const perm of this.allPermissions) {
      const existing = resourceMap.get(perm.resource) ?? [];
      existing.push(perm);
      resourceMap.set(perm.resource, existing);
    }
    this.permissionsByResource = Array.from(resourceMap.entries())
      .map(([resource, permissions]) => ({ resource, permissions }))
      .sort((a, b) => a.resource.localeCompare(b.resource));
    this.buildCodenameMap();
  }

  private buildCodenameMap(): void {
    this.codenameToId.clear();
    for (const p of this.allPermissions) {
      this.codenameToId.set(p.codename, p.id);
    }
  }

  isPermSelected(permId: string): boolean {
    return this.selectedPermIds.has(permId);
  }

  togglePermission(permId: string): void {
    if (this.disabled) return;
    if (this.selectedPermIds.has(permId)) {
      this.selectedPermIds.delete(permId);
    } else {
      this.selectedPermIds.add(permId);
    }
  }

  toggleAllForResource(resource: PermissionsByResource): void {
    if (this.disabled) return;
    const allSelected = resource.permissions.every(p => this.selectedPermIds.has(p.id));
    for (const perm of resource.permissions) {
      if (allSelected) {
        this.selectedPermIds.delete(perm.id);
      } else {
        this.selectedPermIds.add(perm.id);
      }
    }
  }

  isAllResourceSelected(resource: PermissionsByResource): boolean {
    return resource.permissions.every(p => this.selectedPermIds.has(p.id));
  }

  prettyAction(codename: string): string {
    const action = codename.split('.').pop() ?? codename;
    return action.charAt(0).toUpperCase() + action.slice(1);
  }

  getPresetState(preset: PermissionPreset): 'none' | 'full' | 'partial' {
    const ids = this.presetPermIds(preset);
    if (ids.length === 0) return 'none';
    const selected = ids.filter(id => this.selectedPermIds.has(id));
    if (selected.length === 0) return 'none';
    if (selected.length === ids.length) return 'full';
    return 'partial';
  }

  togglePreset(preset: PermissionPreset): void {
    if (this.disabled) return;
    const state = this.getPresetState(preset);
    const ids = this.presetPermIds(preset);
    if (state === 'full') {
      for (const id of ids) {
        if (!this.isCoveredByOtherPreset(id, preset)) {
          this.selectedPermIds.delete(id);
        }
      }
    } else {
      for (const id of ids) {
        this.selectedPermIds.add(id);
      }
    }
  }

  private presetPermIds(preset: PermissionPreset): string[] {
    return preset.codenames
      .map(c => this.codenameToId.get(c))
      .filter((id): id is string => !!id);
  }

  private isCoveredByOtherPreset(permId: string, exclude: PermissionPreset): boolean {
    return PERMISSION_PRESETS.some(p =>
      p.id !== exclude.id && this.presetPermIds(p).includes(permId)
        && this.getPresetState(p) !== 'none'
    );
  }

  onSubmit(): void {
    if (this.form.invalid || this.disabled) {
      this.form.markAllAsTouched();
      return;
    }
    this.formSubmit.emit({
      ...this.form.value,
      permission_ids: Array.from(this.selectedPermIds),
    });
  }

  onCancel(): void {
    this.formCancel.emit();
  }
}
