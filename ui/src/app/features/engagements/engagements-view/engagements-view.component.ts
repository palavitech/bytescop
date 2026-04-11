import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, forkJoin, map, of, switchMap, Subscription } from 'rxjs';
import { EngagementsService } from '../services/engagements.service';
import { Engagement, EngagementStatus, EngagementType, ENGAGEMENT_STATUS_LABELS, ENGAGEMENT_TYPE_LABELS } from '../models/engagement.model';
import { SowService } from '../services/sow.service';
import { Sow, SowStatus, SOW_STATUS_LABELS } from '../models/sow.model';
import { Asset, AssetType, AssetCriticality, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS } from '../../assets/models/asset.model';
import { FindingsService } from '../services/findings.service';
import { ReportService } from '../services/report.service';
import { Finding, FINDING_SEVERITY_LABELS, FINDING_STATUS_LABELS, FindingSeverity, FindingStatus } from '../models/finding.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';
import { BcCommentsComponent } from '../../comments/components/bc-comments.component';
import { SowScopeAssetsComponent } from './sow-scope-assets.component';
import {
  Chart,
  DoughnutController,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
} from 'chart.js';

Chart.register(DoughnutController, ArcElement, BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip);

type ViewState = 'init' | 'ready' | 'error' | 'missing';
type SowState = 'init' | 'ready' | 'empty' | 'error';
type ScopeState = 'init' | 'ready' | 'error';

interface ViewModel {
  state: ViewState;
  engagement: Engagement | null;
}

interface SowViewModel {
  state: SowState;
  sow: Sow | null;
}

interface ScopeViewModel {
  state: ScopeState;
  assets: Asset[];
  total: number;
}

@Component({
  selector: 'app-engagements-view',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective, BcDatePipe, BcCommentsComponent, SowScopeAssetsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagements-view.component.html',
  styleUrl: './engagements-view.component.css',
})
export class EngagementsViewComponent implements OnInit, OnDestroy {
  private readonly engagementsService = inject(EngagementsService);
  private readonly sowService = inject(SowService);
  private readonly findingsService = inject(FindingsService);
  private readonly reportService = inject(ReportService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  showHelp = false;
  showSummary = false;
  summaryTotal = 0;
  assetChartHeight = 168;
  assetStatusChartHeight = 168;

  @ViewChild('timelineChart') timelineChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sevChart') sevChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('statChart') statChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('assetChart') assetChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cweChart') cweChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('areaChart') areaChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('owaspChart') owaspChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('assetStatusChart') assetStatusChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('assetTypeChart') assetTypeChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('assetCritChart') assetCritChartRef!: ElementRef<HTMLCanvasElement>;

  private timelineChart: Chart<'bar'> | null = null;
  private sevChart: Chart<'doughnut'> | null = null;
  private statChart: Chart<'doughnut'> | null = null;
  private assetChart: Chart<'bar'> | null = null;
  private cweChart: Chart<'doughnut'> | null = null;
  private areaChart: Chart<'doughnut'> | null = null;
  private owaspChart: Chart<'doughnut'> | null = null;
  private assetStatusChart: Chart<'bar'> | null = null;
  private assetTypeChart: Chart<'doughnut'> | null = null;
  private assetCritChart: Chart<'bar'> | null = null;
  private chartSub: Subscription | null = null;

  private readonly sevOrder: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
  private readonly statOrder: FindingStatus[] = ['open', 'triage', 'accepted', 'fixed', 'false_positive'];

  private readonly sevColors: Record<string, string> = {
    critical: '#ff5c5c',
    high: '#ffaa33',
    medium: '#ffe066',
    low: '#55ccff',
    info: 'rgba(201,212,255,0.7)',
  };

  private readonly statColors: Record<string, string> = {
    open: '#ff5c5c',
    triage: '#ffaa33',
    accepted: '#00ffb3',
    fixed: '#55ccff',
    false_positive: 'rgba(201,212,255,0.5)',
  };

  private readonly critColors: Record<string, string> = {
    high: '#ff5c5c',
    medium: '#ffaa33',
    low: '#55ccff',
  };

  private readonly chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          color: 'rgba(255,255,255,0.55)',
          font: { family: 'IBM Plex Mono', size: 11 },
          padding: 12,
          boxWidth: 12,
        },
      },
      tooltip: {
        titleFont: { family: 'IBM Plex Mono', size: 11 },
        bodyFont: { family: 'IBM Plex Mono', size: 11 },
      },
    },
  };

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly refreshSow$ = new BehaviorSubject<void>(undefined);
  readonly confirmingDelete$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject(false);

  private engagementId = '';

  vm$ = of<ViewModel>({ state: 'init', engagement: null });
  sowVm$ = of<SowViewModel>({ state: 'init', sow: null });
  private readonly refreshScope$ = new BehaviorSubject<void>(undefined);
  scopeVm$ = of<ScopeViewModel>({ state: 'init', assets: [], total: 0 });


  ngOnInit(): void {
    this.engagementId = this.route.snapshot.paramMap.get('id') ?? '';

    this.vm$ = this.refresh$.pipe(
      switchMap(() =>
        this.engagementsService.getById(this.engagementId).pipe(
          map(engagement => ({ state: 'ready' as ViewState, engagement })),
          catchError(err => {
            if (err?.status === 404) {
              return of({ state: 'missing' as ViewState, engagement: null });
            }
            return of({ state: 'error' as ViewState, engagement: null });
          }),
        ),
      ),
    );

    this.sowVm$ = this.refreshSow$.pipe(
      switchMap(() =>
        this.sowService.get(this.engagementId).pipe(
          map(sow => ({ state: 'ready' as SowState, sow })),
          catchError(err => {
            if (err?.status === 404) {
              return of({ state: 'empty' as SowState, sow: null });
            }
            return of({ state: 'error' as SowState, sow: null });
          }),
        ),
      ),
    );

    this.scopeVm$ = this.refreshScope$.pipe(
      switchMap(() =>
        this.sowService.listScope(this.engagementId).pipe(
          map(assets => ({ state: 'ready' as ScopeState, assets, total: assets.length })),
          catchError(err => {
            console.error('[engagement-view] failed to load scope', err?.status);
            return of({ state: 'error' as ScopeState, assets: [] as Asset[], total: 0 });
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
    if (this.showHelp) {
      this.showSummary = false;
      this.destroyCharts();
    }
  }

  toggleSummary(): void {
    this.showSummary = !this.showSummary;
    if (this.showSummary) {
      this.renderCharts();
    } else {
      this.destroyCharts();
    }
  }

  refresh(): void {
    this.refresh$.next();
    this.refreshSow$.next();
    this.refreshScope$.next();
  }

  refreshSow(): void {
    this.refreshSow$.next();
    this.refreshScope$.next();
  }

  // -- Engagement delete --

  confirmDelete(): void {
    this.confirmingDelete$.next(true);
  }

  cancelDelete(): void {
    this.confirmingDelete$.next(false);
  }

  deleteEngagement(eng: Engagement): void {
    this.deleting$.next(true);
    this.engagementsService.delete(eng.id).subscribe({
      next: () => {
        this.deleting$.next(false);
        this.router.navigate(['/engagements']);
      },
      error: (err) => {
        this.deleting$.next(false);
        this.confirmingDelete$.next(false);
        this.notify.error(err?.error?.detail || 'Failed to delete engagement.');
      },
    });
  }

  // -- Report generation --

  generatingReport = false;

  generateReport(eng: Engagement): void {
    if (this.generatingReport) return;
    this.generatingReport = true;
    this.cdr.markForCheck();

    forkJoin({
      findings: this.findingsService.list(eng.id).pipe(catchError(err => {
        console.warn('[engagement-view] report: failed to load findings', err?.status);
        return of([] as Finding[]);
      })),
      scope: this.sowService.listScope(eng.id).pipe(catchError(err => {
        console.warn('[engagement-view] report: failed to load scope', err?.status);
        return of([] as Asset[]);
      })),
    }).subscribe({
      next: async ({ findings, scope }) => {
        try {
          await this.reportService.generate(eng, findings, scope);
        } catch (err) {
          console.error('[engagement-view] report generation failed', err);
          this.notify.error('Failed to generate report.');
        }
        this.generatingReport = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.notify.error('Failed to load data for report.');
        this.generatingReport = false;
        this.cdr.markForCheck();
      },
    });
  }

  // -- Helpers --

  prettyStatus(status: string): string {
    return ENGAGEMENT_STATUS_LABELS[status as EngagementStatus] ?? status;
  }

  prettyType(type: string): string {
    return ENGAGEMENT_TYPE_LABELS[type as EngagementType] ?? type;
  }

  statusClass(status: string): string {
    return `bc-statusEngagement--${status}`;
  }

  prettySowStatus(status: string): string {
    return SOW_STATUS_LABELS[status as SowStatus] ?? status;
  }

  sowStatusClass(status: string): string {
    return `bc-statusSow--${status}`;
  }

  daysRemaining(start: string | null, end: string | null): string {
    if (!end) return '—';
    const endD = new Date(`${end}T00:00:00`);
    if (Number.isNaN(endD.getTime())) return '—';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ms = endD.getTime() - today.getTime();
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    if (days < 0) return `${Math.abs(days)} day(s) past end`;
    return `${days} day(s) remaining`;
  }

  // -- Summary charts --

  private renderCharts(): void {
    this.destroyCharts();
    this.chartSub = forkJoin({
      findings: this.findingsService.list(this.engagementId).pipe(catchError(err => {
        console.warn('[engagement-view] charts: failed to load findings', err?.status);
        return of([] as Finding[]);
      })),
      scope: this.sowService.listScope(this.engagementId).pipe(catchError(err => {
        console.warn('[engagement-view] charts: failed to load scope', err?.status);
        return of([] as Asset[]);
      })),
    }).subscribe(({ findings, scope }) => {
      this.summaryTotal = findings.length;
      this.cdr.detectChanges();

      if (this.timelineChartRef?.nativeElement) {
        this.timelineChart = this.createTimelineBar(this.timelineChartRef.nativeElement, findings);
      }
      if (this.sevChartRef?.nativeElement) {
        this.sevChart = this.createDoughnut(
          this.sevChartRef.nativeElement, findings, 'severity',
          this.sevOrder, this.sevColors, this.prettySeverity,
        );
      }
      if (this.statChartRef?.nativeElement) {
        this.statChart = this.createDoughnut(
          this.statChartRef.nativeElement, findings, 'status',
          this.statOrder, this.statColors, this.prettyFindingStatus,
        );
      }
      if (this.assetChartRef?.nativeElement) {
        this.assetChart = this.createAssetSeverityBar(this.assetChartRef.nativeElement, findings);
      }
      if (this.cweChartRef?.nativeElement) {
        this.cweChart = this.createFieldDoughnut(this.cweChartRef.nativeElement, findings, 'cwe_id');
      }
      if (this.areaChartRef?.nativeElement) {
        this.areaChart = this.createFieldDoughnut(this.areaChartRef.nativeElement, findings, 'assessment_area');
      }
      if (this.owaspChartRef?.nativeElement) {
        this.owaspChart = this.createFieldDoughnut(this.owaspChartRef.nativeElement, findings, 'owasp_category');
      }
      if (this.assetStatusChartRef?.nativeElement) {
        this.assetStatusChart = this.createAssetStatusBar(this.assetStatusChartRef.nativeElement, findings);
      }
      if (this.assetTypeChartRef?.nativeElement) {
        this.assetTypeChart = this.createAssetTypeDoughnut(this.assetTypeChartRef.nativeElement, scope);
      }
      if (this.assetCritChartRef?.nativeElement) {
        this.assetCritChart = this.createAssetCriticalityBar(this.assetCritChartRef.nativeElement, scope, findings);
      }
    });
  }

  private destroyCharts(): void {
    this.timelineChart?.destroy(); this.timelineChart = null;
    this.sevChart?.destroy(); this.sevChart = null;
    this.statChart?.destroy(); this.statChart = null;
    this.assetChart?.destroy(); this.assetChart = null;
    this.cweChart?.destroy(); this.cweChart = null;
    this.areaChart?.destroy(); this.areaChart = null;
    this.owaspChart?.destroy(); this.owaspChart = null;
    this.assetStatusChart?.destroy(); this.assetStatusChart = null;
    this.assetTypeChart?.destroy(); this.assetTypeChart = null;
    this.assetCritChart?.destroy(); this.assetCritChart = null;
    this.chartSub?.unsubscribe(); this.chartSub = null;
  }

  private createDoughnut(
    canvas: HTMLCanvasElement,
    items: Finding[],
    key: 'severity' | 'status',
    order: string[],
    colors: Record<string, string>,
    pretty: (s: string) => string,
  ): Chart<'doughnut'> {
    const m = new Map<string, number>();
    for (const f of items) {
      const v = (f[key] || '').toLowerCase();
      m.set(v, (m.get(v) || 0) + 1);
    }
    const filtered = order.filter(k => (m.get(k) || 0) > 0);
    return new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: filtered.map(k => pretty(k)),
        datasets: [{
          data: filtered.map(k => m.get(k)!),
          backgroundColor: filtered.map(k => colors[k]),
          borderWidth: 0,
        }],
      },
      options: this.chartOpts,
    });
  }

  private static readonly PALETTE = [
    '#00ffb3', '#00b7ff', '#ff5c5c', '#ffaa33', '#ffe066',
    '#a78bfa', '#f472b6', '#34d399', '#38bdf8', '#fb923c',
    '#c084fc', '#4ade80', '#facc15', '#f87171', '#22d3ee',
  ];

  private createFieldDoughnut(
    canvas: HTMLCanvasElement,
    items: Finding[],
    field: keyof Finding,
  ): Chart<'doughnut'> {
    const m = new Map<string, number>();
    for (const f of items) {
      const v = (f[field] as string || '').trim();
      if (!v) continue;
      m.set(v, (m.get(v) || 0) + 1);
    }
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([k]) => k);
    const values = sorted.map(([, v]) => v);
    const colors = labels.map((_, i) => EngagementsViewComponent.PALETTE[i % EngagementsViewComponent.PALETTE.length]);
    return new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
      },
      options: this.chartOpts,
    });
  }

  private createAssetSeverityBar(canvas: HTMLCanvasElement, items: Finding[]): Chart<'bar'> {
    const assetMap = new Map<string, Map<string, number>>();
    for (const f of items) {
      const asset = f.asset_name || 'Unlinked';
      const sev = (f.severity || '').toLowerCase();
      if (!assetMap.has(asset)) assetMap.set(asset, new Map());
      const m = assetMap.get(asset)!;
      m.set(sev, (m.get(sev) || 0) + 1);
    }

    const sorted = [...assetMap.entries()]
      .map(([name, m]) => ({ name, total: [...m.values()].reduce((a, b) => a + b, 0), m }))
      .sort((a, b) => b.total - a.total);

    const labels = sorted.map(a => a.name);
    const datasets = this.sevOrder
      .filter(sev => sorted.some(a => (a.m.get(sev) || 0) > 0))
      .map(sev => ({
        label: this.prettySeverity(sev),
        data: sorted.map(a => a.m.get(sev) || 0),
        backgroundColor: this.sevColors[sev],
        borderWidth: 0,
        barThickness: 28,
        maxBarThickness: 28,
      }));

    // Dynamic height: 42px per asset, min 168px
    this.assetChartHeight = Math.max(168, sorted.length * 42);
    this.cdr.markForCheck();

    return new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 },
            grid: { color: 'rgba(201,212,255,0.08)' },
          },
          y: {
            stacked: true,
            ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, padding: 10, boxWidth: 12 },
          },
          tooltip: {
            bodyFont: { family: 'IBM Plex Mono' },
            titleFont: { family: 'IBM Plex Mono' },
          },
        },
      },
    });
  }

  private createTimelineBar(canvas: HTMLCanvasElement, items: Finding[]): Chart<'bar'> {
    // Bucket findings by date (YYYY-MM-DD), stacked by severity
    const dateMap = new Map<string, Map<string, number>>();
    for (const f of items) {
      const date = (f.created_at || '').slice(0, 10);
      if (!date) continue;
      if (!dateMap.has(date)) dateMap.set(date, new Map());
      const m = dateMap.get(date)!;
      const sev = (f.severity || '').toLowerCase();
      m.set(sev, (m.get(sev) || 0) + 1);
    }

    // Fill date range from earliest finding to today
    const rawDates = [...dateMap.keys()].sort();
    const sortedDates: string[] = [];
    if (rawDates.length > 0) {
      const start = new Date(`${rawDates[0]}T00:00:00`);
      const end = new Date();
      for (const d = start; d <= end; d.setDate(d.getDate() + 1)) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        sortedDates.push(`${yyyy}-${mm}-${dd}`);
      }
    }
    const datasets = this.sevOrder
      .filter(sev => sortedDates.some(d => (dateMap.get(d)?.get(sev) || 0) > 0))
      .map(sev => ({
        label: this.prettySeverity(sev),
        data: sortedDates.map(d => dateMap.get(d)?.get(sev) || 0),
        backgroundColor: this.sevColors[sev],
        borderWidth: 0,
        maxBarThickness: 40,
      }));

    return new Chart(canvas, {
      type: 'bar',
      data: { labels: sortedDates, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, maxRotation: 45 },
            grid: { display: false },
          },
          y: {
            stacked: true,
            ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 },
            grid: { color: 'rgba(201,212,255,0.08)' },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, padding: 10, boxWidth: 12 },
          },
          tooltip: {
            bodyFont: { family: 'IBM Plex Mono' },
            titleFont: { family: 'IBM Plex Mono' },
          },
        },
      },
    });
  }

  private createAssetStatusBar(canvas: HTMLCanvasElement, items: Finding[]): Chart<'bar'> {
    const assetMap = new Map<string, Map<string, number>>();
    for (const f of items) {
      const asset = f.asset_name || 'Unlinked';
      const stat = (f.status || '').toLowerCase();
      if (!assetMap.has(asset)) assetMap.set(asset, new Map());
      const m = assetMap.get(asset)!;
      m.set(stat, (m.get(stat) || 0) + 1);
    }

    const sorted = [...assetMap.entries()]
      .map(([name, m]) => ({ name, total: [...m.values()].reduce((a, b) => a + b, 0), m }))
      .sort((a, b) => b.total - a.total);

    const labels = sorted.map(a => a.name);
    const datasets = this.statOrder
      .filter(stat => sorted.some(a => (a.m.get(stat) || 0) > 0))
      .map(stat => ({
        label: this.prettyFindingStatus(stat),
        data: sorted.map(a => a.m.get(stat) || 0),
        backgroundColor: this.statColors[stat],
        borderWidth: 0,
        barThickness: 28,
        maxBarThickness: 28,
      }));

    this.assetStatusChartHeight = Math.max(168, sorted.length * 42);
    this.cdr.markForCheck();

    return new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 },
            grid: { color: 'rgba(201,212,255,0.08)' },
          },
          y: {
            stacked: true,
            ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, padding: 10, boxWidth: 12 },
          },
          tooltip: {
            bodyFont: { family: 'IBM Plex Mono' },
            titleFont: { family: 'IBM Plex Mono' },
          },
        },
      },
    });
  }

  private createAssetTypeDoughnut(canvas: HTMLCanvasElement, scope: Asset[]): Chart<'doughnut'> {
    const m = new Map<string, number>();
    for (const a of scope) {
      const t = a.asset_type || '';
      if (!t) continue;
      m.set(t, (m.get(t) || 0) + 1);
    }
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([k]) => ASSET_TYPE_LABELS[k as AssetType] ?? k);
    const values = sorted.map(([, v]) => v);
    const colors = labels.map((_, i) => EngagementsViewComponent.PALETTE[i % EngagementsViewComponent.PALETTE.length]);
    return new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
      },
      options: this.chartOpts,
    });
  }

  private createAssetCriticalityBar(canvas: HTMLCanvasElement, scope: Asset[], findings: Finding[]): Chart<'bar'> {
    const critOrder: AssetCriticality[] = ['high', 'medium', 'low'];

    // Build a set of asset IDs per criticality
    const critAssetIds = new Map<string, Set<string>>();
    for (const crit of critOrder) {
      critAssetIds.set(crit, new Set());
    }
    for (const a of scope) {
      const crit = (a.criticality || '').toLowerCase();
      critAssetIds.get(crit)?.add(a.id);
    }

    // Count findings per criticality group
    const critCounts = new Map<string, number>();
    for (const crit of critOrder) {
      critCounts.set(crit, 0);
    }
    for (const f of findings) {
      if (!f.asset_id) continue;
      for (const crit of critOrder) {
        if (critAssetIds.get(crit)?.has(f.asset_id)) {
          critCounts.set(crit, (critCounts.get(crit) || 0) + 1);
          break;
        }
      }
    }

    const labels = critOrder.map(c => ASSET_CRIT_LABELS[c]);
    const data = critOrder.map(c => critCounts.get(c) || 0);
    const bgColors = critOrder.map(c => this.critColors[c]);

    return new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Findings',
          data,
          backgroundColor: bgColors,
          borderWidth: 0,
          maxBarThickness: 28,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 },
            grid: { color: 'rgba(201,212,255,0.08)' },
          },
          y: {
            ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            bodyFont: { family: 'IBM Plex Mono' },
            titleFont: { family: 'IBM Plex Mono' },
          },
        },
      },
    });
  }

  prettySeverity(s: string): string {
    return FINDING_SEVERITY_LABELS[s as FindingSeverity] ?? s;
  }

  prettyFindingStatus(s: string): string {
    return FINDING_STATUS_LABELS[s as FindingStatus] ?? s;
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }
}
