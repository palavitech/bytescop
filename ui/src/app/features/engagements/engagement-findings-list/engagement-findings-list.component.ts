import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnDestroy } from '@angular/core';
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
import { FindingsTableStandardComponent } from './tables/findings-table-standard.component';
import { FindingsTableMalwareComponent } from './tables/findings-table-malware.component';

type VmState = 'init' | 'ready' | 'error';

interface FilterState {
  severity: string;
  status: string;
}

interface TimeBar {
  percent: number;
  label: string;
  color: string;
}

interface ViewModel {
  state: VmState;
  engagement: Engagement | null;
  items: Finding[];
  total: number;
  filter: FilterState;
  timeBar: TimeBar | null;
}

@Component({
  selector: 'app-engagement-findings-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink, HasPermissionDirective, FindingsTableStandardComponent, FindingsTableMalwareComponent],
  templateUrl: './engagement-findings-list.component.html',
  styleUrl: './engagement-findings-list.component.css',
})
export class EngagementFindingsListComponent implements OnDestroy {
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly engagementsService = inject(EngagementsService);
  private readonly findingsService = inject(FindingsService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  showHelp = false;
  showFilters = false;
  initializingAnalysis = false;

  private readonly refresh$ = new BehaviorSubject<number>(0);
  private readonly filter$ = new BehaviorSubject<FilterState>({ severity: '', status: '' });
  private refreshTimer?: ReturnType<typeof setTimeout>;

  private readonly engagementId$ = this.route.paramMap.pipe(
    map(p => p.get('id') || ''),
    shareReplay(1),
  );

  private readonly engagement$ = this.engagementId$.pipe(
    switchMap(id => id
      ? this.engagementsService.getById(id).pipe(catchError(() => of(null)))
      : of(null),
    ),
    shareReplay(1),
  );

  private readonly findings$ = combineLatest([this.engagementId$, this.refresh$, this.filter$]).pipe(
    switchMap(([id, , f]) => {
      if (!id) return of([] as Finding[]);
      return this.findingsService.list(id, {
        severity: f.severity || undefined,
        status: f.status || undefined,
        include_drafts: true,
      }).pipe(
        catchError(() => of([] as Finding[])),
      );
    }),
    shareReplay(1),
  );

  readonly vm$ = combineLatest([this.engagement$, this.findings$, this.filter$]).pipe(
    map(([eng, items, f]): ViewModel => {
      const state: VmState = eng === null ? 'error' : 'ready';
      return {
        state,
        engagement: eng,
        items,
        total: items.length,
        filter: f,
        timeBar: this.buildTimeBar(eng?.start_date ?? null, eng?.end_date ?? null),
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

  onSeverityFilterChange(value: string): void {
    this.filter$.next({ ...this.filter$.value, severity: value });
  }

  onStatusFilterChange(value: string): void {
    this.filter$.next({ ...this.filter$.value, status: value });
  }

  clearAllFilters(): void {
    this.filter$.next({ severity: '', status: '' });
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

  // -- Analysis Checks --

  initializeAnalysis(engagement: Engagement | null): void {
    if (!engagement) return;
    this.initializingAnalysis = true;
    this.cdr.markForCheck();

    this.engagementsService.initializeAnalysis(engagement.id).subscribe({
      next: (res) => {
        this.initializingAnalysis = false;
        if (res.created > 0) {
          this.refresh();
        } else {
          this.notify.info('All analysis checks already exist.');
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.initializingAnalysis = false;
        this.cdr.markForCheck();
        this.notify.error(err?.error?.message || err?.error?.detail || 'Failed to initialize analysis.');
      },
    });
  }

  executeFinding(finding: Finding, engagement: Engagement | null): void {
    if (!engagement) return;

    this.engagementsService.executeFinding(engagement.id, finding.id).subscribe({
      next: () => this.scheduleRefresh(3000),
      error: (err) => {
        this.notify.error(err?.error?.message || err?.error?.detail || 'Failed to start execution.');
      },
    });
  }

  deleteFinding(finding: Finding, engagement: Engagement | null): void {
    if (!engagement) return;

    this.findingsService.delete(engagement.id, finding.id).subscribe({
      next: () => this.refresh(),
      error: (err) => {
        this.notify.error(err?.error?.message || err?.error?.detail || 'Failed to delete finding.');
      },
    });
  }

  private scheduleRefresh(delayMs: number): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), delayMs);
  }

  ngOnDestroy(): void {
    clearTimeout(this.refreshTimer);
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
}
