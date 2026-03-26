export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'read'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'signup'
  | 'tenant_switch';

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  read: 'Read',
  login_success: 'Login',
  login_failed: 'Login Failed',
  logout: 'Logout',
  signup: 'Signup',
  tenant_switch: 'Tenant Switch',
};

export const AUDIT_ACTION_COLORS: Record<AuditAction, string> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  read: 'secondary',
  login_success: 'success',
  login_failed: 'orange',
  logout: 'secondary',
  signup: 'primary',
  tenant_switch: 'info',
};

export const AUDIT_ACTIONS: AuditAction[] = [
  'create',
  'update',
  'delete',
  'read',
  'login_success',
  'login_failed',
  'logout',
  'signup',
  'tenant_switch',
];

export const AUDIT_RESOURCE_TYPES = [
  'client',
  'asset',
  'engagement',
  'finding',
  'sow',
  'scope',
  'attachment',
  'group',
  'member',
  'auth',
];

export interface AuditLogListItem {
  id: number;
  action: AuditAction;
  resource_type: string;
  resource_id: string;
  resource_repr: string;
  actor_email: string;
  ip_address: string | null;
  timestamp: string;
}

export interface AuditLogDetail extends AuditLogListItem {
  user_agent: string;
  request_id: string;
  request_path: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  diff: Record<string, { old: unknown; new: unknown }> | null;
}

export interface AuditListResponse {
  results: AuditLogListItem[];
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
}

export interface AuditFilters {
  action?: string;
  resource_type?: string;
  actor?: string;
  resource_id?: string;
  date_from?: string;
  date_to?: string;
  engagement?: string;
  ip_address?: string;
}

export interface ActorEngagementChart {
  actors: string[];
  engagements: string[];
  matrix: number[][];
}

export interface ActorActionChart {
  actors: string[];
  actions: string[];
  matrix: number[][];
}

export interface IpChart {
  ips: string[];
  counts: number[];
}

export interface AuditSummary {
  total: number;
  by_action: Record<string, number>;
  by_resource_type: Record<string, number>;
  by_actor: { actor_email: string; count: number }[];
  by_date: Record<string, string | number>[];
  findings_by_user_eng: ActorEngagementChart;
  disruptive_by_user_eng: ActorEngagementChart;
  engagement_actions_by_user: ActorActionChart;
  finding_actions_by_user: ActorActionChart;
  actions_by_ip: IpChart;
  eng_id_map: Record<string, string>;
}

export const AUDIT_ACTION_HEX: Record<string, string> = {
  create: '#00ffb3',
  update: '#00b7ff',
  delete: '#ff3b7a',
  read: '#8b95a5',
  login_success: '#00ffb3',
  login_failed: '#e67e22',
  logout: '#8b95a5',
  signup: '#6c5ce7',
  tenant_switch: '#00b7ff',
};

export const CHART_PALETTE: string[] = [
  '#34d399',  // emerald
  '#fb7185',  // rose
  '#38bdf8',  // sky
  '#fb923c',  // orange
  '#a78bfa',  // violet
  '#fbbf24',  // amber
  '#2dd4bf',  // teal
  '#f87171',  // red
  '#c084fc',  // fuchsia
  '#a3e635',  // lime
  '#e879f9',  // magenta
  '#94a3b8',  // slate
];

/** Generate a gradient array from a bright to muted color for ranked bar charts. */
export function chartGradient(count: number, from = '#38bdf8', to = '#164e63'): string[] {
  const f = [parseInt(from.slice(1, 3), 16), parseInt(from.slice(3, 5), 16), parseInt(from.slice(5, 7), 16)];
  const t = [parseInt(to.slice(1, 3), 16), parseInt(to.slice(3, 5), 16), parseInt(to.slice(5, 7), 16)];
  return Array.from({ length: count }, (_, i) => {
    const ratio = count <= 1 ? 0 : i / (count - 1);
    const r = Math.round(f[0] + (t[0] - f[0]) * ratio);
    const g = Math.round(f[1] + (t[1] - f[1]) * ratio);
    const b = Math.round(f[2] + (t[2] - f[2]) * ratio);
    return `rgb(${r},${g},${b})`;
  });
}
