import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, forkJoin, catchError, of } from 'rxjs';
import { SowService } from '../services/sow.service';
import { EngagementsService } from '../services/engagements.service';
import { AssetsService } from '../../assets/services/assets.service';
import { SowStatus, SOW_STATUS_LABELS } from '../models/sow.model';
import { Engagement } from '../models/engagement.model';
import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS } from '../../assets/models/asset.model';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';

interface ScopeVm {
  state: 'init' | 'ready' | 'error';
  assets: Asset[];
  total: number;
}

@Component({
  selector: 'app-sow-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sow-edit.component.html',
  styleUrls: ['./sow-edit.component.css'],
})
export class SowEditComponent implements OnInit {
  private readonly sowService = inject(SowService);
  private readonly engagementsService = inject(EngagementsService);
  private readonly assetsService = inject(AssetsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  showHelp = false;

  readonly loading$ = new BehaviorSubject(true);
  readonly saving$ = new BehaviorSubject(false);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  private engagementId = '';
  readonly engagement$ = new BehaviorSubject<Engagement | null>(null);
  form!: FormGroup;

  // Status toggle
  readonly currentStatus$ = new BehaviorSubject<SowStatus>('draft');
  readonly toggling$ = new BehaviorSubject(false);

  // Scope management
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

  readonly statusLabels = SOW_STATUS_LABELS;

  get isScopeLockedByApproval(): boolean {
    return this.currentStatus$.value === 'approved';
  }

  ngOnInit(): void {
    this.engagementId = this.route.snapshot.paramMap.get('id') ?? '';

    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(240)]],
    });

    // Load SoW data
    this.sowService.get(this.engagementId).subscribe({
      next: (sow) => {
        this.form.patchValue({ title: sow.title });
        this.currentStatus$.next(sow.status);
        this.loading$.next(false);
      },
      error: () => {
        this.notify.error('Failed to load statement of work.');
        this.loading$.next(false);
      },
    });

    // Load engagement context, then load scope + client assets
    this.engagementsService.getById(this.engagementId).subscribe({
      next: (eng) => {
        this.engagement$.next(eng);
        this._loadScopeData(eng.client_id);
      },
      error: () => {
        // Non-blocking — header links just won't show
      },
    });
  }

  private _loadScopeData(clientId: string | null): void {
    forkJoin({
      scope: this.sowService.listScope(this.engagementId).pipe(
        catchError(err => {
          console.error('[sow-edit] failed to load scope', err?.status);
          return of(null as Asset[] | null);
        }),
      ),
      assets: clientId
        ? this.assetsService.list(clientId).pipe(catchError(err => {
            console.warn('[sow-edit] failed to load client assets', err?.status);
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

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving$.next(true);
    this.serverError$.next(null);

    this.sowService.update(this.engagementId, { title: this.form.value.title }).subscribe({
      next: () => {
        this.saving$.next(false);
        this.router.navigate(['/engagements', this.engagementId]);
      },
      error: (err) => {
        this.saving$.next(false);
        const detail = err?.error?.message || err?.error?.detail || 'Failed to update statement of work.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }

  toggleStatus(): void {
    const next: SowStatus = this.currentStatus$.value === 'draft' ? 'approved' : 'draft';
    this.toggling$.next(true);
    this.serverError$.next(null);

    this.sowService.update(this.engagementId, { status: next }).subscribe({
      next: () => {
        this.currentStatus$.next(next);
        this.toggling$.next(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toggling$.next(false);
        const detail = err?.error?.message || err?.error?.detail || 'Failed to update status.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }

  // ------------------------------------------------------------------
  // Scope management
  // ------------------------------------------------------------------

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
        const detail = err?.error?.message || err?.error?.detail || 'Failed to add asset to scope.';
        this.notify.error(detail);
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
        const detail = err?.error?.message || err?.error?.detail || 'Failed to remove asset from scope.';
        this.notify.error(detail);
      },
    });
  }
}
