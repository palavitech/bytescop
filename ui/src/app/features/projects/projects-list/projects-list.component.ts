import { Component, ChangeDetectionStrategy, inject, OnInit, DestroyRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, combineLatest, catchError, map, of, switchMap } from 'rxjs';
import { ProjectsService } from '../services/projects.service';
import { Project, ProjectStatus, PROJECT_STATUS_LABELS } from '../models/project.model';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { OrganizationRef } from '../../organizations/models/organization.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';

type ViewState = 'init' | 'ready' | 'error';

interface Filters {
  client: string | null;
  status: ProjectStatus | null;
}

interface ViewModel {
  state: ViewState;
  projects: Project[];
  total: number;
  organizations: OrganizationRef[];
  filters: Filters;
  filterLabels: { clientName: string | null; statusLabel: string | null };
}

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective, BcDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-list.component.html',
  styleUrl: './projects-list.component.css',
})
export class ProjectsListComponent implements OnInit {
  private readonly projectsService = inject(ProjectsService);
  private readonly orgService = inject(OrganizationsService);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notify = inject(NotificationService);
  private readonly profileService = inject(UserProfileService);

  showHelp = false;
  showFilters = false;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly filters$ = new BehaviorSubject<Filters>({ client: null, status: null });

  readonly vm$ = this.refresh$.pipe(
    switchMap(() =>
      combineLatest([this.filters$, this.orgService.ref().pipe(catchError(() => of([] as OrganizationRef[])))]).pipe(
        switchMap(([filters, organizations]) =>
          this.projectsService.list({
            client: filters.client ?? undefined,
            status: filters.status ?? undefined,
          }).pipe(
            map(projects => ({
              state: 'ready' as ViewState,
              projects,
              total: projects.length,
              organizations,
              filters,
              filterLabels: {
                clientName: filters.client
                  ? organizations.find(o => o.id === filters.client)?.name ?? null
                  : null,
                statusLabel: filters.status
                  ? PROJECT_STATUS_LABELS[filters.status] ?? null
                  : null,
              },
            } as ViewModel)),
            catchError(() => of({
              state: 'error' as ViewState,
              projects: [] as Project[],
              total: 0,
              organizations,
              filters,
              filterLabels: { clientName: null, statusLabel: null },
            } as ViewModel)),
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
        const allowed: ProjectStatus[] = ['active', 'on_hold', 'completed'];
        const status = statusRaw && allowed.includes(statusRaw as ProjectStatus)
          ? statusRaw as ProjectStatus
          : null;

        const current = this.filters$.value;
        if (client !== current.client || status !== current.status) {
          this.filters$.next({ client, status });
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
    this.pushFilterToUrl({ ...this.filters$.value, client: value });
  }

  onStatusFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || null;
    this.pushFilterToUrl({ ...this.filters$.value, status: value as ProjectStatus | null });
  }

  clearClientFilter(): void {
    this.pushFilterToUrl({ ...this.filters$.value, client: null });
  }

  clearStatusFilter(): void {
    this.pushFilterToUrl({ ...this.filters$.value, status: null });
  }

  clearAllFilters(): void {
    this.pushFilterToUrl({ client: null, status: null });
  }

  private pushFilterToUrl(filters: Filters): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        client: filters.client ?? null,
        status: filters.status ?? null,
      },
      queryParamsHandling: 'merge',
    });
  }

  prettyStatus(status: string): string {
    return PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status;
  }

  statusClass(status: string): string {
    return `bc-statusProject--${status}`;
  }

  createProject(): void {
    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_projects ?? 0;
    if (limit > 0) {
      const current = sub?.usage?.projects ?? 0;
      if (current >= limit) {
        this.notify.error(`Project limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        return;
      }
    }
    this.router.navigate(['/projects/create']);
  }

  exportCsv(projects: Project[]): void {
    const header = 'Name,Client,Status,Engagements,Start Date,End Date';
    const rows = projects.map(p =>
      `"${p.name}","${p.client_name}","${this.prettyStatus(p.status)}",${p.engagement_count},"${p.start_date || ''}","${p.end_date || ''}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'projects.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
