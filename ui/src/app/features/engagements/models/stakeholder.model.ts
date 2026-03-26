export interface StakeholderUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  timezone: string;
  avatar_url: string | null;
}

export interface EngagementStakeholder {
  id: string;
  member_id: string;
  role: string;
  user: StakeholderUser;
  created_at: string;
  updated_at: string;
}

export interface StakeholderCreate {
  member_id: string;
  role: string;
}

export interface EngagementSettingDef {
  key: string;
  label: string;
  description: string;
  setting_type: string;
  choices?: string[];
  default: string;
  group: string;
  order: number;
  value: string;
  has_value: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export const STAKEHOLDER_ROLE_LABELS: Record<string, string> = {
  account_manager: 'Account Manager',
  project_manager: 'Project Manager',
  security_engineer: 'Security Engineer',
  lead_tester: 'Lead Tester',
  qa_reviewer: 'QA Reviewer',
  client_poc: 'Client Point of Contact',
  technical_lead: 'Technical Lead',
  observer: 'Observer',
};

export const STAKEHOLDER_ROLES = Object.entries(STAKEHOLDER_ROLE_LABELS).map(
  ([value, label]) => ({ value, label })
);
