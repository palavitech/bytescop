import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnDestroy } from '@angular/core';
import { Location, CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, combineLatest, of, Subscription, interval } from 'rxjs';
import { catchError, map, shareReplay, switchMap, takeWhile, tap } from 'rxjs/operators';
import { EngagementsService } from '../services/engagements.service';
import { Engagement, MalwareSample } from '../models/engagement.model';
import { FindingsService } from '../services/findings.service';
import { Finding, FINDING_SEVERITY_LABELS, FINDING_STATUS_LABELS, FindingSeverity, FindingStatus } from '../models/finding.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';
import { FindingsTableStandardComponent } from './tables/findings-table-standard.component';
import { FindingsTableMalwareComponent } from './tables/findings-table-malware.component';
import { AnalysisProgressComponent } from './analysis-progress/analysis-progress.component';
import { JobsService, AnalysisStep } from '../../../services/core/jobs/jobs.service';

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
  imports: [CommonModule, FormsModule, RouterLink, HasPermissionDirective, BcDatePipe, FindingsTableStandardComponent, FindingsTableMalwareComponent, AnalysisProgressComponent],
  templateUrl: './engagement-findings-list.component.html',
  styleUrl: './engagement-findings-list.component.css',
})
export class EngagementFindingsListComponent implements OnDestroy {
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly engagementsService = inject(EngagementsService);
  private readonly findingsService = inject(FindingsService);
  private readonly jobsService = inject(JobsService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  showHelp = false;
  showFilters = false;

  // -- Static Analysis --
  showSamplePicker = false;
  samples: MalwareSample[] = [];
  selectedSampleId = '';
  analysisRunning = false;
  analysisStatus: 'running' | 'done' | 'failed' = 'running';
  analysisFilename = '';
  analysisSteps: AnalysisStep[] = [];
  analysisFindingsCreated = 0;
  analysisTotalSteps = 0;
  analysisError = '';
  private pollSub?: Subscription;

  private readonly refresh$ = new BehaviorSubject<number>(0);
  private readonly filter$ = new BehaviorSubject<FilterState>({ severity: '', status: '' });

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

  // -- Static Analysis --

  private analysisEngagement: Engagement | null = null;

  openSamplePicker(engagement: Engagement | null): void {
    if (!engagement) return;
    this.analysisEngagement = engagement;
    this.showSamplePicker = true;
    this.selectedSampleId = '';
    this.engagementsService.listSamples(engagement.id).subscribe({
      next: (samples) => { this.samples = samples; this.cdr.markForCheck(); },
      error: () => this.notify.error('Failed to load samples.'),
    });
  }

  cancelSamplePicker(): void {
    this.showSamplePicker = false;
  }

  confirmStaticAnalysis(): void {
    this.startStaticAnalysis(this.analysisEngagement);
  }

  startStaticAnalysis(engagement: Engagement | null): void {
    if (!engagement || !this.selectedSampleId) return;
    this.showSamplePicker = false;

    const sample = this.samples.find(s => s.id === this.selectedSampleId);
    this.analysisFilename = sample?.original_filename ?? 'unknown';
    this.analysisRunning = true;
    this.analysisStatus = 'running';
    this.analysisSteps = [];
    this.analysisFindingsCreated = 0;
    this.analysisTotalSteps = 0;
    this.analysisError = '';
    this.cdr.markForCheck();

    this.engagementsService.triggerStaticAnalysis(engagement.id, this.selectedSampleId).subscribe({
      next: (res) => this.pollJobStatus(res.job_id),
      error: (err) => {
        this.analysisRunning = false;
        this.cdr.markForCheck();
        this.notify.error(err?.error?.detail || 'Failed to start analysis.');
      },
    });
  }

  private pollJobStatus(jobId: string): void {
    this.pollSub?.unsubscribe();
    this.pollSub = interval(2000).pipe(
      switchMap(() => this.jobsService.getJob(jobId)),
      tap(job => {
        const result = job.result as Record<string, unknown> | null;
        if (result?.['steps']) {
          this.analysisSteps = result['steps'] as AnalysisStep[];
          this.analysisFindingsCreated = (result['findings_created'] as number) ?? 0;
          this.analysisTotalSteps = (result['total_steps'] as number) ?? 0;
        }

        if (job.status === 'READY') {
          this.analysisStatus = 'done';
          this.cdr.markForCheck();
        } else if (job.status === 'FAILED') {
          this.analysisStatus = 'failed';
          this.analysisError = job.error_message;
          this.cdr.markForCheck();
        }
        this.cdr.markForCheck();
      }),
      takeWhile(job => job.status === 'PENDING' || job.status === 'PROCESSING', true),
    ).subscribe();
  }

  dismissAnalysis(): void {
    this.analysisRunning = false;
    this.pollSub?.unsubscribe();
    this.refresh();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
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
