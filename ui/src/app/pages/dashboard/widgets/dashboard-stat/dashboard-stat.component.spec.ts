import { TestBed, ComponentFixture } from '@angular/core/testing';
import { DashboardStatComponent } from './dashboard-stat.component';
import { DashboardWidget, StatData } from '../../models/dashboard.model';

function makeStatWidget(id: string, title: string, value: number): DashboardWidget {
  return {
    id,
    title,
    type: 'stat',
    size: 'sm',
    col: 0, row: 0, col_span: 1,
    data: { value } as StatData,
  };
}

describe('DashboardStatComponent', () => {
  let component: DashboardStatComponent;
  let fixture: ComponentFixture<DashboardStatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardStatComponent],
    }).compileComponents();
  });

  function createWithWidget(widget: DashboardWidget): void {
    fixture = TestBed.createComponent(DashboardStatComponent);
    component = fixture.componentInstance;
    component.widget = widget;
    fixture.detectChanges();
  }

  it('should create', () => {
    createWithWidget(makeStatWidget('active_engagements', 'Active Engagements', 5));
    expect(component).toBeTruthy();
  });

  // --- statData getter ---

  it('returns widget.data as StatData', () => {
    createWithWidget(makeStatWidget('active_engagements', 'Active Engagements', 5));
    expect(component.statData.value).toBe(5);
  });

  // --- iconClass getter ---

  it('returns correct icon for active_engagements', () => {
    createWithWidget(makeStatWidget('active_engagements', 'Active Engagements', 5));
    expect(component.iconClass).toBe('bi-briefcase');
  });

  it('returns correct icon for total_findings', () => {
    createWithWidget(makeStatWidget('total_findings', 'Total Findings', 10));
    expect(component.iconClass).toBe('bi-bug');
  });

  it('returns correct icon for critical_high_findings', () => {
    createWithWidget(makeStatWidget('critical_high_findings', 'Critical/High', 3));
    expect(component.iconClass).toBe('bi-exclamation-triangle');
  });

  it('returns correct icon for total_clients', () => {
    createWithWidget(makeStatWidget('total_clients', 'Total Clients', 8));
    expect(component.iconClass).toBe('bi-building');
  });

  it('returns correct icon for total_assets', () => {
    createWithWidget(makeStatWidget('total_assets', 'Total Assets', 12));
    expect(component.iconClass).toBe('bi-hdd-network');
  });

  it('returns correct icon for active_users', () => {
    createWithWidget(makeStatWidget('active_users', 'Active Users', 4));
    expect(component.iconClass).toBe('bi-people');
  });

  it('returns fallback icon for unknown widget id', () => {
    createWithWidget(makeStatWidget('unknown_stat', 'Unknown', 0));
    expect(component.iconClass).toBe('bi-bar-chart');
  });

  // --- iconColor getter ---

  it('returns correct color for active_engagements', () => {
    createWithWidget(makeStatWidget('active_engagements', 'Active Engagements', 5));
    expect(component.iconColor).toBe('var(--bc-accent)');
  });

  it('returns correct color for total_findings', () => {
    createWithWidget(makeStatWidget('total_findings', 'Total Findings', 10));
    expect(component.iconColor).toBe('var(--bc-danger)');
  });

  it('returns correct color for critical_high_findings', () => {
    createWithWidget(makeStatWidget('critical_high_findings', 'Critical/High', 3));
    expect(component.iconColor).toBe('#ffaa33');
  });

  it('returns correct color for total_clients', () => {
    createWithWidget(makeStatWidget('total_clients', 'Total Clients', 8));
    expect(component.iconColor).toBe('var(--bc-accent2)');
  });

  it('returns correct color for total_assets', () => {
    createWithWidget(makeStatWidget('total_assets', 'Total Assets', 12));
    expect(component.iconColor).toBe('var(--bc-accent2)');
  });

  it('returns correct color for active_users', () => {
    createWithWidget(makeStatWidget('active_users', 'Active Users', 4));
    expect(component.iconColor).toBe('var(--bc-accent)');
  });

  it('returns fallback color for unknown widget id', () => {
    createWithWidget(makeStatWidget('unknown_stat', 'Unknown', 0));
    expect(component.iconColor).toBe('var(--bc-accent)');
  });

  // --- Template rendering ---

  it('renders widget title', () => {
    createWithWidget(makeStatWidget('active_engagements', 'Active Engagements', 5));
    const label = fixture.nativeElement.querySelector('.bc-kpiLabel');
    expect(label?.textContent).toContain('Active Engagements');
  });

  it('renders stat value', () => {
    createWithWidget(makeStatWidget('active_engagements', 'Active Engagements', 42));
    const value = fixture.nativeElement.querySelector('.bc-kpiValue');
    expect(value?.textContent).toContain('42');
  });

  it('renders icon with correct class', () => {
    createWithWidget(makeStatWidget('total_findings', 'Total Findings', 10));
    const icon = fixture.nativeElement.querySelector('.bc-kpiIcon');
    expect(icon).not.toBeNull();
    expect(icon.classList.contains('bi-bug')).toBe(true);
  });

  it('applies icon color style', () => {
    createWithWidget(makeStatWidget('total_findings', 'Total Findings', 10));
    const icon = fixture.nativeElement.querySelector('.bc-kpiIcon');
    expect(icon?.style.color).toBe('var(--bc-danger)');
  });
});
