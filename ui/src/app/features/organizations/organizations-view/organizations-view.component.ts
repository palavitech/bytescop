import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, map, of, switchMap } from 'rxjs';
import { OrganizationsService } from '../services/organizations.service';
import { Organization } from '../models/organization.model';
import { AssetsService } from '../../assets/services/assets.service';
import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS } from '../../assets/models/asset.model';
import { EngagementsService } from '../../engagements/services/engagements.service';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';

type ViewState = 'init' | 'ready' | 'error' | 'missing';
type AssetsState = 'init' | 'ready' | 'error';

interface ViewModel {
  state: ViewState;
  organization: Organization | null;
}

interface AssetsViewModel {
  state: AssetsState;
  assets: Asset[];
  total: number;
}

@Component({
  selector: 'app-organizations-view',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organizations-view.component.html',
  styleUrl: './organizations-view.component.css',
})
export class OrganizationsViewComponent implements OnInit {
  private readonly orgService = inject(OrganizationsService);
  private readonly assetsService = inject(AssetsService);
  private readonly engagementsService = inject(EngagementsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly refreshAssets$ = new BehaviorSubject<void>(undefined);
  readonly confirmingDelete$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject(false);

  private orgId = '';

  vm$ = of<ViewModel>({ state: 'init', organization: null });
  assetsVm$ = of<AssetsViewModel>({ state: 'init', assets: [], total: 0 });

  ngOnInit(): void {
    this.orgId = this.route.snapshot.paramMap.get('id') ?? '';

    this.vm$ = this.refresh$.pipe(
      switchMap(() =>
        this.orgService.getById(this.orgId).pipe(
          map(organization => ({ state: 'ready' as ViewState, organization })),
          catchError(err => {
            if (err?.status === 404) {
              return of({ state: 'missing' as ViewState, organization: null });
            }
            return of({ state: 'error' as ViewState, organization: null });
          }),
        ),
      ),
    );

    this.assetsVm$ = this.refreshAssets$.pipe(
      switchMap(() =>
        this.assetsService.list(this.orgId).pipe(
          map(assets => ({ state: 'ready' as AssetsState, assets, total: assets.length })),
          catchError(() => of({ state: 'error' as AssetsState, assets: [] as Asset[], total: 0 })),
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
    this.refreshAssets$.next();
  }

  refreshAssets(): void {
    this.refreshAssets$.next();
  }

  confirmDelete(): void {
    this.confirmingDelete$.next(true);
  }

  cancelDelete(): void {
    this.confirmingDelete$.next(false);
  }

  deleteOrganization(org: Organization): void {
    this.deleting$.next(true);
    this.engagementsService.list({ client: org.id }).pipe(
      switchMap(engagements => {
        if (engagements.length > 0) {
          const count = engagements.length;
          const s = count === 1 ? '' : 's';
          this.notify.error(
            `Cannot delete "${org.name}" — it has ${count} engagement${s}. Remove all engagements first.`,
          );
          this.deleting$.next(false);
          this.confirmingDelete$.next(false);
          return of('blocked');
        }
        return this.orgService.delete(org.id);
      }),
    ).subscribe({
      next: (result) => {
        if (result === 'blocked') return;
        this.deleting$.next(false);
        this.router.navigate(['/organizations']);
      },
      error: (err) => {
        this.deleting$.next(false);
        this.confirmingDelete$.next(false);
        this.notify.error(err?.error?.detail || 'Failed to delete client.');
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
