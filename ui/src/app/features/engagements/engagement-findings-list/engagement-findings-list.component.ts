import { Component, ChangeDetectionStrategy, inject, Type } from '@angular/core';
import { Location, CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, combineLatest, of, Subscription } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { EngagementsService } from '../services/engagements.service';
import { Engagement } from '../models/engagement.model';
import { FindingsService } from '../services/findings.service';
import { Finding, FINDING_SEVERITY_LABELS, FINDING_STATUS_LABELS, FindingSeverity, FindingStatus } from '../models/finding.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { getTypeConfig, FilterOption, EngagementTypeConfig } from '../types/registry';

type VmState = 'init' | 'ready' | 'error';

interface FilterState {
  severity: string;
  status: string;
  scopeEntity: string;
}

interface TimeBar {
  percent: number;
  label: string;
  color: string;
}

interface FilterLabels {
  scopeEntityName: string;
  severityLabel: string;
  statusLabel: string;
}

interface ViewModel {
  state: VmState;
  engagement: Engagement | null;
  items: Finding[];
  total: number;
  filter: FilterState;
  filterLabels: FilterLabels;
  timeBar: TimeBar | null;
  findingsTableComponent: Type<any> | null;
  severityOptions: FilterOption[];
  statusOptions: FilterOption[];
  scopeEntityLabel: string;
  scopeEntityOptions: FilterOption[];
}

@Component({
  selector: 'app-engagement-findings-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, HasPermissionDirective],
  templateUrl: './engagement-findings-list.component.html',
  styleUrl: './engagement-findings-list.component.css',
})
export class EngagementFindingsListComponent {
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly engagementsService = inject(EngagementsService);
  private readonly findingsService = inject(FindingsService);
  private readonly notify = inject(NotificationService);

  showHelp = false;
  showFilters = false;

  private readonly refresh$ = new BehaviorSubject<number>(0);
  private readonly filter$ = new BehaviorSubject<FilterState>({ severity: '', status: '', scopeEntity: '' });
  readonly boundRefresh = () => this.refresh();

  private readonly engagementId$ = this.route.paramMap.pipe(
    map(p => p.get('id') || ''),
    shareReplay(1),
  );

  private readonly engagement$ = this.engagementId$.pipe(
    switchMap(id => id
      ? this.engagementsService.getById(id).pipe(catchError(err => {
          console.error('[findings-list] failed to load engagement', id, err?.status);
          return of(null);
        }))
      : of(null),
    ),
    shareReplay(1),
  );

  /** Fetches findings filtered by severity/status only (server-side).
   *  Scope entity filtering is applied client-side in vm$ so the dropdown
   *  always shows all available scope entities. */
  private readonly findings$ = combineLatest([this.engagement$, this.refresh$, this.filter$]).pipe(
    switchMap(([eng, , f]) => {
      if (!eng) return of([] as Finding[]);
      return this.findingsService.list(eng.id, {
        severity: f.severity || undefined,
        status: f.status || undefined,
        include_drafts: true,
      }).pipe(
        catchError(err => {
          console.error('[findings-list] failed to load findings', eng.id, err?.status);
          return of([] as Finding[]);
        }),
      );
    }),
    shareReplay(1),
  );

  readonly vm$ = combineLatest([this.engagement$, this.findings$, this.filter$]).pipe(
    map(([eng, allItems, f]): ViewModel => {
      const state: VmState = eng === null ? 'error' : 'ready';
      const config = eng ? getTypeConfig(eng.engagement_type) : null;
      const scopeEntityOptions = this.buildScopeEntityOptions(allItems, config);
      const severityOptions = config?.severityOptions ?? [];
      const statusOptions = config?.statusOptions ?? [];

      // Client-side scope entity filter
      const idField = config?.scopeEntityFilterParam as keyof Finding | undefined;
      const items = f.scopeEntity && idField
        ? allItems.filter(item => item[idField] === f.scopeEntity)
        : allItems;

      return {
        state,
        engagement: eng,
        items,
        total: items.length,
        filter: f,
        filterLabels: {
          scopeEntityName: scopeEntityOptions.find(o => o.value === f.scopeEntity)?.label ?? '',
          severityLabel: severityOptions.find(o => o.value === f.severity)?.label ?? '',
          statusLabel: statusOptions.find(o => o.value === f.status)?.label ?? '',
        },
        timeBar: this.buildTimeBar(eng?.start_date ?? null, eng?.end_date ?? null),
        findingsTableComponent: config?.findingsTableComponent ?? null,
        severityOptions,
        statusOptions,
        scopeEntityLabel: config?.scopeEntityLabel ?? 'Asset',
        scopeEntityOptions,
      };
    }),
  );

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
    this.refresh$.next(Date.now());
  }

  onScopeEntityFilterChange(value: string): void {
    this.filter$.next({ ...this.filter$.value, scopeEntity: value });
  }

  onSeverityFilterChange(value: string): void {
    this.filter$.next({ ...this.filter$.value, severity: value });
  }

  onStatusFilterChange(value: string): void {
    this.filter$.next({ ...this.filter$.value, status: value });
  }

  clearScopeEntityFilter(): void {
    this.filter$.next({ ...this.filter$.value, scopeEntity: '' });
  }

  clearSeverityFilter(): void {
    this.filter$.next({ ...this.filter$.value, severity: '' });
  }

  clearStatusFilter(): void {
    this.filter$.next({ ...this.filter$.value, status: '' });
  }

  clearAllFilters(): void {
    this.filter$.next({ severity: '', status: '', scopeEntity: '' });
  }

  prettySeverity(s: string): string {
    return FINDING_SEVERITY_LABELS[s as FindingSeverity] ?? s;
  }

  prettyStatus(s: string): string {
    return FINDING_STATUS_LABELS[s as FindingStatus] ?? s;
  }

  goToCreate(engagement: Engagement | null): void {
    if (!engagement) return;

    if (engagement.status !== 'active') {
      const messages: Record<string, string> = {
        planned: 'This engagement is still in Planned state. Mark it as Active before adding findings.',
        completed: 'This engagement is already Completed. Reopen it to add new findings.',
        on_hold: 'This engagement is On Hold. Resume it to Active before adding findings.',
      };
      this.notify.error(messages[engagement.status] || 'Engagement must be Active to add findings.');
      return;
    }

    this.router.navigate(['/engagements', engagement.id, 'findings', 'create']);
  }

  private buildTimeBar(startDate: string | null, endDate: string | null): TimeBar | null {
    if (!startDate || !endDate) return null;
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const totalMs = end.getTime() - start.getTime();
    if (totalMs <= 0) return null;

    const remainMs = end.getTime() - today.getTime();
    const percent = Math.max(0, Math.min(100, (remainMs / totalMs) * 100));

    const days = Math.ceil(remainMs / (24 * 60 * 60 * 1000));
    let label: string;
    if (days < 0) label = 'Ended';
    else if (days === 0) label = 'Ends today';
    else label = `${days} day${days === 1 ? '' : 's'} remaining`;

    let color: string;
    if (percent > 80) color = '#00c853';
    else if (percent > 50) color = '#ffab00';
    else if (percent > 20) color = '#ff9100';
    else color = '#ff1744';

    return { percent, label, color };
  }

  private buildScopeEntityOptions(items: Finding[], config: EngagementTypeConfig | null): FilterOption[] {
    if (!config) return [];
    const idField = config.scopeEntityFilterParam as keyof Finding;
    const nameField = config.scopeEntityField;
    const seen = new Map<string, string>();
    for (const f of items) {
      const id = f[idField] as string | null | undefined;
      const name = (f[nameField] as string) || '';
      if (id && !seen.has(id)) {
        seen.set(id, name);
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label: label || value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
}
