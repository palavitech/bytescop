import {
  Component, ChangeDetectionStrategy, ChangeDetectorRef,
  Input, OnChanges, OnDestroy, SimpleChanges,
  inject, signal, computed,
} from '@angular/core';
import { Subscription, forkJoin, catchError, of } from 'rxjs';
import { FindingsService } from '../../services/findings.service';
import { SowService } from '../../services/sow.service';
import { Finding, FindingSeverity, FindingStatus, FINDING_SEVERITY_LABELS, FINDING_STATUS_LABELS } from '../../models/finding.model';
import { Asset, AssetType, AssetCriticality, ASSET_TYPE_LABELS, ASSET_CRIT_LABELS } from '../../../assets/models/asset.model';
import {
  VizPlacement, VizCatalogWidget, VizChartData, VizWidgetType,
  GRID_COLS, COL_SPAN_BY_TYPE, DEFAULT_CATALOG, DEFAULT_LAYOUT,
} from './visualize.model';
import { VisualizeChartComponent } from './visualize-chart.component';
import { VisualizeCatalogComponent } from './visualize-catalog.component';
import { WidgetEditOverlayComponent } from '../../../../pages/dashboard/widgets/widget-edit-overlay/widget-edit-overlay.component';

const STORAGE_PREFIX = 'bc-viz-layout-';

const SEV_ORDER: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const STAT_ORDER: FindingStatus[] = ['open', 'triage', 'accepted', 'fixed', 'false_positive'];

const SEV_COLORS: Record<string, string> = {
  critical: '#ff5c5c', high: '#ffaa33', medium: '#ffe066',
  low: '#55ccff', info: 'rgba(201,212,255,0.7)',
};

const STAT_COLORS: Record<string, string> = {
  open: '#ff5c5c', triage: '#ffaa33', accepted: '#00ffb3',
  fixed: '#55ccff', false_positive: 'rgba(201,212,255,0.5)',
};

const CRIT_COLORS: Record<string, string> = {
  high: '#ff5c5c', medium: '#ffaa33', low: '#55ccff',
};

const PALETTE = [
  '#00ffb3', '#00b7ff', '#ff5c5c', '#ffaa33', '#ffe066',
  '#a78bfa', '#f472b6', '#34d399', '#38bdf8', '#fb923c',
  '#c084fc', '#4ade80', '#facc15', '#f87171', '#22d3ee',
];

interface VizWidget {
  id: string;
  title: string;
  type: VizWidgetType;
  col: number;
  row: number;
  col_span: number;
  chartData: VizChartData;
}

@Component({
  selector: 'app-visualize',
  standalone: true,
  imports: [VisualizeChartComponent, VisualizeCatalogComponent, WidgetEditOverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visualize.component.html',
  styleUrl: './visualize.component.css',
})
export class VisualizeComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) engagementId!: string;
  @Input() visible = false;

  private readonly findingsService = inject(FindingsService);
  private readonly sowService = inject(SowService);
  private readonly cdr = inject(ChangeDetectorRef);

  private dataSub: Subscription | null = null;
  private findings: Finding[] = [];
  private scope: Asset[] = [];

  /** Pre-computed chart data keyed by widget id */
  private chartDataMap = new Map<string, VizChartData>();

  /** Widgets to render in normal mode */
  widgets: VizWidget[] = [];
  summaryTotal = 0;
  loading = true;

  // ── Signals (edit mode, drag-drop) ───────────────────────────
  readonly editMode = signal(false);
  readonly showCatalog = signal(false);
  readonly editLayout = signal<VizPlacement[]>([]);
  readonly catalogWidgets = signal<VizCatalogWidget[]>(DEFAULT_CATALOG);

  readonly dragWidgetId = signal<string | null>(null);
  readonly dropTarget = signal<{ col: number; row: number } | null>(null);

  readonly activeWidgetIds = computed(() =>
    new Set(this.editLayout().map(w => w.widget_id)),
  );

  readonly dropGhost = computed(() => {
    const target = this.dropTarget();
    const dragId = this.dragWidgetId();
    if (!target || !dragId) return null;
    const type = this.getWidgetType(dragId);
    const colSpan = COL_SPAN_BY_TYPE[type];
    const col = Math.min(target.col, GRID_COLS - colSpan);
    return { col, row: target.row, colSpan };
  });

  private editLayoutSnapshot = '';

  // ── Lifecycle ────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] || changes['engagementId']) {
      if (this.visible && this.engagementId) {
        this.loadData();
      } else {
        this.cleanup();
      }
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  // ── Data loading ─────────────────────────────────────────────

  private loadData(): void {
    this.cleanup();
    this.loading = true;
    this.dataSub = forkJoin({
      findings: this.findingsService.list(this.engagementId).pipe(
        catchError(() => of([] as Finding[])),
      ),
      scope: this.sowService.listScope(this.engagementId).pipe(
        catchError(() => of([] as Asset[])),
      ),
    }).subscribe(({ findings, scope }) => {
      this.findings = findings;
      this.scope = scope;
      this.summaryTotal = findings.length;
      this.loading = false;
      this.computeAllChartData();
      this.buildWidgets();
      this.cdr.markForCheck();
    });
  }

  private cleanup(): void {
    this.dataSub?.unsubscribe();
    this.dataSub = null;
  }

  refresh(): void {
    this.loadData();
  }

  // ── Chart data computation ───────────────────────────────────

  private computeAllChartData(): void {
    const map = new Map<string, VizChartData>();
    map.set('findings_timeline', this.computeTimeline());
    map.set('findings_by_severity', this.computeDoughnut('severity', SEV_ORDER, SEV_COLORS));
    map.set('findings_by_status', this.computeDoughnut('status', STAT_ORDER, STAT_COLORS));
    map.set('findings_by_cwe', this.computeFieldDoughnut('cwe_id'));
    map.set('findings_by_area', this.computeFieldDoughnut('assessment_area'));
    map.set('findings_by_owasp', this.computeFieldDoughnut('owasp_category'));
    map.set('assets_by_severity', this.computeAssetSeverityBar());
    map.set('assets_by_status', this.computeAssetStatusBar());
    map.set('asset_type_dist', this.computeAssetTypeDoughnut());
    map.set('asset_crit_findings', this.computeAssetCritBar());
    this.chartDataMap = map;
  }

  private computeTimeline(): VizChartData {
    const dateMap = new Map<string, Map<string, number>>();
    for (const f of this.findings) {
      const date = (f.created_at || '').slice(0, 10);
      if (!date) continue;
      if (!dateMap.has(date)) dateMap.set(date, new Map());
      const m = dateMap.get(date)!;
      const sev = (f.severity || '').toLowerCase();
      m.set(sev, (m.get(sev) || 0) + 1);
    }

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

    const datasets = SEV_ORDER
      .filter(sev => sortedDates.some(d => (dateMap.get(d)?.get(sev) || 0) > 0))
      .map(sev => ({
        label: FINDING_SEVERITY_LABELS[sev],
        values: sortedDates.map(d => dateMap.get(d)?.get(sev) || 0),
        color: SEV_COLORS[sev],
      }));

    return { chart_type: 'bar', labels: sortedDates, datasets, stacked: true };
  }

  private computeDoughnut(
    key: 'severity' | 'status',
    order: string[],
    colors: Record<string, string>,
  ): VizChartData {
    const m = new Map<string, number>();
    for (const f of this.findings) {
      const v = (f[key] || '').toLowerCase();
      m.set(v, (m.get(v) || 0) + 1);
    }
    const filtered = order.filter(k => (m.get(k) || 0) > 0);
    const pretty = key === 'severity' ? FINDING_SEVERITY_LABELS : FINDING_STATUS_LABELS;
    return {
      chart_type: 'doughnut',
      labels: filtered.map(k => pretty[k as keyof typeof pretty] ?? k),
      values: filtered.map(k => m.get(k)!),
      colors: filtered.map(k => colors[k]),
    };
  }

  private computeFieldDoughnut(field: keyof Finding): VizChartData {
    const m = new Map<string, number>();
    for (const f of this.findings) {
      const v = (f[field] as string || '').trim();
      if (!v) continue;
      m.set(v, (m.get(v) || 0) + 1);
    }
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      chart_type: 'doughnut',
      labels: sorted.map(([k]) => k),
      values: sorted.map(([, v]) => v),
      colors: sorted.map((_, i) => PALETTE[i % PALETTE.length]),
    };
  }

  private computeAssetSeverityBar(): VizChartData {
    const assetMap = new Map<string, Map<string, number>>();
    for (const f of this.findings) {
      const asset = f.asset_name || 'Unlinked';
      const sev = (f.severity || '').toLowerCase();
      if (!assetMap.has(asset)) assetMap.set(asset, new Map());
      assetMap.get(asset)!.set(sev, (assetMap.get(asset)!.get(sev) || 0) + 1);
    }
    const sorted = [...assetMap.entries()]
      .map(([name, m]) => ({ name, total: [...m.values()].reduce((a, b) => a + b, 0), m }))
      .sort((a, b) => b.total - a.total);

    const labels = sorted.map(a => a.name);
    const datasets = SEV_ORDER
      .filter(sev => sorted.some(a => (a.m.get(sev) || 0) > 0))
      .map(sev => ({
        label: FINDING_SEVERITY_LABELS[sev],
        values: sorted.map(a => a.m.get(sev) || 0),
        color: SEV_COLORS[sev],
      }));

    return { chart_type: 'bar', labels, datasets, stacked: true };
  }

  private computeAssetStatusBar(): VizChartData {
    const assetMap = new Map<string, Map<string, number>>();
    for (const f of this.findings) {
      const asset = f.asset_name || 'Unlinked';
      const stat = (f.status || '').toLowerCase();
      if (!assetMap.has(asset)) assetMap.set(asset, new Map());
      assetMap.get(asset)!.set(stat, (assetMap.get(asset)!.get(stat) || 0) + 1);
    }
    const sorted = [...assetMap.entries()]
      .map(([name, m]) => ({ name, total: [...m.values()].reduce((a, b) => a + b, 0), m }))
      .sort((a, b) => b.total - a.total);

    const labels = sorted.map(a => a.name);
    const datasets = STAT_ORDER
      .filter(stat => sorted.some(a => (a.m.get(stat) || 0) > 0))
      .map(stat => ({
        label: FINDING_STATUS_LABELS[stat],
        values: sorted.map(a => a.m.get(stat) || 0),
        color: STAT_COLORS[stat],
      }));

    return { chart_type: 'bar', labels, datasets, stacked: true };
  }

  private computeAssetTypeDoughnut(): VizChartData {
    const m = new Map<string, number>();
    for (const a of this.scope) {
      const t = a.asset_type || '';
      if (!t) continue;
      m.set(t, (m.get(t) || 0) + 1);
    }
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      chart_type: 'doughnut',
      labels: sorted.map(([k]) => ASSET_TYPE_LABELS[k as AssetType] ?? k),
      values: sorted.map(([, v]) => v),
      colors: sorted.map((_, i) => PALETTE[i % PALETTE.length]),
    };
  }

  private computeAssetCritBar(): VizChartData {
    const critOrder: AssetCriticality[] = ['high', 'medium', 'low'];
    const critAssetIds = new Map<string, Set<string>>();
    for (const crit of critOrder) critAssetIds.set(crit, new Set());
    for (const a of this.scope) {
      const crit = (a.criticality || '').toLowerCase();
      critAssetIds.get(crit)?.add(a.id);
    }

    const critCounts = new Map<string, number>();
    for (const crit of critOrder) critCounts.set(crit, 0);
    for (const f of this.findings) {
      if (!f.asset_id) continue;
      for (const crit of critOrder) {
        if (critAssetIds.get(crit)?.has(f.asset_id)) {
          critCounts.set(crit, (critCounts.get(crit) || 0) + 1);
          break;
        }
      }
    }

    return {
      chart_type: 'bar',
      labels: critOrder.map(c => ASSET_CRIT_LABELS[c]),
      values: critOrder.map(c => critCounts.get(c) || 0),
      colors: critOrder.map(c => CRIT_COLORS[c]),
    };
  }

  // ── Build widgets for render ─────────────────────────────────

  private buildWidgets(): void {
    const layout = this.loadLayout();
    this.widgets = layout
      .filter(p => this.chartDataMap.has(p.widget_id))
      .map(p => {
        const cat = DEFAULT_CATALOG.find(c => c.id === p.widget_id)!;
        return {
          id: p.widget_id,
          title: cat.title,
          type: cat.type,
          col: p.col,
          row: p.row,
          col_span: cat.col_span,
          chartData: this.chartDataMap.get(p.widget_id)!,
        };
      });
  }

  // ── Layout persistence (localStorage) ────────────────────────

  private storageKey(): string {
    return STORAGE_PREFIX + this.engagementId;
  }

  private loadLayout(): VizPlacement[] {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (raw) {
        const parsed = JSON.parse(raw) as VizPlacement[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* fall through */ }
    return [...DEFAULT_LAYOUT];
  }

  private persistLayout(layout: VizPlacement[]): void {
    localStorage.setItem(this.storageKey(), JSON.stringify(layout));
  }

  // ── Grid helpers ─────────────────────────────────────────────

  colSpanFor(type: VizWidgetType): number {
    return COL_SPAN_BY_TYPE[type];
  }

  getWidgetTitle(widgetId: string): string {
    return DEFAULT_CATALOG.find(c => c.id === widgetId)?.title ?? widgetId;
  }

  getWidgetType(widgetId: string): VizWidgetType {
    return DEFAULT_CATALOG.find(c => c.id === widgetId)?.type ?? 'chart';
  }

  editMaxRow(): number {
    const layout = this.editLayout();
    if (layout.length === 0) return 0;
    return Math.max(...layout.map(w => w.row));
  }

  // ── Edit mode ────────────────────────────────────────────────

  enterEditMode(): void {
    const layout: VizPlacement[] = this.widgets.map(w => ({
      widget_id: w.id,
      col: w.col,
      row: w.row,
    }));
    this.editLayout.set(layout);
    this.editLayoutSnapshot = JSON.stringify(layout);
    this.editMode.set(true);
    this.showCatalog.set(true);
  }

  cancelEditMode(): void {
    this.editMode.set(false);
    this.showCatalog.set(false);
    this.editLayout.set([]);
  }

  saveLayout(): void {
    const current = this.editLayout();
    const currentJson = JSON.stringify(current);
    if (currentJson !== this.editLayoutSnapshot) {
      this.persistLayout(current);
      this.buildWidgets();
    }
    this.editMode.set(false);
    this.showCatalog.set(false);
  }

  resetLayout(): void {
    localStorage.removeItem(this.storageKey());
    this.buildWidgets();
    this.editMode.set(false);
    this.showCatalog.set(false);
  }

  addFromCatalog(cat: VizCatalogWidget): void {
    if (this.activeWidgetIds().has(cat.id)) return;
    const colSpan = COL_SPAN_BY_TYPE[cat.type];
    const pos = this.findNextAvailablePosition(colSpan);
    this.editLayout.update(layout => [
      ...layout,
      { widget_id: cat.id, col: pos.col, row: pos.row },
    ]);
  }

  removeWidget(widgetId: string): void {
    this.editLayout.update(layout => layout.filter(w => w.widget_id !== widgetId));
    this.compactRows();
  }

  // ── Drag and drop ────────────────────────────────────────────

  onDragStart(widgetId: string, event: DragEvent): void {
    this.dragWidgetId.set(widgetId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', widgetId);
    }
  }

  onGridDragOver(event: DragEvent): void {
    if (this.dragWidgetId() === null) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const cell = this.cellFromEvent(event);
    if (cell) {
      this.dropTarget.set(cell);
    }
  }

  onGridDrop(event: DragEvent): void {
    event.preventDefault();
    const dragId = this.dragWidgetId();
    const target = this.dropTarget();

    if (!dragId || !target) {
      this.clearDragState();
      return;
    }

    const type = this.getWidgetType(dragId);
    const colSpan = COL_SPAN_BY_TYPE[type];
    const col = Math.min(target.col, GRID_COLS - colSpan);
    const row = target.row;

    const hasConflict = this.hasOverlap(dragId, col, row, colSpan);

    if (!hasConflict) {
      this.editLayout.update(layout =>
        layout.map(w => w.widget_id === dragId ? { ...w, col, row } : w),
      );
    } else {
      this.editLayout.update(layout => {
        const rowWidgets = layout.filter(w => w.row === row && w.widget_id !== dragId);
        const totalSpan = colSpan + rowWidgets.reduce(
          (sum, w) => sum + COL_SPAN_BY_TYPE[this.getWidgetType(w.widget_id)], 0,
        );

        if (totalSpan <= GRID_COLS) {
          const newPositions = this.slideWidgets(rowWidgets, col, colSpan);
          return layout.map(w => {
            if (w.widget_id === dragId) return { ...w, col, row };
            const slid = newPositions.get(w.widget_id);
            if (slid !== undefined) return { ...w, col: slid };
            return w;
          });
        }

        return layout.map(w => {
          if (w.widget_id === dragId) return { ...w, col, row };
          if (w.row >= row) return { ...w, row: w.row + 1 };
          return w;
        });
      });
    }

    this.compactRows();
    this.clearDragState();
  }

  onDragEnd(): void {
    this.clearDragState();
  }

  private clearDragState(): void {
    this.dragWidgetId.set(null);
    this.dropTarget.set(null);
  }

  private cellFromEvent(event: DragEvent): { col: number; row: number } | null {
    const grid = event.currentTarget as HTMLElement;
    const rect = grid.getBoundingClientRect();
    const style = getComputedStyle(grid);
    const gap = parseFloat(style.columnGap) || 16;

    const relX = event.clientX - rect.left;
    const relY = event.clientY - rect.top;

    const cellWidth = (rect.width - (GRID_COLS - 1) * gap) / GRID_COLS;
    const stepX = cellWidth + gap;
    const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(relX / stepX)));

    const rowTracks = style.gridTemplateRows.split(/\s+/);
    let accY = 0;
    let row = 0;
    const rowGap = parseFloat(style.rowGap) || gap;
    for (let r = 0; r < rowTracks.length; r++) {
      const trackHeight = parseFloat(rowTracks[r]) || 0;
      if (relY < accY + trackHeight + rowGap / 2) {
        row = r;
        break;
      }
      accY += trackHeight + rowGap;
      row = r + 1;
    }

    return { col, row };
  }

  private slideWidgets(
    rowWidgets: VizPlacement[],
    dropCol: number,
    dropSpan: number,
  ): Map<string, number> {
    const result = new Map<string, number>();
    const sorted = [...rowWidgets].sort((a, b) => a.col - b.col);
    const reserved = new Set<number>();
    for (let c = dropCol; c < dropCol + dropSpan; c++) reserved.add(c);

    let cursor = 0;
    for (const w of sorted) {
      const wSpan = COL_SPAN_BY_TYPE[this.getWidgetType(w.widget_id)];
      while (cursor + wSpan <= GRID_COLS) {
        let blocked = false;
        for (let c = cursor; c < cursor + wSpan; c++) {
          if (reserved.has(c)) { blocked = true; break; }
        }
        if (!blocked) break;
        cursor++;
      }
      result.set(w.widget_id, cursor);
      cursor += wSpan;
    }
    return result;
  }

  private compactRows(): void {
    this.editLayout.update(layout => {
      const usedRows = [...new Set(layout.map(w => w.row))].sort((a, b) => a - b);
      const rowMap = new Map<number, number>();
      usedRows.forEach((oldRow, i) => rowMap.set(oldRow, i));
      return layout.map(w => ({ ...w, row: rowMap.get(w.row) ?? w.row }));
    });
  }

  private hasOverlap(excludeId: string, col: number, row: number, colSpan: number): boolean {
    for (const w of this.editLayout()) {
      if (w.widget_id === excludeId) continue;
      const wSpan = COL_SPAN_BY_TYPE[this.getWidgetType(w.widget_id)];
      if (w.row === row) {
        if (col < w.col + wSpan && col + colSpan > w.col) {
          return true;
        }
      }
    }
    return false;
  }

  private findNextAvailablePosition(colSpan: number): { col: number; row: number } {
    const occupied = new Set<string>();
    for (const w of this.editLayout()) {
      const wSpan = COL_SPAN_BY_TYPE[this.getWidgetType(w.widget_id)];
      for (let c = w.col; c < w.col + wSpan; c++) {
        occupied.add(`${c},${w.row}`);
      }
    }

    for (let r = 0; r <= this.editMaxRow() + 1; r++) {
      for (let c = 0; c <= GRID_COLS - colSpan; c++) {
        let fits = true;
        for (let dc = 0; dc < colSpan; dc++) {
          if (occupied.has(`${c + dc},${r}`)) {
            fits = false;
            break;
          }
        }
        if (fits) return { col: c, row: r };
      }
    }
    return { col: 0, row: this.editMaxRow() + 1 };
  }
}
