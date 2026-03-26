import { TestBed, ComponentFixture } from '@angular/core/testing';
import { DashboardTableComponent } from './dashboard-table.component';
import { DashboardWidget, TableData } from '../../models/dashboard.model';

const TABLE_WIDGET_WITH_ROWS: DashboardWidget = {
  id: 'recent_findings',
  title: 'Recent Findings',
  type: 'table',
  size: 'lg',
  col: 0, row: 0, col_span: 2,
  data: {
    columns: ['Title', 'Severity', 'Status'],
    rows: [
      ['XSS in login', 'Critical', 'Open'],
      ['Weak cipher', 'Medium', 'Fixed'],
    ],
  } as TableData,
};

const TABLE_WIDGET_EMPTY: DashboardWidget = {
  id: 'empty_table',
  title: 'Empty Table',
  type: 'table',
  size: 'lg',
  col: 0, row: 1, col_span: 2,
  data: {
    columns: ['Title', 'Severity'],
    rows: [],
  } as TableData,
};

describe('DashboardTableComponent', () => {
  let component: DashboardTableComponent;
  let fixture: ComponentFixture<DashboardTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardTableComponent],
    }).compileComponents();
  });

  function createWithWidget(widget: DashboardWidget): void {
    fixture = TestBed.createComponent(DashboardTableComponent);
    component = fixture.componentInstance;
    component.widget = widget;
    fixture.detectChanges();
  }

  it('should create', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component).toBeTruthy();
  });

  // --- tableData getter ---

  it('returns widget.data as TableData', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    const data = component.tableData;
    expect(data.columns).toEqual(['Title', 'Severity', 'Status']);
    expect(data.rows.length).toBe(2);
  });

  // --- hasRows getter ---

  it('hasRows is true when rows exist', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.hasRows).toBe(true);
  });

  it('hasRows is false when rows are empty', () => {
    createWithWidget(TABLE_WIDGET_EMPTY);
    expect(component.hasRows).toBe(false);
  });

  // --- pillClass ---

  it('returns severity class for Critical', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Severity', 'Critical')).toContain('bc-severityPill--critical');
  });

  it('returns severity class for High', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Severity', 'High')).toContain('bc-severityPill--high');
  });

  it('returns severity class for Medium', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Severity', 'Medium')).toContain('bc-severityPill--medium');
  });

  it('returns severity class for Low', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Severity', 'Low')).toContain('bc-severityPill--low');
  });

  it('returns severity class for Info', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Severity', 'Info')).toContain('bc-severityPill--info');
  });

  it('returns status class for Open', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'Open')).toContain('bc-severityPill--critical');
  });

  it('returns status class for Triage', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'Triage')).toContain('bc-severityPill--high');
  });

  it('returns status class for Accepted', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'Accepted')).toContain('bc-severityPill--medium');
  });

  it('returns status class for Fixed', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'Fixed')).toContain('bc-severityPill--low');
  });

  it('returns status class for False positive', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'False positive')).toContain('bc-severityPill--info');
  });

  it('returns status class for Active', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'Active')).toContain('bc-severityPill--low');
  });

  it('returns status class for Planned', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'Planned')).toContain('bc-severityPill--info');
  });

  it('returns status class for On hold', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'On hold')).toContain('bc-severityPill--high');
  });

  it('returns status class for Completed', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'Completed')).toContain('bc-severityPill--medium');
  });

  it('returns empty string for unknown severity', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Severity', 'Unknown')).toBe('');
  });

  it('returns empty string for unknown status', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Status', 'Unknown')).toBe('');
  });

  it('returns empty string for non-pill column', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Title', 'XSS')).toBe('');
  });

  it('handles numeric value in pillClass', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.pillClass('Severity', 123)).toBe('');
  });

  // --- isPill ---

  it('isPill returns true for Severity', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.isPill('Severity')).toBe(true);
  });

  it('isPill returns true for Status', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.isPill('Status')).toBe(true);
  });

  it('isPill returns false for other columns', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    expect(component.isPill('Title')).toBe(false);
    expect(component.isPill('Date')).toBe(false);
  });

  // --- Template rendering ---

  it('renders widget title', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    const title = fixture.nativeElement.querySelector('.bc-sectionLabel');
    expect(title?.textContent).toContain('Recent Findings');
  });

  it('renders table with correct columns', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    const headers = fixture.nativeElement.querySelectorAll('th');
    expect(headers.length).toBe(3);
    expect(headers[0].textContent).toContain('Title');
    expect(headers[1].textContent).toContain('Severity');
    expect(headers[2].textContent).toContain('Status');
  });

  it('renders correct number of rows', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('renders severity pills in severity column', () => {
    createWithWidget(TABLE_WIDGET_WITH_ROWS);
    const pills = fixture.nativeElement.querySelectorAll('.bc-severityPill');
    expect(pills.length).toBeGreaterThan(0);
  });

  it('renders no entries message when empty', () => {
    createWithWidget(TABLE_WIDGET_EMPTY);
    const empty = fixture.nativeElement.querySelector('.bc-tableEmpty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('No entries');
  });

  it('does not render table when empty', () => {
    createWithWidget(TABLE_WIDGET_EMPTY);
    const table = fixture.nativeElement.querySelector('table');
    expect(table).toBeNull();
  });
});
