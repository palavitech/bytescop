import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError, BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

import { DashboardComponent } from './dashboard.component';
import { UserProfileService } from '../../services/core/profile/user-profile.service';
import { PermissionService } from '../../services/core/auth/permission.service';
import { DashboardService } from './services/dashboard.service';
import { DashboardLayoutService } from './services/dashboard-layout.service';
import { DashboardWidget, DashboardAlert, CatalogWidget } from './models/dashboard.model';

// Stub child components to avoid their templates/dependencies
import { Component, Input } from '@angular/core';

@Component({ selector: 'app-dashboard-stat', standalone: true, template: '' })
class MockDashboardStatComponent {
  @Input() widget!: DashboardWidget;
}

@Component({ selector: 'app-dashboard-chart', standalone: true, template: '' })
class MockDashboardChartComponent {
  @Input() widget!: DashboardWidget;
}

@Component({ selector: 'app-dashboard-table', standalone: true, template: '' })
class MockDashboardTableComponent {
  @Input() widget!: DashboardWidget;
}

const STAT_WIDGET: DashboardWidget = {
  id: 'active_engagements',
  title: 'Active Engagements',
  type: 'stat',
  col: 0,
  row: 0,
  col_span: 1,
  data: { value: 5 },
};

const CHART_WIDGET: DashboardWidget = {
  id: 'severity_chart',
  title: 'Severity Breakdown',
  type: 'chart',
  col: 0,
  row: 1,
  col_span: 3,
  data: { chart_type: 'doughnut', labels: ['High', 'Low'], values: [3, 7], colors: ['red', 'green'] },
};

const TABLE_WIDGET: DashboardWidget = {
  id: 'recent_findings',
  title: 'Recent Findings',
  type: 'table',
  col: 0,
  row: 2,
  col_span: 6,
  data: { columns: ['Title', 'Severity'], rows: [['XSS', 'High']] },
};

const MOCK_ALERT: DashboardAlert = {
  id: 'alert-1',
  level: 'warning',
  title: 'Action Required',
  message: 'You have overdue findings.',
  action_label: 'View',
  action_url: '/engagements',
};

const MOCK_ALERT_2: DashboardAlert = {
  id: 'alert-2',
  level: 'danger',
  title: 'Critical',
  message: 'Engagement expired.',
  action_label: 'Fix',
  action_url: '/engagements/123',
};

const ALL_WIDGETS: DashboardWidget[] = [STAT_WIDGET, CHART_WIDGET, TABLE_WIDGET];

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let dashboardService: jasmine.SpyObj<DashboardService>;
  let layoutService: jasmine.SpyObj<DashboardLayoutService>;
  let router: jasmine.SpyObj<Router>;
  let displayName$: BehaviorSubject<string>;
  let hasAny$: BehaviorSubject<boolean>;
  let defaultGroupNames$: BehaviorSubject<string[]>;

  beforeEach(async () => {
    dashboardService = jasmine.createSpyObj('DashboardService', ['getDashboard']);
    dashboardService.getDashboard.and.returnValue(of({ widgets: ALL_WIDGETS, alerts: [MOCK_ALERT, MOCK_ALERT_2] }));

    layoutService = jasmine.createSpyObj('DashboardLayoutService', ['getCatalog', 'getLayout', 'saveLayout', 'resetLayout']);
    layoutService.getCatalog.and.returnValue(of({ widgets: [] }));
    layoutService.saveLayout.and.returnValue(of({ view: 'default', widgets: [], customized: true }));
    layoutService.resetLayout.and.returnValue(of(undefined));

    router = jasmine.createSpyObj('Router', ['navigateByUrl']);

    displayName$ = new BehaviorSubject<string>('Jane Doe');
    hasAny$ = new BehaviorSubject<boolean>(true);
    defaultGroupNames$ = new BehaviorSubject<string[]>(['Analysts']);

    const profileSpy = jasmine.createSpyObj('UserProfileService', [], {
      displayName$: displayName$.asObservable(),
    });

    const permSpy = jasmine.createSpyObj('PermissionService', ['hasAny$'], {
      defaultGroupNames$: defaultGroupNames$.asObservable(),
    });
    permSpy.hasAny$.and.returnValue(hasAny$.asObservable());

    await TestBed.configureTestingModule({
      imports: [
        DashboardComponent,
        MockDashboardStatComponent,
        MockDashboardChartComponent,
        MockDashboardTableComponent,
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UserProfileService, useValue: profileSpy },
        { provide: PermissionService, useValue: permSpy },
        { provide: DashboardService, useValue: dashboardService },
        { provide: DashboardLayoutService, useValue: layoutService },
        { provide: Router, useValue: router },
      ],
    })
      .overrideComponent(DashboardComponent, {
        remove: {
          imports: [
            (await import('./widgets/dashboard-stat/dashboard-stat.component')).DashboardStatComponent,
            (await import('./widgets/dashboard-chart/dashboard-chart.component')).DashboardChartComponent,
            (await import('./widgets/dashboard-table/dashboard-table.component')).DashboardTableComponent,
          ],
        },
        add: {
          imports: [MockDashboardStatComponent, MockDashboardChartComponent, MockDashboardTableComponent],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('exposes displayName$ from profile service', (done) => {
    component.displayName$.subscribe(name => {
      expect(name).toBe('Jane Doe');
      done();
    });
  });

  it('calls getDashboard on init', () => {
    expect(dashboardService.getDashboard).toHaveBeenCalled();
  });

  it('vm$ emits ready state with widgets', (done) => {
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        expect(vm.widgets).toEqual(ALL_WIDGETS);
        expect(vm.error).toBe('');
        done();
      }
    });
  });

  it('vm$ emits alerts from API response', (done) => {
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        expect(vm.alerts.length).toBe(2);
        expect(vm.alerts[0].id).toBe('alert-1');
        expect(vm.alerts[1].id).toBe('alert-2');
        done();
      }
    });
  });

  it('vm$ emits error state on API failure', (done) => {
    dashboardService.getDashboard.and.returnValue(
      throwError(() => ({ error: { detail: 'Server error' } })),
    );

    component.refresh();

    component.vm$.subscribe(vm => {
      if (vm.state === 'error') {
        expect(vm.error).toBe('Server error');
        expect(vm.widgets).toEqual([]);
        done();
      }
    });
  });

  it('vm$ emits generic error when no detail', (done) => {
    dashboardService.getDashboard.and.returnValue(
      throwError(() => ({ error: {} })),
    );

    component.refresh();

    component.vm$.subscribe(vm => {
      if (vm.state === 'error') {
        expect(vm.error).toBe('Failed to load dashboard');
        done();
      }
    });
  });

  it('vm$ emits generic error when error object is null', (done) => {
    dashboardService.getDashboard.and.returnValue(
      throwError(() => null),
    );

    component.refresh();

    component.vm$.subscribe(vm => {
      if (vm.state === 'error') {
        expect(vm.error).toBe('Failed to load dashboard');
        done();
      }
    });
  });

  it('refresh() triggers a new API call', () => {
    dashboardService.getDashboard.calls.reset();

    component.refresh();

    expect(dashboardService.getDashboard).toHaveBeenCalledTimes(1);
  });

  it('vm$ starts with init state before data arrives', (done) => {
    let firstEmit = true;
    dashboardService.getDashboard.and.returnValue(of({ widgets: ALL_WIDGETS, alerts: [] }));

    component.refresh();

    component.vm$.subscribe(vm => {
      if (firstEmit) {
        expect(vm.state).toBe('init');
        firstEmit = false;
        done();
      }
    });
  });

  // --- dismissAlert ---

  it('dismissAlert() hides the alert from vm$', (done) => {
    let ready = false;
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready' && !ready) {
        ready = true;
        expect(vm.alerts.length).toBe(2);

        component.dismissAlert('alert-1');

        component.vm$.subscribe(vm2 => {
          if (vm2.state === 'ready') {
            expect(vm2.alerts.length).toBe(1);
            expect(vm2.alerts[0].id).toBe('alert-2');
            done();
          }
        });
      }
    });
  });

  it('dismissAlert() persists across refreshes within the session', (done) => {
    component.dismissAlert('alert-1');

    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        const alertIds = vm.alerts.map(a => a.id);
        expect(alertIds).not.toContain('alert-1');
        expect(alertIds).toContain('alert-2');
        done();
      }
    });
  });

  // --- navigateAlert ---

  it('navigateAlert() navigates to the given URL', () => {
    component.navigateAlert('/engagements');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/engagements');
  });

  it('navigateAlert() navigates to a nested URL', () => {
    component.navigateAlert('/engagements/123');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/engagements/123');
  });

  // --- Refresh token missing error (bug reproduction) ---

  it('shows "Unable to load dashboard" with "Refresh token is required." when refresh cookie is gone', (done) => {
    const refreshErr = {
      error: { detail: 'Refresh token is required.', code: 'token_missing' },
      status: 400,
    };
    dashboardService.getDashboard.and.returnValue(
      throwError(() => refreshErr),
    );

    component.refresh();
    fixture.detectChanges();

    component.vm$.subscribe(vm => {
      if (vm.state === 'error') {
        expect(vm.error).toBe('Refresh token is required.');

        fixture.detectChanges();
        const heading = fixture.nativeElement.querySelector('.bc-h2');
        expect(heading?.textContent).toContain('Unable to load dashboard');

        const sub = fixture.nativeElement.querySelector('.bc-cardInner .bc-sub');
        expect(sub?.textContent).toContain('Refresh token is required.');

        const retryBtn = fixture.nativeElement.querySelector('.bc-btnPrimary');
        expect(retryBtn?.textContent).toContain('Retry');

        done();
      }
    });
  });

  // --- Template rendering ---

  it('renders dashboard title when has access', () => {
    const h1 = fixture.nativeElement.querySelector('.bc-h1');
    expect(h1?.textContent).toContain('DASHBOARD');
  });

  it('renders welcome message with display name', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const sub = fixture.nativeElement.querySelector('.bc-sub');
    expect(sub?.textContent).toContain('Jane Doe');
  });

  it('renders no access message when no permissions', () => {
    hasAny$.next(false);
    fixture.detectChanges();

    const noAccess = fixture.nativeElement.querySelector('.bc-h1');
    expect(noAccess?.textContent).toContain('No Access');
  });

  it('renders refresh button', () => {
    const buttons = fixture.nativeElement.querySelectorAll('.bc-iconBtn');
    const refreshBtn = Array.from(buttons).find(
      (btn: any) => btn.textContent.includes('Refresh'),
    );
    expect(refreshBtn).toBeTruthy();
  });

  // --- Branch: VIEW_GROUP_MAP → undefined when group is not analyst ---

  it('passes undefined view for non-analyst group', () => {
    defaultGroupNames$.next(['Tenant Managers']);
    dashboardService.getDashboard.calls.reset();

    component.selectedGroup.set('Tenant Managers');
    component.refresh();

    expect(dashboardService.getDashboard).toHaveBeenCalledWith(undefined);
  });

  // --- Branch: onDocumentClick closes dropdown ---

  it('onDocumentClick() closes viewDropdownOpen when click is outside', () => {
    component.viewDropdownOpen.set(true);

    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', {
      value: document.createElement('div'),
    });

    component.onDocumentClick(event);

    expect(component.viewDropdownOpen()).toBeFalse();
  });

  // --- Grid helpers (coordinate-based) ---

  it('colSpanFor returns correct column span for each widget type', () => {
    expect(component.colSpanFor('stat')).toBe(1);
    expect(component.colSpanFor('chart')).toBe(3);
    expect(component.colSpanFor('table')).toBe(6);
  });

  it('colSpanFor returns 1 for unknown type', () => {
    expect(component.colSpanFor('unknown')).toBe(1);
  });

  // --- toggleHelp ---

  it('toggleHelp() toggles showHelp signal', () => {
    expect(component.showHelp()).toBeFalse();
    component.toggleHelp();
    expect(component.showHelp()).toBeTrue();
    component.toggleHelp();
    expect(component.showHelp()).toBeFalse();
  });

  // --- onGroupChange ---

  it('onGroupChange() sets selectedGroup and closes dropdown', () => {
    component.viewDropdownOpen.set(true);
    component.onGroupChange('Collaborators');
    expect(component.selectedGroup()).toBe('Collaborators');
    expect(component.viewDropdownOpen()).toBeFalse();
  });

  // --- Edit mode ---

  it('enterEditMode() sets editMode and fetches catalog', () => {
    component.enterEditMode();
    expect(component.editMode()).toBeTrue();
    expect(component.showCatalog()).toBeTrue();
    expect(component.showHelp()).toBeFalse();
    expect(layoutService.getCatalog).toHaveBeenCalled();
  });

  it('enterEditMode() builds editLayout from currentWidgets', (done) => {
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        component.enterEditMode();
        const layout = component.editLayout();
        expect(layout.length).toBe(3);
        expect(layout[0].widget_id).toBe('active_engagements');
        done();
      }
    });
  });

  it('cancelEditMode() resets edit state', () => {
    component.enterEditMode();
    component.cancelEditMode();
    expect(component.editMode()).toBeFalse();
    expect(component.showCatalog()).toBeFalse();
    expect(component.editLayout().length).toBe(0);
  });

  it('saveLayout() exits edit mode when layout unchanged', (done) => {
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        component.enterEditMode();
        // Layout hasn't changed, so save should just exit
        component.saveLayout();
        expect(component.editMode()).toBeFalse();
        expect(layoutService.saveLayout).not.toHaveBeenCalled();
        done();
      }
    });
  });

  it('saveLayout() calls API when layout changed', (done) => {
    let called = false;
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready' && !called) {
        called = true;
        component.enterEditMode();
        // Modify layout
        component.editLayout.update(l => [...l, { widget_id: 'new_widget', col: 0, row: 5 }]);
        component.saveLayout();
        expect(layoutService.saveLayout).toHaveBeenCalled();
        expect(component.saving()).toBeFalse(); // completes synchronously in test
        done();
      }
    });
  });

  it('saveLayout() does nothing if already saving', (done) => {
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        component.enterEditMode();
        component.editLayout.update(l => [...l, { widget_id: 'x', col: 0, row: 5 }]);
        component.saving.set(true);
        component.saveLayout();
        expect(layoutService.saveLayout).not.toHaveBeenCalled();
        done();
      }
    });
  });

  it('saveLayout() resets saving on error', (done) => {
    layoutService.saveLayout.and.returnValue(throwError(() => new Error('fail')));
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        component.enterEditMode();
        component.editLayout.update(l => [...l, { widget_id: 'x', col: 0, row: 5 }]);
        component.saveLayout();
        expect(component.saving()).toBeFalse();
        done();
      }
    });
  });

  it('resetLayout() calls API and exits edit mode', () => {
    component.enterEditMode();
    component.resetLayout();
    expect(layoutService.resetLayout).toHaveBeenCalled();
    expect(component.editMode()).toBeFalse();
  });

  // --- addFromCatalog ---

  it('addFromCatalog() adds a widget to editLayout', (done) => {
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        component.enterEditMode();
        const cat: CatalogWidget = {
          id: 'new_stat',
          title: 'New Stat',
          type: 'stat',
          col_span: 1,
          description: 'A new stat',
        };
        component.addFromCatalog(cat);
        expect(component.editLayout().find(w => w.widget_id === 'new_stat')).toBeTruthy();
        done();
      }
    });
  });

  it('addFromCatalog() does not add duplicate widget', (done) => {
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        component.enterEditMode();
        const cat: CatalogWidget = {
          id: 'active_engagements',
          title: 'Active Engagements',
          type: 'stat',
          col_span: 1,
          description: '',
        };
        const before = component.editLayout().length;
        component.addFromCatalog(cat);
        expect(component.editLayout().length).toBe(before);
        done();
      }
    });
  });

  // --- removeWidget ---

  it('removeWidget() removes a widget from editLayout', (done) => {
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        component.enterEditMode();
        const before = component.editLayout().length;
        component.removeWidget('active_engagements');
        expect(component.editLayout().length).toBe(before - 1);
        expect(component.editLayout().find(w => w.widget_id === 'active_engagements')).toBeUndefined();
        done();
      }
    });
  });

  // --- Grid helpers ---

  it('getWidgetTitle() returns title from catalog', () => {
    component.catalogWidgets.set([
      { id: 'test', title: 'Test Widget', type: 'stat', col_span: 1, description: '' },
    ]);
    expect(component.getWidgetTitle('test')).toBe('Test Widget');
  });

  it('getWidgetTitle() returns id as fallback', () => {
    component.catalogWidgets.set([]);
    expect(component.getWidgetTitle('unknown')).toBe('unknown');
  });

  it('getWidgetType() returns type from catalog', () => {
    component.catalogWidgets.set([
      { id: 'test', title: 'Test', type: 'table', col_span: 6, description: '' },
    ]);
    expect(component.getWidgetType('test')).toBe('table');
  });

  it('getWidgetType() returns chart as fallback', () => {
    component.catalogWidgets.set([]);
    expect(component.getWidgetType('unknown')).toBe('chart');
  });

  it('editMaxRow() returns 0 for empty layout', () => {
    component.editLayout.set([]);
    expect(component.editMaxRow()).toBe(0);
  });

  it('editMaxRow() returns max row number', () => {
    component.editLayout.set([
      { widget_id: 'a', col: 0, row: 0 },
      { widget_id: 'b', col: 0, row: 3 },
      { widget_id: 'c', col: 0, row: 1 },
    ]);
    expect(component.editMaxRow()).toBe(3);
  });

  // --- Drag and drop ---

  it('onDragStart() sets dragWidgetId', () => {
    const event = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
    component.onDragStart('severity_chart', event);
    expect(component.dragWidgetId()).toBe('severity_chart');
  });

  it('onDragEnd() clears drag state', () => {
    component.dragWidgetId.set('test');
    component.dropTarget.set({ col: 1, row: 1 });
    component.onDragEnd();
    expect(component.dragWidgetId()).toBeNull();
    expect(component.dropTarget()).toBeNull();
  });

  it('onGridDragOver() does nothing when no drag in progress', () => {
    const event = new DragEvent('dragover');
    spyOn(event, 'preventDefault');
    component.onGridDragOver(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('onGridDrop() clears drag state when no dragId', () => {
    const event = new DragEvent('drop');
    spyOn(event, 'preventDefault');
    component.onGridDrop(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.dragWidgetId()).toBeNull();
  });

  it('onGridDrop() moves widget to target position', (done) => {
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        component.enterEditMode();
        component.catalogWidgets.set([
          { id: 'active_engagements', title: 'AE', type: 'stat', col_span: 1, description: '' },
          { id: 'severity_chart', title: 'SC', type: 'chart', col_span: 3, description: '' },
          { id: 'recent_findings', title: 'RF', type: 'table', col_span: 6, description: '' },
        ]);

        component.dragWidgetId.set('active_engagements');
        component.dropTarget.set({ col: 3, row: 0 });

        const event = new DragEvent('drop');
        spyOn(event, 'preventDefault');
        component.onGridDrop(event);

        const widget = component.editLayout().find(w => w.widget_id === 'active_engagements');
        expect(widget).toBeTruthy();
        expect(widget!.col).toBe(3);
        expect(component.dragWidgetId()).toBeNull();
        done();
      }
    });
  });

  it('isDropTarget() returns false when no drag in progress', () => {
    expect(component.isDropTarget(0, 0)).toBeFalse();
  });

  it('isDropTarget() returns true for target cell', () => {
    component.catalogWidgets.set([
      { id: 'test', title: 'T', type: 'stat', col_span: 1, description: '' },
    ]);
    component.dragWidgetId.set('test');
    component.dropTarget.set({ col: 2, row: 1 });
    expect(component.isDropTarget(2, 1)).toBeTrue();
    expect(component.isDropTarget(3, 1)).toBeFalse();
  });

  // --- dropGhost computed ---

  it('dropGhost returns null when no drag in progress', () => {
    expect(component.dropGhost()).toBeNull();
  });

  it('dropGhost returns clamped position', () => {
    component.catalogWidgets.set([
      { id: 'tbl', title: 'T', type: 'table', col_span: 6, description: '' },
    ]);
    component.dragWidgetId.set('tbl');
    component.dropTarget.set({ col: 3, row: 0 });
    const ghost = component.dropGhost();
    expect(ghost).toBeTruthy();
    expect(ghost!.col).toBe(0); // clamped: 6-wide table can only start at col 0
    expect(ghost!.colSpan).toBe(6);
  });

  // --- activeWidgetIds computed ---

  it('activeWidgetIds reflects editLayout', () => {
    component.editLayout.set([
      { widget_id: 'a', col: 0, row: 0 },
      { widget_id: 'b', col: 1, row: 0 },
    ]);
    expect(component.activeWidgetIds().has('a')).toBeTrue();
    expect(component.activeWidgetIds().has('b')).toBeTrue();
    expect(component.activeWidgetIds().has('c')).toBeFalse();
  });

  // --- vm$ passes view param for Analysts group ---

  it('passes analyst view param for Analysts group', () => {
    dashboardService.getDashboard.calls.reset();
    component.selectedGroup.set('Analysts');
    component.refresh();
    expect(dashboardService.getDashboard).toHaveBeenCalledWith('analyst');
  });

  it('passes collaborator view param for Collaborators group', () => {
    dashboardService.getDashboard.calls.reset();
    component.selectedGroup.set('Collaborators');
    component.refresh();
    expect(dashboardService.getDashboard).toHaveBeenCalledWith('collaborator');
  });

  // --- vm$ layout.customized ---

  it('vm$ sets isCustomized from layout response', (done) => {
    dashboardService.getDashboard.and.returnValue(of({
      widgets: ALL_WIDGETS,
      alerts: [],
      layout: { customized: true },
    }));
    component.refresh();
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        expect(vm.isCustomized).toBeTrue();
        done();
      }
    });
  });

  // --- onGridDrop: conflict branch — slide widgets ---

  it('onGridDrop() slides existing widgets when there is a conflict that fits', () => {
    // Set up catalog so getWidgetType works
    component.catalogWidgets.set([
      { id: 'a', title: 'A', type: 'stat', col_span: 1, description: '' },
      { id: 'b', title: 'B', type: 'stat', col_span: 1, description: '' },
    ]);
    // Put two stat widgets on the same row
    component.editLayout.set([
      { widget_id: 'a', col: 0, row: 0 },
      { widget_id: 'b', col: 1, row: 0 },
    ]);
    // Drag 'a' to col 1 (where 'b' is) — should slide 'b' out of the way
    component.dragWidgetId.set('a');
    component.dropTarget.set({ col: 1, row: 0 });
    const event = new DragEvent('drop');
    spyOn(event, 'preventDefault');
    component.onGridDrop(event);
    // Both should still exist, 'a' at col 1, 'b' slid elsewhere
    const layout = component.editLayout();
    expect(layout.length).toBe(2);
    const aWidget = layout.find(w => w.widget_id === 'a');
    expect(aWidget!.col).toBe(1);
  });

  it('onGridDrop() pushes rows down when conflict does not fit', () => {
    // Set up catalog: a table (6-wide) and another table (6-wide)
    component.catalogWidgets.set([
      { id: 'tbl1', title: 'T1', type: 'table', col_span: 6, description: '' },
      { id: 'tbl2', title: 'T2', type: 'table', col_span: 6, description: '' },
    ]);
    // Two 6-wide tables can't share a row (total=12 > 6)
    component.editLayout.set([
      { widget_id: 'tbl1', col: 0, row: 0 },
      { widget_id: 'tbl2', col: 0, row: 1 },
    ]);
    // Drag tbl1 to row 1 where tbl2 is — won't fit, so tbl2 should be pushed down
    component.dragWidgetId.set('tbl1');
    component.dropTarget.set({ col: 0, row: 1 });
    const event = new DragEvent('drop');
    spyOn(event, 'preventDefault');
    component.onGridDrop(event);
    const layout = component.editLayout();
    const tbl1 = layout.find(w => w.widget_id === 'tbl1');
    const tbl2 = layout.find(w => w.widget_id === 'tbl2');
    // tbl1 moved to row 1 (compacted to 0), tbl2 pushed to row 2 (compacted to 1)
    expect(tbl1!.row).toBeLessThan(tbl2!.row);
  });

  it('onGridDrop() clears state when no target', () => {
    component.dragWidgetId.set('test');
    component.dropTarget.set(null);
    const event = new DragEvent('drop');
    spyOn(event, 'preventDefault');
    component.onGridDrop(event);
    expect(component.dragWidgetId()).toBeNull();
  });

  // --- onDragStart with dataTransfer ---

  it('onDragStart() sets dataTransfer data', () => {
    const dt = new DataTransfer();
    const event = new DragEvent('dragstart', { dataTransfer: dt });
    component.onDragStart('widget1', event);
    expect(component.dragWidgetId()).toBe('widget1');
    expect(dt.getData('text/plain')).toBe('widget1');
  });

  it('onDragStart() handles null dataTransfer', () => {
    const event = new DragEvent('dragstart');
    component.onDragStart('widget1', event);
    expect(component.dragWidgetId()).toBe('widget1');
  });

  // --- onGridDragOver branches ---

  it('onGridDragOver() sets dropTarget when drag is active', () => {
    component.dragWidgetId.set('test');
    // Create a mock grid element
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.width = '600px';
    grid.style.columnGap = '16px';
    grid.style.rowGap = '16px';
    grid.style.gridTemplateRows = '100px 100px';
    document.body.appendChild(grid);

    const event = new DragEvent('dragover', {
      clientX: 100,
      clientY: 50,
    });
    Object.defineProperty(event, 'currentTarget', { value: grid });
    spyOn(event, 'preventDefault');

    component.onGridDragOver(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.dropTarget()).not.toBeNull();

    document.body.removeChild(grid);
  });

  // --- isDropTarget with wider widgets ---

  it('isDropTarget returns true for all cells covered by a chart widget', () => {
    component.catalogWidgets.set([
      { id: 'chart1', title: 'C', type: 'chart', col_span: 3, description: '' },
    ]);
    component.dragWidgetId.set('chart1');
    component.dropTarget.set({ col: 1, row: 0 });
    // chart colSpan=3, so cells 1,2,3 should be targets
    expect(component.isDropTarget(1, 0)).toBeTrue();
    expect(component.isDropTarget(2, 0)).toBeTrue();
    expect(component.isDropTarget(3, 0)).toBeTrue();
    expect(component.isDropTarget(0, 0)).toBeFalse();
    expect(component.isDropTarget(4, 0)).toBeFalse();
  });

  // --- addFromCatalog fills next available position ---

  it('addFromCatalog places widget in first available position', () => {
    component.catalogWidgets.set([
      { id: 's1', title: 'S1', type: 'stat', col_span: 1, description: '' },
      { id: 's2', title: 'S2', type: 'stat', col_span: 1, description: '' },
      { id: 's3', title: 'S3', type: 'stat', col_span: 1, description: '' },
    ]);
    component.editLayout.set([
      { widget_id: 's1', col: 0, row: 0 },
      { widget_id: 's2', col: 1, row: 0 },
    ]);
    component.addFromCatalog({
      id: 's3', title: 'S3', type: 'stat', col_span: 1, description: '',
    });
    const s3 = component.editLayout().find(w => w.widget_id === 's3');
    expect(s3).toBeTruthy();
    expect(s3!.col).toBe(2); // next available col
    expect(s3!.row).toBe(0);
  });

  // --- vm$ auto-selects first group ---

  it('auto-selects first group when selectedGroup is empty', (done) => {
    component.selectedGroup.set('');
    defaultGroupNames$.next(['Collaborators', 'Analysts']);
    component.refresh();
    component.vm$.subscribe(vm => {
      if (vm.state === 'ready') {
        expect(component.selectedGroup()).toBe('Collaborators');
        done();
      }
    });
  });

  // --- onDocumentClick inside dropdown does not close ---

  it('onDocumentClick() does not close when click is inside .bc-viewSwitcher', () => {
    component.viewDropdownOpen.set(true);
    const switcher = document.createElement('div');
    switcher.classList.add('bc-viewSwitcher');
    const inner = document.createElement('button');
    switcher.appendChild(inner);
    document.body.appendChild(switcher);

    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', { value: inner });

    component.onDocumentClick(event);
    expect(component.viewDropdownOpen()).toBeTrue();

    document.body.removeChild(switcher);
  });
});
