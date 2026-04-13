import {
  Component, ChangeDetectionStrategy, Input, ViewChild,
  ElementRef, OnDestroy, AfterViewInit,
} from '@angular/core';
import {
  Chart, DoughnutController, ArcElement, Legend, Tooltip,
  BarController, BarElement, CategoryScale, LinearScale,
} from 'chart.js';
import { VizChartData } from './visualize.model';

Chart.register(
  DoughnutController, ArcElement,
  BarController, BarElement, CategoryScale, LinearScale,
  Legend, Tooltip,
);

const CHART_FONT = { family: 'IBM Plex Mono', size: 11 };
const LABEL_COLOR = 'rgba(255,255,255,0.55)';

@Component({
  selector: 'app-visualize-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visualize-chart.component.html',
  styleUrl: './visualize-chart.component.css',
})
export class VisualizeChartComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) chartData!: VizChartData;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;
  private resizeObserver: ResizeObserver | null = null;

  get hasData(): boolean {
    const d = this.chartData;
    if (d.datasets) {
      return d.datasets.some(ds => ds.values?.some(v => v > 0));
    }
    return d.values?.some(v => v > 0) ?? false;
  }

  get chartHeight(): number | null {
    const d = this.chartData;
    if (d.chart_type !== 'bar') return null;
    const count = d.labels?.length ?? 0;
    return Math.max(168, count * 42);
  }

  ngAfterViewInit(): void {
    if (!this.hasData) return;
    this.buildChart();
    this.resizeObserver = new ResizeObserver(() => {
      this.chart?.resize();
    });
    this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement!);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.chart?.destroy();
    this.chart = null;
  }

  private buildChart(): void {
    const d = this.chartData;
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    if (d.chart_type === 'bar') {
      this.buildBarChart(ctx, d);
    } else {
      this.buildDoughnutChart(ctx, d);
    }
  }

  private buildDoughnutChart(ctx: CanvasRenderingContext2D, d: VizChartData): void {
    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: d.labels,
        datasets: [{
          data: d.values ?? [],
          backgroundColor: d.colors ?? [],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: {
            position: 'right',
            labels: {
              color: LABEL_COLOR,
              font: CHART_FONT,
              padding: 12,
              boxWidth: 12,
            },
          },
          tooltip: {
            titleFont: CHART_FONT,
            bodyFont: CHART_FONT,
          },
        },
      },
    });
  }

  private buildBarChart(ctx: CanvasRenderingContext2D, d: VizChartData): void {
    const multiDataset = !!d.datasets;
    const stacked = !!d.stacked;
    const datasets = d.datasets
      ? d.datasets.map(ds => ({
          label: ds.label,
          data: ds.values,
          backgroundColor: ds.color,
          borderWidth: 0,
          borderRadius: stacked ? 0 : 4,
          borderSkipped: false as const,
          barThickness: 28,
          maxBarThickness: 28,
        }))
      : [{
          data: d.values ?? [],
          backgroundColor: d.colors ?? [],
          borderWidth: 0,
          borderRadius: 4,
          barThickness: 28,
          maxBarThickness: 28,
        }];

    if (stacked && datasets.length > 0) {
      datasets[datasets.length - 1].borderRadius = 4;
    }

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: { labels: d.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: multiDataset,
            position: 'bottom',
            labels: { color: LABEL_COLOR, font: CHART_FONT, padding: 10, boxWidth: 12 },
          },
          tooltip: {
            titleFont: CHART_FONT,
            bodyFont: CHART_FONT,
          },
        },
        scales: {
          x: {
            stacked,
            ticks: { color: LABEL_COLOR, font: CHART_FONT, stepSize: 1 },
            grid: { color: 'rgba(201,212,255,0.08)' },
          },
          y: {
            stacked,
            ticks: { color: LABEL_COLOR, font: CHART_FONT },
            grid: { display: false },
          },
        },
      },
    });
  }
}
