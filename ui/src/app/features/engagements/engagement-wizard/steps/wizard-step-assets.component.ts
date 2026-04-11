import {
  ChangeDetectionStrategy, Component, EventEmitter, inject,
  Input, OnInit, Output, signal, ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AssetsService } from '../../../assets/services/assets.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import {
  Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS,
  AssetType, AssetEnvironment, AssetCriticality,
} from '../../../assets/models/asset.model';

export interface AssetStepResult {
  selectedIds: string[];
  selectedAssets: Asset[];
}

@Component({
  selector: 'app-wizard-step-assets',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './wizard-step-assets.component.html',
  styleUrl: './wizard-step-assets.component.css',
})
export class WizardStepAssetsComponent implements OnInit {
  private readonly assetService = inject(AssetsService);
  private readonly notify = inject(NotificationService);
  private readonly fb = inject(FormBuilder);

  @Input({ required: true }) orgId!: string;
  @Input({ required: true }) orgName!: string;

  @Output() proceed = new EventEmitter<AssetStepResult>();
  @Output() back = new EventEmitter<void>();

  readonly orgAssets = signal<Asset[]>([]);
  readonly selectedAssetIds = signal<Set<string>>(new Set());
  readonly showAssetForm = signal(false);
  readonly assetSaving = signal(false);
  readonly assetsLoading = signal(false);

  readonly assetTypeLabels = ASSET_TYPE_LABELS;
  readonly assetEnvLabels = ASSET_ENV_LABELS;
  readonly assetCritLabels = ASSET_CRIT_LABELS;
  readonly typeOptions = Object.entries(ASSET_TYPE_LABELS) as [AssetType, string][];
  readonly envOptions = Object.entries(ASSET_ENV_LABELS) as [AssetEnvironment, string][];
  readonly critOptions = Object.entries(ASSET_CRIT_LABELS) as [AssetCriticality, string][];

  assetForm!: FormGroup;

  constructor() {
    this.assetForm = this.fb.group({
      name: ['', Validators.required],
      asset_type: ['host'],
      environment: ['prod'],
      criticality: ['medium'],
      target: [''],
      notes: [''],
    });
  }

  ngOnInit(): void {
    this.loadAssets();
  }

  private loadAssets(): void {
    if (!this.orgId) return;
    this.assetsLoading.set(true);
    this.assetService.list(this.orgId).subscribe({
      next: (assets) => {
        this.orgAssets.set(assets);
        this.assetsLoading.set(false);
      },
      error: () => {
        this.assetsLoading.set(false);
        this.notify.error('Failed to load assets.');
      },
    });
  }

  toggleAssetSelection(assetId: string): void {
    this.selectedAssetIds.update((set) => {
      const next = new Set(set);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }

  isAssetSelected(assetId: string): boolean {
    return this.selectedAssetIds().has(assetId);
  }

  selectAllAssets(): void {
    const allIds = this.orgAssets().map((a) => a.id);
    this.selectedAssetIds.set(new Set(allIds));
  }

  deselectAllAssets(): void {
    this.selectedAssetIds.set(new Set());
  }

  toggleAssetForm(): void {
    this.showAssetForm.update((v) => !v);
    if (this.showAssetForm()) {
      this.assetForm.reset({
        name: '', asset_type: 'host', environment: 'prod',
        criticality: 'medium', target: '', notes: '',
      });
    }
  }

  submitNewAsset(): void {
    if (this.assetForm.invalid) {
      this.assetForm.markAllAsTouched();
      return;
    }
    this.assetSaving.set(true);
    const value = {
      ...this.assetForm.getRawValue(),
      client_id: this.orgId,
    };
    this.assetService.create(value).subscribe({
      next: (asset: Asset) => {
        this.assetSaving.set(false);
        this.showAssetForm.set(false);
        this.orgAssets.update((list) => [asset, ...list]);
        this.selectedAssetIds.update((set) => {
          const next = new Set(set);
          next.add(asset.id);
          return next;
        });
        this.notify.success(`Asset "${asset.name}" created.`);
      },
      error: (err) => {
        this.assetSaving.set(false);
        const detail = err?.error?.name?.[0] || err?.error?.detail || 'Failed to create asset.';
        this.notify.error(detail);
      },
    });
  }

  canProceed(): boolean {
    return this.selectedAssetIds().size > 0;
  }

  onProceed(): void {
    if (!this.canProceed()) return;
    const ids = this.selectedAssetIds();
    this.proceed.emit({
      selectedIds: Array.from(ids),
      selectedAssets: this.orgAssets().filter((a) => ids.has(a.id)),
    });
  }

  onBack(): void {
    this.back.emit();
  }
}
