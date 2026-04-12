import { Component, ChangeDetectionStrategy, inject, OnInit, DestroyRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, combineLatest, catchError, map, of, switchMap } from 'rxjs';
import { EngagementsService } from '../services/engagements.service';
import { Engagement, EngagementStatus, EngagementType, ENGAGEMENT_STATUS_LABELS, ENGAGEMENT_TYPE_LABELS, ENGAGEMENT_TYPE_META } from '../models/engagement.model';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { OrganizationRef } from '../../organizations/models/organization.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';


type ViewState = 'init' | 'ready' | 'error';

interface Filters {
  client: string | null;
  status: EngagementStatus | null;
  engagementType: EngagementType | null;
}

interface ViewModel {
  state: ViewState;
  engagements: Engagement[];
  total: number;
  organizations: OrganizationRef[];
  filters: Filters;
  filterLabels: { clientName: string | null; statusLabel: string | null; typeName: string | null };
}

@Component({
  selector: 'app-engagements-list',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective, BcDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagements-list.component.html',
  styleUrl: './engagements-list.component.css',
})
export class EngagementsListComponent implements OnInit {
  private readonly engagementsService = inject(EngagementsService);
  private readonly orgService = inject(OrganizationsService);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notify = inject(NotificationService);
  private readonly profileService = inject(UserProfileService);

  showHelp = false;
  showFilters = false;
  readonly engagementTypes = ENGAGEMENT_TYPE_META;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly filters$ = new BehaviorSubject<Filters>({ client: null, status: null, engagementType: null });

  readonly vm$ = this.refresh$.pipe(
    switchMap(() =>
      combineLatest([this.filters$, this.orgService.ref().pipe(catchError(err => {
            console.warn('[engagements-list] failed to load org refs', err?.status);
            return of([] as OrganizationRef[]);
          }))]).pipe(
        switchMap(([filters, organizations]) =>
          this.engagementsService.list({
            client: filters.client ?? undefined,
            status: filters.status ?? undefined,
          }).pipe(
            map(engagements => {
              const filtered = filters.engagementType
                ? engagements.filter(e => e.engagement_type === filters.engagementType)
                : engagements;
              const clientName = filters.client
                ? organizations.find(o => o.id === filters.client)?.name ?? null
                : null;
              const statusLabel = filters.status
                ? ENGAGEMENT_STATUS_LABELS[filters.status] ?? null
                : null;
              const typeName = filters.engagementType
                ? ENGAGEMENT_TYPE_LABELS[filters.engagementType] ?? null
                : null;

              return {
                state: 'ready' as ViewState,
                engagements: filtered,
                total: filtered.length,
                organizations,
                filters,
                filterLabels: { clientName, statusLabel, typeName },
              } as ViewModel;
            }),
            catchError(err => {
              console.error('[engagements-list] failed to load engagements', err?.status);
              return of({
                state: 'error' as ViewState,
                engagements: [] as Engagement[],
                total: 0,
                organizations,
                filters,
                filterLabels: { clientName: null, statusLabel: null, typeName: null },
              } as ViewModel);
            }),
          ),
        ),
      ),
    ),
  );

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const client = params.get('client') || null;
        const statusRaw = params.get('status') || null;
        const typeRaw = params.get('type') || null;
        const allowed: EngagementStatus[] = ['planned', 'active', 'on_hold', 'completed'];
        const status = statusRaw && allowed.includes(statusRaw as EngagementStatus)
          ? statusRaw as EngagementStatus
          : null;
        const engagementType = typeRaw
          ? typeRaw as EngagementType
          : null;

        const current = this.filters$.value;
        if (client !== current.client || status !== current.status || engagementType !== current.engagementType) {
          this.filters$.next({ client, status, engagementType });
          this.refresh$.next();
        }
      });
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
    if (this.showHelp) this.showFilters = false;
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
    if (this.showFilters) this.showHelp = false;
  }

  refresh(): void {
    this.refresh$.next();
  }

  onClientFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || null;
    const current = this.filters$.value;
    this.pushFilterToUrl({ ...current, client: value });
  }

  onStatusFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || null;
    const current = this.filters$.value;
    this.pushFilterToUrl({ ...current, status: value as EngagementStatus | null });
  }

  clearClientFilter(): void {
    const current = this.filters$.value;
    this.pushFilterToUrl({ ...current, client: null });
  }

  clearStatusFilter(): void {
    const current = this.filters$.value;
    this.pushFilterToUrl({ ...current, status: null });
  }

  onTypeFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || null;
    const current = this.filters$.value;
    this.pushFilterToUrl({ ...current, engagementType: value as EngagementType | null });
  }

  clearTypeFilter(): void {
    const current = this.filters$.value;
    this.pushFilterToUrl({ ...current, engagementType: null });
  }

  clearAllFilters(): void {
    this.pushFilterToUrl({ client: null, status: null, engagementType: null });
  }

  private pushFilterToUrl(filters: Filters): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        client: filters.client ?? null,
        status: filters.status ?? null,
        type: filters.engagementType ?? null,
      },
      queryParamsHandling: 'merge',
    });
  }

  prettyStatus(status: string): string {
    return ENGAGEMENT_STATUS_LABELS[status as EngagementStatus] ?? status;
  }

  prettyType(type: string): string {
    return ENGAGEMENT_TYPE_LABELS[type as EngagementType] ?? type;
  }

  statusClass(status: string): string {
    return `bc-statusEngagement--${status}`;
  }

  exportCsv(engagements: Engagement[]): void {
    const header = 'Name,Client,Status,Critical,High,Medium,Low,Info,Start Date,End Date';
    const rows = engagements.map(e => {
      const s = e.findings_summary;
      return `"${e.name}","${e.client_name}","${this.prettyStatus(e.status)}",${s?.critical ?? 0},${s?.high ?? 0},${s?.medium ?? 0},${s?.low ?? 0},${s?.info ?? 0},"${e.start_date || ''}","${e.end_date || ''}"`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'engagements.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  createEngagement(): void {
    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_engagements ?? 0;
    if (limit > 0) {
      const current = sub?.usage?.engagements ?? 0;
      if (current >= limit) {
        this.notify.error(`Engagement limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        return;
      }
    }
    this.router.navigate(['/engagements/create'], { queryParams: this.createQueryParams() });
  }

  createQueryParams(): Record<string, string | null> {
    const filters = this.filters$.value;
    const qp: Record<string, string | null> = {};
    if (filters.client) qp['client'] = filters.client;
    if (filters.status === 'planned' || filters.status === 'active') {
      qp['status'] = filters.status;
    }
    return qp;
  }
}
