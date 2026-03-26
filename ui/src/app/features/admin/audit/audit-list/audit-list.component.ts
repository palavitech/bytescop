import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BehaviorSubject, Observable, combineLatest, of, Subscription } from 'rxjs';
import { switchMap, map, catchError, debounceTime } from 'rxjs/operators';

import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
} from 'chart.js';

import { AuditService } from '../services/audit.service';
import {
  AuditFilters,
  AuditLogListItem,
  AuditSummary,
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_COLORS,
  AUDIT_RESOURCE_TYPES,
  CHART_PALETTE,
  AuditAction,
} from '../models/audit-log.model';
import { MembersService } from '../../users/services/members.service';
import { TenantMember } from '../../users/models/member.model';
import { BcDatePipe } from '../../../../components/pipes/bc-date.pipe';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Legend, Tooltip);

type ViewState = 'init' | 'ready' | 'error';

interface ViewModel {
  state: ViewState;
  entries: AuditLogListItem[];
  count: number;
  page: number;
  pageSize: number;
  numPages: number;
}

@Component({
  selector: 'app-audit-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, BcDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit-list.component.html',
  styleUrl: './audit-list.component.css',
})
export class AuditListComponent implements OnDestroy {
  private readonly auditService = inject(AuditService);
  private readonly membersService = inject(MembersService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly location = inject(Location);

  showHelp = false;
  showFilters = false;
  showSummary = false;
  summaryLoading = false;

  @ViewChild('engActionsChart') engActionsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('findingActionsChart') findingActionsChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('actionsByIpChart') actionsByIpChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('actorChart') actorChartRef!: ElementRef<HTMLCanvasElement>;

  private engActionsChart: Chart<'bar'> | null = null;
  private findingActionsChart: Chart<'bar'> | null = null;
  private actionsByIpChart: Chart<'bar'> | null = null;
  private actorChart: Chart<'bar'> | null = null;
  actorChartHeight = 200;
  private summarySub: Subscription | null = null;

  chartHasData: Record<string, boolean> = {
    engActions: false,
    findingActions: false,
    actionsByIp: false,
    topActors: false,
  };

  // Filter state
  filterActor = '';
  filterAction = '';
  filterResourceType = '';
  filterDateFrom = '';
  filterDateTo = '';
  filterResourceId = '';
  filterEngagement = '';
  filterEngagementName = '';
  filterIpAddress = '';
  private lastSummaryData: AuditSummary | null = null;

  // Dropdown options
  members: TenantMember[] = [];

  // Lookups
  readonly actions = AUDIT_ACTIONS;
  readonly actionLabels = AUDIT_ACTION_LABELS;
  readonly actionColors = AUDIT_ACTION_COLORS;
  readonly resourceTypes = AUDIT_RESOURCE_TYPES;

  // Pagination state
  readonly pageSizeOptions = [25, 50, 100];
  private readonly page$ = new BehaviorSubject<number>(1);
  private readonly pageSize$ = new BehaviorSubject<number>(50);

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly filters$ = new BehaviorSubject<AuditFilters>({});

  readonly vm$ = combineLatest([
    this.refresh$,
    this.filters$,
    this.page$,
    this.pageSize$,
  ]).pipe(
    debounceTime(0),
    switchMap(([, filters, page, pageSize]) =>
      this.auditService.list(filters, page, pageSize).pipe(
        map(resp => ({
          state: 'ready' as ViewState,
          entries: resp.results,
          count: resp.count,
          page: resp.page,
          pageSize: resp.page_size,
          numPages: resp.num_pages,
        })),
        catchError(() => of({
          state: 'error' as ViewState,
          entries: [] as AuditLogListItem[],
          count: 0,
          page: 1,
          pageSize: pageSize,
          numPages: 1,
        })),
      ),
    ),
  );

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
    if (this.showHelp) this.showFilters = false;
  }

  toggleSummary(): void {
    this.showSummary = !this.showSummary;
    if (this.showSummary) {
      this.renderSummaryCharts();
    } else {
      this.destroySummaryCharts();
    }
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
    if (this.showFilters) {
      this.showHelp = false;
      if (this.members.length === 0) {
        this.membersService.list().subscribe(m => {
          this.members = m;
          this.cdr.markForCheck();
        });
      }
    }
  }

  refresh(): void {
    this.refresh$.next();
  }

  applyFilters(): void {
    const f: AuditFilters = {};
    if (this.filterActor) f.actor = this.filterActor;
    if (this.filterAction) f.action = this.filterAction;
    if (this.filterResourceType) f.resource_type = this.filterResourceType;
    if (this.filterDateFrom) f.date_from = this.filterDateFrom;
    if (this.filterDateTo) f.date_to = this.filterDateTo;
    if (this.filterResourceId) f.resource_id = this.filterResourceId;
    if (this.filterEngagement) f.engagement = this.filterEngagement;
    if (this.filterIpAddress) f.ip_address = this.filterIpAddress;
    this.page$.next(1);
    this.filters$.next(f);
  }

  clearFilters(): void {
    this.filterActor = '';
    this.filterAction = '';
    this.filterResourceType = '';
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterResourceId = '';
    this.filterEngagement = '';
    this.filterEngagementName = '';
    this.filterIpAddress = '';
    this.page$.next(1);
    this.filters$.next({});
  }

  clearFilter(field: 'actor' | 'action' | 'resourceType' | 'dateFrom' | 'dateTo' | 'resourceId' | 'engagement' | 'ipAddress'): void {
    const map: Record<string, string> = {
      actor: 'filterActor',
      action: 'filterAction',
      resourceType: 'filterResourceType',
      dateFrom: 'filterDateFrom',
      dateTo: 'filterDateTo',
      resourceId: 'filterResourceId',
      engagement: 'filterEngagement',
      ipAddress: 'filterIpAddress',
    };
    (this as Record<string, unknown>)[map[field]] = '';
    if (field === 'engagement') this.filterEngagementName = '';
    this.applyFilters();
  }

  get hasActiveFilters(): boolean {
    return !!(this.filterActor || this.filterAction || this.filterResourceType
      || this.filterDateFrom || this.filterDateTo || this.filterResourceId
      || this.filterEngagement || this.filterIpAddress);
  }

  get actorEmail(): string {
    if (!this.filterActor) return '';
    return this.members.find(m => m.user.id === this.filterActor)?.user.email ?? this.filterActor;
  }

  getActionLabel(action: string): string {
    return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
  }

  getActionColor(action: string): string {
    return AUDIT_ACTION_COLORS[action as AuditAction] ?? 'secondary';
  }

  // Pagination
  onPageSizeChange(size: number): void {
    this.page$.next(1);
    this.pageSize$.next(size);
  }

  goToPage(page: number): void {
    this.page$.next(page);
  }

  nextPage(vm: ViewModel): void {
    if (vm.page < vm.numPages) {
      this.page$.next(vm.page + 1);
    }
  }

  prevPage(vm: ViewModel): void {
    if (vm.page > 1) {
      this.page$.next(vm.page - 1);
    }
  }

  getPageRange(page: number, numPages: number): (number | null)[] {
    if (numPages <= 7) {
      return Array.from({ length: numPages }, (_, i) => i + 1);
    }

    const pages: (number | null)[] = [];
    pages.push(1);

    if (page > 3) {
      pages.push(null);
    }

    const start = Math.max(2, page - 1);
    const end = Math.min(numPages - 1, page + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (page < numPages - 2) {
      pages.push(null);
    }

    pages.push(numPages);

    return pages;
  }

  // -- Summary charts --

  private renderSummaryCharts(): void {
    this.destroySummaryCharts();
    this.summaryLoading = true;
    this.summarySub = combineLatest([this.refresh$, this.filters$]).pipe(
      debounceTime(0),
      switchMap(([, filters]) => this.auditService.summary(filters).pipe(
        catchError(() => of<AuditSummary>({
          total: 0, by_action: {}, by_resource_type: {}, by_actor: [], by_date: [],
          findings_by_user_eng: { actors: [], engagements: [], matrix: [] },
          disruptive_by_user_eng: { actors: [], engagements: [], matrix: [] },
          engagement_actions_by_user: { actors: [], actions: [], matrix: [] },
          finding_actions_by_user: { actors: [], actions: [], matrix: [] },
          actions_by_ip: { ips: [], counts: [] },
          eng_id_map: {},
        })),
      )),
    ).subscribe(data => {
      this.summaryLoading = false;
      this.prepareChartFlags(data);
      this.cdr.detectChanges();
      this.buildCharts(data);
    });
  }

  private prepareChartFlags(data: AuditSummary): void {
    this.chartHasData = {
      engActions: data.engagement_actions_by_user.actors.length > 0,
      findingActions: data.finding_actions_by_user.actors.length > 0,
      actionsByIp: data.actions_by_ip.ips.length > 0,
      topActors: data.by_actor.length > 0,
    };
  }

  private buildCharts(data: AuditSummary): void {
    this.destroyChartInstances();
    this.lastSummaryData = data;

    const stackedBarOpts = (legendPos: 'bottom' | 'right' = 'bottom') => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 } },
          grid: { color: 'rgba(201,212,255,0.08)' },
        },
        y: {
          stacked: true,
          ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 },
          grid: { color: 'rgba(201,212,255,0.08)' },
        },
      },
      plugins: {
        legend: {
          position: legendPos,
          maxHeight: 100,
          title: { display: true, text: '', padding: { top: 14 } },
          labels: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, padding: 6, boxWidth: 10 },
        },
        tooltip: {
          bodyFont: { family: 'IBM Plex Mono' },
          titleFont: { family: 'IBM Plex Mono' },
        },
      },
    });

    const truncateEmail = (email: string): string => email.split('@')[0];

    const buildStackedBarFromMatrix = (
      canvas: HTMLCanvasElement | undefined,
      xLabels: string[],
      stackLabels: string[],
      matrix: number[][],
    ): Chart<'bar'> | null => {
      if (!canvas || xLabels.length === 0) return null;
      const truncatedX = xLabels.map(truncateEmail);
      const datasets = stackLabels.map((label, i) => ({
        label,
        data: matrix[i] ?? [],
        backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
        borderWidth: 0,
        barThickness: 28,
      }));
      return new Chart(canvas, {
        type: 'bar',
        data: { labels: truncatedX, datasets },
        options: stackedBarOpts(),
      });
    };

    // 1. Actions on engagements by user
    this.engActionsChart = buildStackedBarFromMatrix(
      this.engActionsChartRef?.nativeElement,
      data.engagement_actions_by_user.actors,
      data.engagement_actions_by_user.actions.map(a => AUDIT_ACTION_LABELS[a as AuditAction] ?? a),
      data.engagement_actions_by_user.matrix,
    );
    this.attachChartClickHandler(this.engActionsChart, 'engActions');

    // 4. Actions on findings by user
    this.findingActionsChart = buildStackedBarFromMatrix(
      this.findingActionsChartRef?.nativeElement,
      data.finding_actions_by_user.actors,
      data.finding_actions_by_user.actions.map(a => AUDIT_ACTION_LABELS[a as AuditAction] ?? a),
      data.finding_actions_by_user.matrix,
    );
    this.attachChartClickHandler(this.findingActionsChart, 'findingActions');

    // 5. Actions by IP — vertical bar (top 10)
    if (this.actionsByIpChartRef?.nativeElement && data.actions_by_ip.ips.length > 0) {
      const ips = data.actions_by_ip.ips.slice(0, 10);
      const counts = data.actions_by_ip.counts.slice(0, 10);
      this.actionsByIpChart = new Chart(this.actionsByIpChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels: ips,
          datasets: [{
            label: 'Actions',
            data: counts,
            backgroundColor: ips.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
            borderWidth: 0,
            barThickness: 28,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 } },
              grid: { display: false },
            },
            y: {
              ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 },
              grid: { color: 'rgba(201,212,255,0.08)' },
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
      this.attachChartClickHandler(this.actionsByIpChart, 'actionsByIp');
    }

    // 6. Top Actors — vertical bar
    if (this.actorChartRef?.nativeElement && data.by_actor.length > 0) {
      const labels = data.by_actor.map(a => truncateEmail(a.actor_email));
      const counts = data.by_actor.map(a => a.count);
      this.actorChart = new Chart(this.actorChartRef.nativeElement, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Events',
            data: counts,
            backgroundColor: labels.map((_, i) => CHART_PALETTE[(i + 6) % CHART_PALETTE.length]),
            borderWidth: 0,
            barThickness: 28,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 } },
              grid: { display: false },
            },
            y: {
              ticks: { color: 'rgba(201,212,255,0.7)', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 },
              grid: { color: 'rgba(201,212,255,0.08)' },
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
      this.attachChartClickHandler(this.actorChart, 'topActors');
    }
  }

  private attachChartClickHandler(chart: Chart<'bar'> | null, chartId: string): void {
    if (!chart) return;
    chart.options.onClick = (_event, elements) => {
      if (!elements.length) return;
      const { index: dataIndex, datasetIndex } = elements[0];
      this.ensureMembersLoaded().subscribe(() => {
        this.applyChartFilter(chartId, dataIndex, datasetIndex);
      });
    };
    chart.options.onHover = (event, elements) => {
      const target = (event.native?.target) as HTMLElement | undefined;
      if (target) target.style.cursor = elements.length ? 'pointer' : 'default';
    };
    chart.update('none');
  }

  private applyChartFilter(chartId: string, dataIndex: number, datasetIndex: number): void {
    const data = this.lastSummaryData;
    if (!data) return;

    switch (chartId) {
      case 'engActions': {
        const actorEmail = data.engagement_actions_by_user.actors[dataIndex];
        const action = data.engagement_actions_by_user.actions[datasetIndex];
        this.filterResourceType = 'engagement';
        if (action) this.filterAction = action;
        this.filterActor = this.findActorIdByEmail(actorEmail);
        break;
      }
      case 'findingActions': {
        const actorEmail = data.finding_actions_by_user.actors[dataIndex];
        const action = data.finding_actions_by_user.actions[datasetIndex];
        this.filterResourceType = 'finding';
        if (action) this.filterAction = action;
        this.filterActor = this.findActorIdByEmail(actorEmail);
        break;
      }
      case 'actionsByIp': {
        const ip = data.actions_by_ip.ips[dataIndex];
        if (ip) this.filterIpAddress = ip;
        break;
      }
      case 'topActors': {
        const actorEmail = data.by_actor[dataIndex]?.actor_email;
        if (actorEmail) this.filterActor = this.findActorIdByEmail(actorEmail);
        break;
      }
    }

    this.applyFilters();
    this.cdr.markForCheck();
  }

  private ensureMembersLoaded(): Observable<TenantMember[]> {
    if (this.members.length > 0) return of(this.members);
    return this.membersService.list().pipe(
      map(m => { this.members = m; return m; }),
      catchError(() => of([] as TenantMember[])),
    );
  }

  private findActorIdByEmail(email: string): string {
    const member = this.members.find(m => m.user.email === email);
    return member?.user.id ?? '';
  }

  private destroyChartInstances(): void {
    this.engActionsChart?.destroy(); this.engActionsChart = null;
    this.findingActionsChart?.destroy(); this.findingActionsChart = null;
    this.actionsByIpChart?.destroy(); this.actionsByIpChart = null;
    this.actorChart?.destroy(); this.actorChart = null;
  }

  private destroySummaryCharts(): void {
    this.destroyChartInstances();
    this.summarySub?.unsubscribe(); this.summarySub = null;
  }

  ngOnDestroy(): void {
    this.destroySummaryCharts();
  }
}
