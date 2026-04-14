import { Component, ChangeDetectionStrategy, HostListener, inject, signal, computed } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router } from '@angular/router';
import { BehaviorSubject, combineLatest, switchMap, map, catchError, of, startWith } from 'rxjs';
import { UserProfileService } from '../../services/core/profile/user-profile.service';
import { PermissionService } from '../../services/core/auth/permission.service';
import { DashboardService } from './services/dashboard.service';
import { DashboardLayoutService } from './services/dashboard-layout.service';
import {
  CatalogWidget,
  DashboardAlert,
  DashboardWidget,
  WidgetPlacement,
} from './models/dashboard.model';
import { DashboardStatComponent } from './widgets/dashboard-stat/dashboard-stat.component';
import { DashboardChartComponent } from './widgets/dashboard-chart/dashboard-chart.component';
import { DashboardTableComponent } from './widgets/dashboard-table/dashboard-table.component';
import { WidgetEditOverlayComponent } from './widgets/widget-edit-overlay/widget-edit-overlay.component';
import { WidgetCatalogComponent } from './widget-catalog/widget-catalog.component';

type DashboardState = 'init' | 'ready' | 'error';

interface DashboardVm {
  state: DashboardState;
  widgets: DashboardWidget[];
  alerts: DashboardAlert[];
  error: string;
  isCustomized: boolean;
}

const EMPTY_VM: DashboardVm = {
  state: 'init',
  widgets: [],
  alerts: [],
  error: '',
  isCustomized: false,
};

/** Map group names to their dashboard view parameter. */
const VIEW_GROUP_MAP: Record<string, string> = {
  'Analysts': 'analyst',
  'Collaborators': 'collaborator',
};

const GRID_COLS = 6;

const COL_SPAN_BY_TYPE: Record<string, number> = {
  'stat': 1,
  'chart': 3,
  'table': 6,
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    AsyncPipe,
    DashboardStatComponent,
    DashboardChartComponent,
    DashboardTableComponent,
    WidgetEditOverlayComponent,
    WidgetCatalogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  private readonly profile = inject(UserProfileService);
  private readonly permissions = inject(PermissionService);
  private readonly dashboardService = inject(DashboardService);
  private readonly layoutService = inject(DashboardLayoutService);
  private readonly router = inject(Router);

  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  /** Track dismissed alert IDs for this session */
  private readonly dismissedAlerts = new Set<string>();

  /** Track current widgets for building editLayout on enter */
  private currentWidgets: DashboardWidget[] = [];

  /** Snapshot of editLayout at the time edit mode was entered, for dirty check. */
  private editLayoutSnapshot: string = '';

  // ── Signals (reactive state — drives OnPush re-renders) ───────
  readonly editMode = signal(false);
  readonly saving = signal(false);
  readonly showCatalog = signal(false);
  readonly showHelp = signal(false);
  readonly editLayout = signal<WidgetPlacement[]>([]);
  readonly catalogWidgets = signal<CatalogWidget[]>([]);
  readonly selectedGroup = signal('');
  readonly viewDropdownOpen = signal(false);

  readonly activeWidgetIds = computed(() =>
    new Set(this.editLayout().map(w => w.widget_id)),
  );

  // ── Drag-drop signals (coordinate-based) ───────────────────────
  readonly dragWidgetId = signal<string | null>(null);
  readonly dropTarget = signal<{ col: number; row: number } | null>(null);

  /** Ghost preview: clamped (col, row, colSpan) for the drop target highlight. */
  readonly dropGhost = computed(() => {
    const target = this.dropTarget();
    const dragId = this.dragWidgetId();
    if (!target || !dragId) return null;
    const type = this.getWidgetType(dragId);
    const colSpan = COL_SPAN_BY_TYPE[type] ?? 1;
    const col = Math.min(target.col, GRID_COLS - colSpan);
    return { col, row: target.row, colSpan };
  });

  readonly displayName$ = this.profile.displayName$;
  readonly defaultGroupNames$ = this.permissions.defaultGroupNames$;

  readonly hasAnyFeatureAccess$ = this.permissions.hasAny$(
    'client.view',
    'engagement.view',
    'asset.view',
    'user.view',
    'group.view',
    'finding.view',
  );

  readonly vm$ = combineLatest([this.refresh$, this.defaultGroupNames$]).pipe(
    switchMap(([_, groups]) => {
      // Auto-select first group if not set
      if (!this.selectedGroup() && groups.length > 0) {
        this.selectedGroup.set(groups[0]);
      }

      const view = VIEW_GROUP_MAP[this.selectedGroup()] ?? undefined;

      return this.dashboardService.getDashboard(view).pipe(
        map(resp => this.toVm(resp.widgets, resp.alerts, resp.layout?.customized ?? false)),
        catchError(err => {
          console.error('[dashboard] failed to load', err?.status, err?.error?.detail ?? err?.message);
          return of({
            ...EMPTY_VM,
            state: 'error' as DashboardState,
            error: err?.error?.detail ?? 'Failed to load dashboard',
          });
        }),
        startWith(EMPTY_VM),
      );
    }),
  );

  refresh(): void {
    this.refresh$.next();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.bc-viewSwitcher')) {
      this.viewDropdownOpen.set(false);
    }
  }

  onGroupChange(group: string): void {
    this.selectedGroup.set(group);
    this.viewDropdownOpen.set(false);
    this.refresh$.next();
  }

  toggleHelp(): void {
    this.showHelp.update(v => !v);
  }

  dismissAlert(id: string): void {
    this.dismissedAlerts.add(id);
    this.refresh$.next();
  }

  navigateAlert(url: string): void {
    this.router.navigateByUrl(url);
  }

  // ── Grid helpers ────────────────────────────────────────────────

  colSpanFor(type: string): number {
    return COL_SPAN_BY_TYPE[type] ?? 1;
  }

  getWidgetTitle(widgetId: string): string {
    return this.catalogWidgets().find(c => c.id === widgetId)?.title ?? widgetId;
  }

  getWidgetType(widgetId: string): string {
    return this.catalogWidgets().find(c => c.id === widgetId)?.type ?? 'chart';
  }

  /** Compute the max row in editLayout for grid template sizing. */
  editMaxRow(): number {
    const layout = this.editLayout();
    if (layout.length === 0) return 0;
    return Math.max(...layout.map(w => w.row));
  }

  // ── Edit mode ───────────────────────────────────────────────────

  enterEditMode(): void {
    const view = VIEW_GROUP_MAP[this.selectedGroup()] ?? undefined;
    this.layoutService.getCatalog(view).subscribe(resp => {
      this.catalogWidgets.set(resp.widgets);
    });
    const layout: WidgetPlacement[] = this.currentWidgets.map(w => ({
      widget_id: w.id,
      col: w.col,
      row: w.row,
    }));
    this.editLayout.set(layout);
    this.editLayoutSnapshot = JSON.stringify(layout);
    this.editMode.set(true);
    this.showHelp.set(false);
    this.showCatalog.set(true);
  }

  cancelEditMode(): void {
    this.editMode.set(false);
    this.showCatalog.set(false);
    this.editLayout.set([]);
  }

  saveLayout(): void {
    if (this.saving()) return;

    const current = JSON.stringify(this.editLayout());
    if (current === this.editLayoutSnapshot) {
      this.editMode.set(false);
      this.showCatalog.set(false);
      return;
    }

    this.saving.set(true);
    const view = VIEW_GROUP_MAP[this.selectedGroup()] ?? undefined;
    this.layoutService.saveLayout(this.editLayout(), view).subscribe({
      next: () => {
        this.editMode.set(false);
        this.showCatalog.set(false);
        this.saving.set(false);
        this.refresh();
      },
      error: (err: unknown) => {
        console.error('[dashboard] failed to save layout', err);
        this.saving.set(false);
      },
    });
  }

  resetLayout(): void {
    const view = VIEW_GROUP_MAP[this.selectedGroup()] ?? undefined;
    this.layoutService.resetLayout(view).subscribe(() => {
      this.editMode.set(false);
      this.showCatalog.set(false);
      this.refresh();
    });
  }

  addFromCatalog(cat: CatalogWidget): void {
    if (this.activeWidgetIds().has(cat.id)) return;
    const colSpan = COL_SPAN_BY_TYPE[cat.type] ?? 1;
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

  // ── Drag and drop (coordinate-based) ──────────────────────────

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
    const colSpan = COL_SPAN_BY_TYPE[type] ?? 1;

    // Clamp col so widget doesn't overflow
    const col = Math.min(target.col, GRID_COLS - colSpan);
    const row = target.row;

    // Check if target cells are occupied
    const hasConflict = this.hasOverlap(dragId, col, row, colSpan);

    if (!hasConflict) {
      // Empty space — just move
      this.editLayout.update(layout =>
        layout.map(w => w.widget_id === dragId ? { ...w, col, row } : w),
      );
    } else {
      // Try to slide existing widgets on the same row to make room
      this.editLayout.update(layout => {
        const rowWidgets = layout.filter(w => w.row === row && w.widget_id !== dragId);
        const totalSpan = colSpan + rowWidgets.reduce(
          (sum, w) => sum + (COL_SPAN_BY_TYPE[this.getWidgetType(w.widget_id)] ?? 1), 0,
        );

        if (totalSpan <= GRID_COLS) {
          // Fits — slide others around the dragged widget
          const newPositions = this.slideWidgets(rowWidgets, col, colSpan);
          return layout.map(w => {
            if (w.widget_id === dragId) return { ...w, col, row };
            const slid = newPositions.get(w.widget_id);
            if (slid !== undefined) return { ...w, col: slid };
            return w;
          });
        }

        // Doesn't fit — push everything at row >= target down by 1
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

  /** Check if the drop target highlight should show at a given cell. */
  isDropTarget(col: number, row: number): boolean {
    const target = this.dropTarget();
    if (!target || !this.dragWidgetId()) return false;
    const type = this.getWidgetType(this.dragWidgetId()!);
    const colSpan = COL_SPAN_BY_TYPE[type] ?? 1;
    const clampedCol = Math.min(target.col, GRID_COLS - colSpan);
    return row === target.row && col >= clampedCol && col < clampedCol + colSpan;
  }

  private clearDragState(): void {
    this.dragWidgetId.set(null);
    this.dropTarget.set(null);
  }

  /** Convert mouse event to grid cell coordinates. */
  private cellFromEvent(event: DragEvent): { col: number; row: number } | null {
    const grid = (event.currentTarget as HTMLElement);
    const rect = grid.getBoundingClientRect();
    const style = getComputedStyle(grid);
    const gap = parseFloat(style.columnGap) || 16;

    const relX = event.clientX - rect.left;
    const relY = event.clientY - rect.top;

    const cellWidth = (rect.width - (GRID_COLS - 1) * gap) / GRID_COLS;
    const stepX = cellWidth + gap;
    const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(relX / stepX)));

    // For rows, use the grid's row tracks
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

  /**
   * Slide existing row widgets to make room for a dropped widget.
   * Returns a map of widget_id → new col for each slid widget.
   * The dropped widget occupies [dropCol, dropCol+dropSpan).
   * Other widgets are packed into the remaining space, preserving relative order.
   */
  private slideWidgets(
    rowWidgets: WidgetPlacement[],
    dropCol: number,
    dropSpan: number,
  ): Map<string, number> {
    const result = new Map<string, number>();
    // Sort by current col to preserve relative order
    const sorted = [...rowWidgets].sort((a, b) => a.col - b.col);

    // Collect available slots (columns not occupied by dropped widget)
    const reserved = new Set<number>();
    for (let c = dropCol; c < dropCol + dropSpan; c++) reserved.add(c);

    let cursor = 0;
    for (const w of sorted) {
      const wSpan = COL_SPAN_BY_TYPE[this.getWidgetType(w.widget_id)] ?? 1;
      // Find next position where this widget fits without overlapping reserved cols
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

  /** Remove empty row gaps by remapping row numbers to be contiguous. */
  private compactRows(): void {
    this.editLayout.update(layout => {
      const usedRows = [...new Set(layout.map(w => w.row))].sort((a, b) => a - b);
      const rowMap = new Map<number, number>();
      usedRows.forEach((oldRow, i) => rowMap.set(oldRow, i));
      return layout.map(w => ({ ...w, row: rowMap.get(w.row) ?? w.row }));
    });
  }

  /** Check if placing a widget at (col, row) with colSpan would overlap existing widgets. */
  private hasOverlap(excludeId: string, col: number, row: number, colSpan: number): boolean {
    for (const w of this.editLayout()) {
      if (w.widget_id === excludeId) continue;
      const wSpan = this.colSpanFor(this.getWidgetType(w.widget_id));
      if (w.row === row) {
        // Check horizontal overlap
        if (col < w.col + wSpan && col + colSpan > w.col) {
          return true;
        }
      }
    }
    return false;
  }

  /** Find the next available grid position for a widget with given colSpan. */
  private findNextAvailablePosition(colSpan: number): { col: number; row: number } {
    const occupied = new Set<string>();
    for (const w of this.editLayout()) {
      const wSpan = this.colSpanFor(this.getWidgetType(w.widget_id));
      for (let c = w.col; c < w.col + wSpan; c++) {
        occupied.add(`${c},${w.row}`);
      }
    }

    for (let r = 0; r <= (this.editMaxRow() + 1); r++) {
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
    // Fallback: new row
    return { col: 0, row: this.editMaxRow() + 1 };
  }

  private toVm(widgets: DashboardWidget[], alerts: DashboardAlert[], isCustomized = false): DashboardVm {
    this.currentWidgets = widgets;
    return {
      state: 'ready',
      widgets,
      alerts: alerts.filter(a => !this.dismissedAlerts.has(a.id)),
      error: '',
      isCustomized,
    };
  }
}
