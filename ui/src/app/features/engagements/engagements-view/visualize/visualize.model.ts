export type VizWidgetType = 'timeline' | 'chart';

export interface VizPlacement {
  widget_id: string;
  col: number;
  row: number;
}

export interface VizCatalogWidget {
  id: string;
  title: string;
  type: VizWidgetType;
  col_span: number;
  description: string;
  category: string;
}

export interface VizDatasetEntry {
  label: string;
  values: number[];
  color: string;
}

export interface VizChartData {
  chart_type: 'doughnut' | 'bar';
  labels: string[];
  values?: number[];
  colors?: string[];
  datasets?: VizDatasetEntry[];
  stacked?: boolean;
}

export const GRID_COLS = 6;

export const COL_SPAN_BY_TYPE: Record<VizWidgetType, number> = {
  timeline: 6,
  chart: 2,
};

export const DEFAULT_CATALOG: VizCatalogWidget[] = [
  // Findings Analysis
  { id: 'findings_timeline', title: 'Findings Over Time', type: 'timeline', col_span: 6, description: 'Stacked bar chart of findings by date and severity', category: 'Findings Analysis' },
  { id: 'findings_by_severity', title: 'Findings by Severity', type: 'chart', col_span: 2, description: 'Doughnut breakdown by severity level', category: 'Findings Analysis' },
  { id: 'findings_by_status', title: 'Findings by Status', type: 'chart', col_span: 2, description: 'Doughnut breakdown by finding status', category: 'Findings Analysis' },
  { id: 'findings_by_cwe', title: 'Findings by CWE', type: 'chart', col_span: 2, description: 'Doughnut breakdown by CWE identifier', category: 'Findings Analysis' },
  { id: 'findings_by_area', title: 'Findings by Assessment Area', type: 'chart', col_span: 2, description: 'Doughnut breakdown by assessment area', category: 'Findings Analysis' },
  { id: 'findings_by_owasp', title: 'Findings by OWASP Top 10', type: 'chart', col_span: 2, description: 'Doughnut breakdown by OWASP category', category: 'Findings Analysis' },
  // Asset Analysis
  { id: 'assets_by_severity', title: 'Assets by Severity', type: 'chart', col_span: 2, description: 'Horizontal stacked bar of assets by finding severity', category: 'Asset Analysis' },
  { id: 'assets_by_status', title: 'Assets by Finding Status', type: 'chart', col_span: 2, description: 'Horizontal stacked bar of assets by finding status', category: 'Asset Analysis' },
  { id: 'asset_type_dist', title: 'Asset Type Distribution', type: 'chart', col_span: 2, description: 'Doughnut breakdown by asset type', category: 'Asset Analysis' },
  { id: 'asset_crit_findings', title: 'Asset Criticality vs Findings', type: 'chart', col_span: 2, description: 'Horizontal bar of findings grouped by asset criticality', category: 'Asset Analysis' },
];

export const DEFAULT_LAYOUT: VizPlacement[] = [
  { widget_id: 'findings_timeline', col: 0, row: 0 },
  { widget_id: 'findings_by_severity', col: 0, row: 1 },
  { widget_id: 'findings_by_status', col: 2, row: 1 },
  { widget_id: 'assets_by_severity', col: 4, row: 1 },
  { widget_id: 'findings_by_cwe', col: 0, row: 2 },
  { widget_id: 'findings_by_area', col: 2, row: 2 },
  { widget_id: 'findings_by_owasp', col: 4, row: 2 },
  { widget_id: 'assets_by_status', col: 0, row: 3 },
  { widget_id: 'asset_type_dist', col: 2, row: 3 },
  { widget_id: 'asset_crit_findings', col: 4, row: 3 },
];
