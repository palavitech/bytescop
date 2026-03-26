import { TestBed, ComponentFixture } from '@angular/core/testing';
import { WidgetCatalogComponent } from './widget-catalog.component';
import { CatalogWidget } from '../models/dashboard.model';

const MOCK_CATALOG: CatalogWidget[] = [
  { id: 'active_engagements', title: 'Active Engagements', type: 'stat', col_span: 1, description: 'Count of active engagements' },
  { id: 'total_findings', title: 'Total Findings', type: 'stat', col_span: 1, description: 'Count of findings' },
  { id: 'severity_chart', title: 'Severity Breakdown', type: 'chart', col_span: 3, description: 'Pie chart of severities' },
  { id: 'status_chart', title: 'Status Chart', type: 'chart', col_span: 3, description: 'Bar chart of statuses' },
  { id: 'recent_findings', title: 'Recent Findings', type: 'table', col_span: 6, description: 'Latest findings table' },
];

describe('WidgetCatalogComponent', () => {
  let component: WidgetCatalogComponent;
  let fixture: ComponentFixture<WidgetCatalogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetCatalogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WidgetCatalogComponent);
    component = fixture.componentInstance;
    component.widgets = MOCK_CATALOG;
    component.activeIds = new Set(['active_engagements']);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- stats getter ---

  it('stats returns only stat-type widgets', () => {
    expect(component.stats.length).toBe(2);
    expect(component.stats.every(w => w.type === 'stat')).toBeTrue();
  });

  // --- charts getter ---

  it('charts returns only chart-type widgets', () => {
    expect(component.charts.length).toBe(2);
    expect(component.charts.every(w => w.type === 'chart')).toBeTrue();
  });

  // --- tables getter ---

  it('tables returns only table-type widgets', () => {
    expect(component.tables.length).toBe(1);
    expect(component.tables[0].id).toBe('recent_findings');
  });

  // --- isActive ---

  it('isActive returns true for active widget', () => {
    expect(component.isActive('active_engagements')).toBeTrue();
  });

  it('isActive returns false for inactive widget', () => {
    expect(component.isActive('severity_chart')).toBeFalse();
  });

  // --- typeIcon ---

  it('typeIcon returns bi-hash for stat', () => {
    expect(component.typeIcon('stat')).toBe('bi-hash');
  });

  it('typeIcon returns bi-pie-chart for chart', () => {
    expect(component.typeIcon('chart')).toBe('bi-pie-chart');
  });

  it('typeIcon returns bi-table for table', () => {
    expect(component.typeIcon('table')).toBe('bi-table');
  });

  it('typeIcon returns bi-grid for unknown type', () => {
    expect(component.typeIcon('unknown')).toBe('bi-grid');
  });

  // --- addWidget output ---

  it('emits addWidget when called', () => {
    spyOn(component.addWidget, 'emit');
    const widget = MOCK_CATALOG[2];
    component.addWidget.emit(widget);
    expect(component.addWidget.emit).toHaveBeenCalledWith(widget);
  });
});
