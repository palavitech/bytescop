import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS, AssetType, AssetEnvironment, AssetCriticality } from '../models/asset.model';
import { OrganizationRef } from '../../organizations/models/organization.model';

export interface AssetFormValue {
  name: string;
  client_id: string | null;
  asset_type: AssetType;
  environment: AssetEnvironment;
  criticality: AssetCriticality;
  target: string;
  notes: string;
}

@Component({
  selector: 'app-asset-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './asset-form.component.html',
})
export class AssetFormComponent implements OnInit {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() asset: Asset | null = null;
  @Input() organizations: OrganizationRef[] = [];
  @Input() preselectedClientId: string | null = null;
  @Input() saving = false;

  @Output() readonly formSubmit = new EventEmitter<AssetFormValue>();
  @Output() readonly formCancel = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  form!: FormGroup;

  readonly typeOptions = Object.entries(ASSET_TYPE_LABELS) as [AssetType, string][];
  readonly envOptions = Object.entries(ASSET_ENV_LABELS) as [AssetEnvironment, string][];
  readonly critOptions = Object.entries(ASSET_CRIT_LABELS) as [AssetCriticality, string][];

  ngOnInit(): void {
    const clientId = this.asset?.client_id ?? this.preselectedClientId ?? null;
    const lockClient = !!this.preselectedClientId;
    this.form = this.fb.group({
      name: [this.asset?.name ?? '', Validators.required],
      client_id: [{ value: clientId, disabled: lockClient }],
      asset_type: [this.asset?.asset_type ?? 'host'],
      environment: [this.asset?.environment ?? 'prod'],
      criticality: [this.asset?.criticality ?? 'medium'],
      target: [this.asset?.target ?? ''],
      notes: [this.asset?.notes ?? ''],
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    // Convert empty string client_id to null
    if (!value.client_id) {
      value.client_id = null;
    }
    this.formSubmit.emit(value);
  }

  onCancel(): void {
    this.formCancel.emit();
  }
}
