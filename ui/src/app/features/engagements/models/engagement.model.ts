export type EngagementStatus = 'planned' | 'active' | 'on_hold' | 'completed';

export interface FindingsSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface Engagement {
  id: string;
  name: string;
  client_id: string | null;
  client_name: string;
  status: EngagementStatus;
  description: string;
  notes: string;
  start_date: string | null;
  end_date: string | null;
  findings_summary: FindingsSummary | null;
  created_at: string;
  updated_at: string;
}

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
};

export type SowStatus = 'draft' | 'approved';

export interface Sow {
  id: string;
  engagement: string;
  title: string;
  status: SowStatus;
  created_at: string;
  updated_at: string;
}

