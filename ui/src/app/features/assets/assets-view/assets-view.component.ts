import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, map, of, switchMap } from 'rxjs';
import { AssetsService } from '../services/assets.service';
import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS } from '../models/asset.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';

type ViewState = 'init' | 'ready' | 'error' | 'missing';

interface ViewModel {
  state: ViewState;
  asset: Asset | null;
}

@Component({
  selector: 'app-assets-view',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective, BcDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assets-view.component.html',
  styleUrl: './assets-view.component.css',
})
export class AssetsViewComponent implements OnInit {
  private readonly assetsService = inject(AssetsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  readonly confirmingDelete$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject(false);

  private assetId = '';

  vm$ = of<ViewModel>({ state: 'init', asset: null });

  ngOnInit(): void {
    this.assetId = this.route.snapshot.paramMap.get('id') ?? '';

    this.vm$ = this.refresh$.pipe(
      switchMap(() =>
        this.assetsService.getById(this.assetId).pipe(
          map(asset => ({ state: 'ready' as ViewState, asset })),
          catchError(err => {
            if (err?.status === 404) {
              return of({ state: 'missing' as ViewState, asset: null });
            }
            return of({ state: 'error' as ViewState, asset: null });
          }),
        ),
      ),
    );
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  refresh(): void {
    this.refresh$.next();
  }

  confirmDelete(): void {
    this.confirmingDelete$.next(true);
  }

  cancelDelete(): void {
    this.confirmingDelete$.next(false);
  }

  deleteAsset(asset: Asset): void {
    this.deleting$.next(true);
    this.assetsService.scopeUsage(asset.id).pipe(
      switchMap(usage => {
        if (usage.count > 0) {
          const count = usage.count;
          const s = count === 1 ? '' : 's';
          this.notify.error(
            `Cannot delete "${asset.name}" — it is referenced in ${count} Statement${s} of Work. Remove it from all engagement scopes first.`,
          );
          this.deleting$.next(false);
          this.confirmingDelete$.next(false);
          return of('blocked');
        }
        return this.assetsService.delete(asset.id);
      }),
    ).subscribe({
      next: (result) => {
        if (result === 'blocked') return;
        this.deleting$.next(false);
        this.router.navigate(asset.client_id ? ['/organizations', asset.client_id] : ['/assets']);
      },
      error: (err) => {
        this.deleting$.next(false);
        this.confirmingDelete$.next(false);
        this.notify.error(err?.error?.detail || 'Failed to delete asset.');
      },
    });
  }

  typeLabel(type: string): string {
    return ASSET_TYPE_LABELS[type as keyof typeof ASSET_TYPE_LABELS] ?? type;
  }

  envLabel(env: string): string {
    return ASSET_ENV_LABELS[env as keyof typeof ASSET_ENV_LABELS] ?? env;
  }

  critLabel(crit: string): string {
    return ASSET_CRIT_LABELS[crit as keyof typeof ASSET_CRIT_LABELS] ?? crit;
  }

}
