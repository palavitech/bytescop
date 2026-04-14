import { Engagement } from '../../engagements/models/engagement.model';

export type ProjectStatus = 'active' | 'on_hold' | 'completed';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
};

export interface Project {
  id: string;
  name: string;
  description: string;
  client_id: string | null;
  client_name: string;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  engagement_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends Project {
  engagements: Engagement[];
}

export interface ProjectCreate {
  name: string;
  description?: string;
  client_id: string | null;
  start_date?: string | null;
  end_date?: string | null;
  engagement_types: string[];
}

export interface ProjectRef {
  id: string;
  name: string;
}
