import { TestBed, ComponentFixture } from '@angular/core/testing';
import { DashboardChartComponent } from './dashboard-chart.component';
import { DashboardWidget, ChartData } from '../../models/dashboard.model';

const CHART_WIDGET_WITH_DATA: DashboardWidget = {
  id: 'severity_chart',
  title: 'Severity Breakdown',
  type: 'chart',
  size: 'md',
  col: 0, row: 0, col_span: 1,
  data: {
    chart_type: 'doughnut',
    labels: ['Critical', 'High', 'Low'],
    values: [2, 5, 3],
    colors: ['#ff0000', '#ff8800', '#00ff00'],
  } as ChartData,
};

const CHART_WIDGET_NO_DATA: DashboardWidget = {
  id: 'empty_chart',
  title: 'Empty Chart',
  type: 'chart',
  size: 'md',
  col: 0, row: 0, col_span: 1,
  data: {
    chart_type: 'doughnut',
    labels: ['Critical', 'High'],
    values: [0, 0],
    colors: ['#ff0000', '#ff8800'],
  } as ChartData,
};

const CHART_WIDGET_NULL_VALUES: DashboardWidget = {
  id: 'null_chart',
  title: 'Null Chart',
  type: 'chart',
  size: 'md',
  col: 0, row: 0, col_span: 1,
  data: {
    chart_type: 'doughnut',
    labels: [],
    values: [],
    colors: [],
  } as ChartData,
};

describe('DashboardChartComponent', () => {
  let component: DashboardChartComponent;
  let fixture: ComponentFixture<DashboardChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardChartComponent],
    }).compileComponents();
  });

  function createWithWidget(widget: DashboardWidget): void {
    fixture = TestBed.createComponent(DashboardChartComponent);
    component = fixture.componentInstance;
    component.widget = widget;
    fixture.detectChanges(); // triggers ngAfterViewInit
  }

  it('should create', () => {
    createWithWidget(CHART_WIDGET_WITH_DATA);
    expect(component).toBeTruthy();
  });

  // --- chartData getter ---

  it('returns widget.data as ChartData', () => {
    createWithWidget(CHART_WIDGET_WITH_DATA);
    const data = component.chartData;
    expect(data.labels).toEqual(['Critical', 'High', 'Low']);
    expect(data.values).toEqual([2, 5, 3]);
  });

  // --- hasData getter ---

  it('hasData is true when values have positive numbers', () => {
    createWithWidget(CHART_WIDGET_WITH_DATA);
    expect(component.hasData).toBe(true);
  });

  it('hasData is false when all values are zero', () => {
    createWithWidget(CHART_WIDGET_NO_DATA);
    expect(component.hasData).toBe(false);
  });

  it('hasData is false when values array is empty', () => {
    createWithWidget(CHART_WIDGET_NULL_VALUES);
    expect(component.hasData).toBe(false);
  });

  // --- ngAfterViewInit / buildChart ---

  it('builds chart when data is present', () => {
    createWithWidget(CHART_WIDGET_WITH_DATA);
    // The private chart field should be set
    expect((component as any).chart).not.toBeNull();
  });

  it('does not build chart when no data', () => {
    createWithWidget(CHART_WIDGET_NO_DATA);
    expect((component as any).chart).toBeNull();
  });

  // --- ngOnDestroy ---

  it('destroys chart on component destroy', () => {
    createWithWidget(CHART_WIDGET_WITH_DATA);
    const chart = (component as any).chart;
    spyOn(chart, 'destroy');

    component.ngOnDestroy();

    expect(chart.destroy).toHaveBeenCalled();
    expect((component as any).chart).toBeNull();
  });

  it('handles destroy when no chart exists', () => {
    createWithWidget(CHART_WIDGET_NO_DATA);
    expect(() => component.ngOnDestroy()).not.toThrow();
    expect((component as any).chart).toBeNull();
  });

  // --- Template rendering ---

  it('renders widget title', () => {
    createWithWidget(CHART_WIDGET_WITH_DATA);
    const title = fixture.nativeElement.querySelector('.bc-widgetTitle');
    expect(title?.textContent).toContain('Severity Breakdown');
  });

  it('renders canvas when data is present', () => {
    createWithWidget(CHART_WIDGET_WITH_DATA);
    const canvas = fixture.nativeElement.querySelector('canvas');
    expect(canvas).not.toBeNull();
  });

  it('renders no data message when data is empty', () => {
    createWithWidget(CHART_WIDGET_NO_DATA);
    const empty = fixture.nativeElement.querySelector('.bc-chartEmpty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('No data');
  });

  it('does not render canvas when data is empty', () => {
    createWithWidget(CHART_WIDGET_NO_DATA);
    const canvas = fixture.nativeElement.querySelector('canvas');
    expect(canvas).toBeNull();
  });

  // --- hasData with undefined/null values (covers ?? false branch) ---

  it('hasData is false when values is undefined', () => {
    const widget: DashboardWidget = {
      id: 'undef_chart',
      title: 'Undefined Values',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'doughnut',
        labels: [],
        colors: [],
      } as any,
    };
    createWithWidget(widget);
    expect(component.hasData).toBe(false);
  });

  it('hasData is false when values is null', () => {
    const widget: DashboardWidget = {
      id: 'null_vals_chart',
      title: 'Null Values',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'doughnut',
        labels: [],
        values: null,
        colors: [],
      } as any,
    };
    createWithWidget(widget);
    expect(component.hasData).toBe(false);
  });

  // --- ngOnDestroy when chart was never built ---

  it('ngOnDestroy is safe when chart is null (no data widget)', () => {
    createWithWidget(CHART_WIDGET_NO_DATA);
    expect((component as any).chart).toBeNull();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // --- Branch: bar chart type ---

  it('builds a bar chart when chart_type is bar', () => {
    const barWidget: DashboardWidget = {
      id: 'bar_chart',
      title: 'Bar Chart',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'bar',
        labels: ['Open', 'Closed'],
        values: [4, 8],
        colors: ['#00ffb3', '#00b7ff'],
      } as ChartData,
    };
    createWithWidget(barWidget);
    const chart = (component as any).chart;
    expect(chart).not.toBeNull();
    expect(chart.config.type).toBe('bar');
  });

  // --- buildBarChart with multi-dataset mode ---

  it('builds a bar chart with multiple datasets', () => {
    const multiWidget: DashboardWidget = {
      id: 'multi_bar',
      title: 'Multi Dataset Bar',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'bar',
        labels: ['Open', 'Closed'],
        datasets: [
          { label: 'Critical', values: [3, 1], color: '#ff0000' },
          { label: 'High', values: [2, 4], color: '#ff8800' },
        ],
      } as ChartData,
    };
    createWithWidget(multiWidget);
    const chart = (component as any).chart;
    expect(chart).not.toBeNull();
    expect(chart.config.type).toBe('bar');
    expect(chart.config.data.datasets.length).toBe(2);
    expect(chart.config.data.datasets[0].label).toBe('Critical');
    expect(chart.config.data.datasets[1].label).toBe('High');
    // Legend should be displayed for multi-dataset
    expect(chart.config.options.plugins.legend.display).toBe(true);
  });

  it('builds a stacked bar chart with borderRadius adjustments', () => {
    const stackedWidget: DashboardWidget = {
      id: 'stacked_bar',
      title: 'Stacked Bar',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'bar',
        labels: ['Open', 'Closed'],
        stacked: true,
        datasets: [
          { label: 'Low', values: [1, 2], color: '#00ff00' },
          { label: 'Medium', values: [3, 1], color: '#ffff00' },
          { label: 'High', values: [5, 3], color: '#ff0000' },
        ],
      } as ChartData,
    };
    createWithWidget(stackedWidget);
    const chart = (component as any).chart;
    expect(chart).not.toBeNull();
    const datasets = chart.config.data.datasets;
    // Stacked: first datasets get borderRadius 0, last one gets 4
    expect(datasets[0].borderRadius).toBe(0);
    expect(datasets[1].borderRadius).toBe(0);
    expect(datasets[2].borderRadius).toBe(4);
    // Scales should be stacked
    expect(chart.config.options.scales.x.stacked).toBe(true);
    expect(chart.config.options.scales.y.stacked).toBe(true);
  });

  it('builds a non-stacked multi-dataset bar chart with borderRadius 4', () => {
    const nonStackedWidget: DashboardWidget = {
      id: 'nonstacked_bar',
      title: 'Non-Stacked Multi',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'bar',
        labels: ['A', 'B'],
        datasets: [
          { label: 'Set1', values: [2, 3], color: '#aaa' },
          { label: 'Set2', values: [4, 1], color: '#bbb' },
        ],
      } as ChartData,
    };
    createWithWidget(nonStackedWidget);
    const chart = (component as any).chart;
    const datasets = chart.config.data.datasets;
    // Non-stacked: all datasets get borderRadius 4
    expect(datasets[0].borderRadius).toBe(4);
    expect(datasets[1].borderRadius).toBe(4);
    // Scales should not be stacked
    expect(chart.config.options.scales.x.stacked).toBe(false);
    expect(chart.config.options.scales.y.stacked).toBe(false);
  });

  // --- hasData with datasets ---

  it('hasData is true when datasets have positive values', () => {
    const widget: DashboardWidget = {
      id: 'ds_chart',
      title: 'Dataset Chart',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'bar',
        labels: ['A', 'B'],
        datasets: [
          { label: 'S1', values: [0, 0], color: '#aaa' },
          { label: 'S2', values: [0, 5], color: '#bbb' },
        ],
      } as ChartData,
    };
    createWithWidget(widget);
    expect(component.hasData).toBe(true);
  });

  it('hasData is false when all dataset values are zero', () => {
    const widget: DashboardWidget = {
      id: 'ds_empty',
      title: 'Empty Dataset',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'bar',
        labels: ['A', 'B'],
        datasets: [
          { label: 'S1', values: [0, 0], color: '#aaa' },
          { label: 'S2', values: [0, 0], color: '#bbb' },
        ],
      } as ChartData,
    };
    createWithWidget(widget);
    expect(component.hasData).toBe(false);
  });

  it('hasData is false when datasets have undefined values', () => {
    const widget: DashboardWidget = {
      id: 'ds_undef',
      title: 'Undef Dataset',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'bar',
        labels: ['A'],
        datasets: [
          { label: 'S1', color: '#aaa' },
        ],
      } as any,
    };
    createWithWidget(widget);
    expect(component.hasData).toBe(false);
  });

  // --- single-value bar chart (no datasets, uses values/colors fallback) ---

  it('builds a single-dataset bar chart with values and colors', () => {
    const widget: DashboardWidget = {
      id: 'single_bar',
      title: 'Single Bar',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'bar',
        labels: ['X', 'Y'],
        values: [10, 20],
        colors: ['#111', '#222'],
      } as ChartData,
    };
    createWithWidget(widget);
    const chart = (component as any).chart;
    expect(chart).not.toBeNull();
    expect(chart.config.data.datasets.length).toBe(1);
    expect(chart.config.data.datasets[0].data).toEqual([10, 20]);
    // Legend hidden for single dataset
    expect(chart.config.options.plugins.legend.display).toBe(false);
  });

  // --- ngOnDestroy cleanup resets chart reference ---

  it('ngOnDestroy sets chart to null after destroy', () => {
    createWithWidget(CHART_WIDGET_WITH_DATA);
    expect((component as any).chart).not.toBeNull();
    component.ngOnDestroy();
    expect((component as any).chart).toBeNull();
  });

  it('ngOnDestroy disconnects resizeObserver when present', () => {
    createWithWidget(CHART_WIDGET_WITH_DATA);
    const ro = (component as any).resizeObserver;
    expect(ro).not.toBeNull();
    spyOn(ro, 'disconnect');
    component.ngOnDestroy();
    expect(ro.disconnect).toHaveBeenCalled();
    expect((component as any).resizeObserver).toBeNull();
  });

  it('ngOnDestroy is safe when resizeObserver is null', () => {
    createWithWidget(CHART_WIDGET_NO_DATA);
    expect((component as any).resizeObserver).toBeNull();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  it('builds doughnut chart with default empty arrays for missing values/colors', () => {
    const widget: DashboardWidget = {
      id: 'doughnut_defaults',
      title: 'Defaults',
      type: 'chart',
      size: 'md',
      col: 0, row: 0, col_span: 1,
      data: {
        chart_type: 'doughnut',
        labels: ['A'],
        values: [5],
      } as ChartData,
    };
    createWithWidget(widget);
    const chart = (component as any).chart;
    expect(chart).not.toBeNull();
    expect(chart.config.type).toBe('doughnut');
  });
});
