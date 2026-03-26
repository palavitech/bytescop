import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, finalize, map, of, switchMap } from 'rxjs';
import { AssetsService } from '../services/assets.service';
import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS } from '../models/asset.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';

type ViewState = 'init' | 'ready' | 'error';

interface ViewModel {
  state: ViewState;
  assets: Asset[];
  total: number;
  deletingId: string | null;
  clientFilter: string | null;
}

@Component({
  selector: 'app-assets-list',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assets-list.component.html',
  styleUrl: './assets-list.component.css',
})
export class AssetsListComponent implements OnInit {
  private readonly assetsService = inject(AssetsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly profileService = inject(UserProfileService);

  showHelp = false;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly deletingId$ = new BehaviorSubject<string | null>(null);
  clientFilter: string | null = null;

  vm$ = of<ViewModel>({ state: 'init', assets: [], total: 0, deletingId: null, clientFilter: null });

  ngOnInit(): void {
    this.clientFilter = this.route.snapshot.queryParamMap.get('client');

    this.vm$ = combineLatest([
      this.refresh$.pipe(
        switchMap(() =>
          this.assetsService.list(this.clientFilter ?? undefined).pipe(
            map(assets => ({ state: 'ready' as ViewState, assets })),
            catchError(() => of({ state: 'error' as ViewState, assets: [] as Asset[] })),
          ),
        ),
      ),
      this.deletingId$,
    ]).pipe(
      map(([data, deletingId]) => ({
        ...data,
        total: data.assets.length,
        deletingId,
        clientFilter: this.clientFilter,
      } as ViewModel)),
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

  confirmDelete(id: string): void {
    this.deletingId$.next(id);
  }

  cancelDelete(): void {
    this.deletingId$.next(null);
  }

  deleteAsset(asset: Asset): void {
    this.assetsService.delete(asset.id).pipe(
      finalize(() => this.deletingId$.next(null)),
    ).subscribe({
      next: () => {
        this.refresh();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to delete asset.');
      },
    });
  }

  createAsset(): void {
    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_assets ?? 0;
    if (limit > 0) {
      const current = sub?.usage?.assets ?? 0;
      if (current >= limit) {
        this.notify.error(`Asset limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        return;
      }
    }
    const qp = this.clientFilter ? { client: this.clientFilter } : {};
    this.router.navigate(['/assets/create'], { queryParams: qp });
  }

  exportCsv(assets: Asset[]): void {
    const header = 'Name,Type,Client,Environment,Criticality,Target,Created';
    const rows = assets.map(a =>
      `"${a.name}","${this.typeLabel(a.asset_type)}","${a.client_name}","${this.envLabel(a.environment)}","${this.critLabel(a.criticality)}","${a.target}","${a.created_at}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'assets.csv';
    link.click();
    URL.revokeObjectURL(url);
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
