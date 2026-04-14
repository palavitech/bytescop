import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BehaviorSubject, forkJoin, catchError, of } from 'rxjs';

import { SowService } from '../../services/sow.service';
import { AssetsService } from '../../../assets/services/assets.service';
import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS } from '../../../assets/models/asset.model';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { HasPermissionDirective } from '../../../../components/directives/has-permission.directive';

interface ScopeVm {
  state: 'init' | 'ready' | 'error';
  assets: Asset[];
  total: number;
}

@Component({
  selector: 'app-sow-scope-assets-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, HasPermissionDirective],
  templateUrl: './sow-scope-assets-edit.component.html',
  styleUrl: './sow-scope-assets-edit.component.css',
})
export class SowScopeAssetsEditComponent implements OnInit {
  private readonly sowService = inject(SowService);
  private readonly assetsService = inject(AssetsService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) engagementId!: string;
  @Input() clientId = '';
  @Input() isLocked = false;

  scopeVm$ = new BehaviorSubject<ScopeVm>({ state: 'init', assets: [], total: 0 });
  availableAssets$ = new BehaviorSubject<Asset[]>([]);
  selectedAssetId = '';
  addingScope$ = new BehaviorSubject(false);
  confirmingRemoveId$ = new BehaviorSubject<string | null>(null);
  removingAssetId$ = new BehaviorSubject<string | null>(null);

  private clientAssets: Asset[] = [];

  readonly typeLabels = ASSET_TYPE_LABELS;
  readonly envLabels = ASSET_ENV_LABELS;
  readonly critLabels = ASSET_CRIT_LABELS;

  ngOnInit(): void {
    this.loadScopeData();
  }

  private loadScopeData(): void {
    forkJoin({
      scope: this.sowService.listScope(this.engagementId).pipe(
        catchError(err => {
          console.error('[sow-scope-edit] failed to load scope', err?.status);
          return of(null as Asset[] | null);
        }),
      ),
      assets: this.clientId
        ? this.assetsService.list(this.clientId).pipe(catchError(err => {
            console.warn('[sow-scope-edit] failed to load client assets', err?.status);
            return of([] as Asset[]);
          }))
        : of([] as Asset[]),
    }).subscribe(({ scope, assets }) => {
      this.clientAssets = assets;
      if (scope === null) {
        this.scopeVm$.next({ state: 'error', assets: [], total: 0 });
        this.availableAssets$.next(assets);
      } else {
        this.scopeVm$.next({ state: 'ready', assets: scope, total: scope.length });
        const scopeIds = new Set(scope.map(a => a.id));
        this.availableAssets$.next(assets.filter(a => !scopeIds.has(a.id)));
      }
      this.cdr.markForCheck();
    });
  }

  refreshScope(): void {
    this.scopeVm$.next({ state: 'init', assets: [], total: 0 });
    this.sowService.listScope(this.engagementId).subscribe({
      next: (scope) => {
        this.scopeVm$.next({ state: 'ready', assets: scope, total: scope.length });
        const scopeIds = new Set(scope.map(a => a.id));
        this.availableAssets$.next(this.clientAssets.filter(a => !scopeIds.has(a.id)));
        this.cdr.markForCheck();
      },
      error: () => {
        this.scopeVm$.next({ state: 'error', assets: [], total: 0 });
        this.cdr.markForCheck();
      },
    });
  }

  addAsset(): void {
    if (!this.selectedAssetId) return;
    this.addingScope$.next(true);
    this.sowService.addScope(this.engagementId, this.selectedAssetId).subscribe({
      next: () => {
        this.selectedAssetId = '';
        this.addingScope$.next(false);
        this.refreshScope();
      },
      error: (err) => {
        this.addingScope$.next(false);
        this.notify.error(err?.error?.message || err?.error?.detail || 'Failed to add asset to scope.');
      },
    });
  }

  confirmRemove(assetId: string): void {
    this.confirmingRemoveId$.next(assetId);
  }

  cancelRemove(): void {
    this.confirmingRemoveId$.next(null);
  }

  removeAsset(assetId: string): void {
    this.removingAssetId$.next(assetId);
    this.sowService.removeScope(this.engagementId, assetId).subscribe({
      next: () => {
        this.removingAssetId$.next(null);
        this.confirmingRemoveId$.next(null);
        this.refreshScope();
      },
      error: (err) => {
        this.removingAssetId$.next(null);
        this.confirmingRemoveId$.next(null);
        this.notify.error(err?.error?.message || err?.error?.detail || 'Failed to remove asset from scope.');
      },
    });
  }
}
