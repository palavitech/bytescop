export type AnalysisType = 'static' | 'dynamic' | '';

export const ANALYSIS_TYPE_LABELS: Record<string, string> = {
  static: 'Static Analysis',
  dynamic: 'Dynamic Analysis',
};

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingStatus =
  | 'open'
  | 'triage'
  | 'accepted'
  | 'fixed'
  | 'false_positive';

export type ExecutionStatus = '' | 'pending' | 'running' | 'completed' | 'failed';

export const EXECUTION_STATUS_LABELS: Record<string, string> = {
  '': '',
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

export interface Finding {
  id: string;
  engagement_id: string;
  asset_id: string | null;
  asset_name: string;
  sample_id: string | null;
  sample_name: string;
  title: string;
  analysis_type: string;
  severity: FindingSeverity;
  assessment_area: string;
  owasp_category: string;
  cwe_id: string;
  status: FindingStatus;
  description_md: string;
  recommendation_md: string;
  is_draft: boolean;
  analysis_check_key: string;
  execution_status: ExecutionStatus;
  created_at: string;
  updated_at: string;
}

export const FINDING_SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export const FINDING_SEVERITIES: { value: FindingSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info' },
];

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  open: 'Open',
  triage: 'Triage',
  accepted: 'Accepted',
  fixed: 'Fixed',
  false_positive: 'False Positive',
};

export const FINDING_STATUSES: { value: FindingStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'triage', label: 'Triage' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'false_positive', label: 'False Positive' },
];
