export interface StatData {
  value: number;
  suffix?: string;
}

export interface DatasetEntry {
  label: string;
  values: number[];
  color: string;
}

export interface ChartData {
  chart_type: 'doughnut' | 'bar';
  labels: string[];
  values?: number[];
  colors?: string[];
  datasets?: DatasetEntry[];
  stacked?: boolean;
}

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'stat' | 'chart' | 'table';
  col: number;
  row: number;
  col_span: number;
  data: StatData | ChartData | TableData;
  size?: string;
}

export interface DashboardAlert {
  id: string;
  level: 'warning' | 'danger';
  title: string;
  message: string;
  action_label: string;
  action_url: string;
}

export interface WidgetPlacement {
  widget_id: string;
  col: number;
  row: number;
}

export interface CatalogWidget {
  id: string;
  title: string;
  type: 'stat' | 'chart' | 'table';
  col_span: number;
  description: string;
}

export interface DashboardLayoutResponse {
  view: string;
  widgets: WidgetPlacement[] | null;
  customized: boolean;
}

export interface CatalogResponse {
  widgets: CatalogWidget[];
}
