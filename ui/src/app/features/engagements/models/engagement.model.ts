export type EngagementType =
  | 'web_app_pentest'
  | 'external_pentest'
  | 'mobile_pentest'
  | 'internal_pentest'
  | 'wifi'
  | 'malware_analysis'
  | 'digital_forensics'
  | 'active_directory'
  | 'linux_audit'
  | 'windows_audit'
  | 'general';

export const ENGAGEMENT_TYPE_LABELS: Record<EngagementType, string> = {
  web_app_pentest: 'Web App Pen Testing',
  external_pentest: 'External Pen Testing',
  mobile_pentest: 'Mobile Pen Testing',
  internal_pentest: 'Internal Pen Testing',
  wifi: 'WiFi Assessment',
  malware_analysis: 'Malware Analysis',
  digital_forensics: 'Digital Forensics',
  active_directory: 'Active Directory',
  linux_audit: 'Linux Server Audit',
  windows_audit: 'Windows Audit',
  general: 'General / Other',
};

export interface EngagementTypeMeta {
  key: EngagementType;
  label: string;
  icon: string;
  description: string;
}

export const ENGAGEMENT_TYPE_META: EngagementTypeMeta[] = [
  { key: 'web_app_pentest', label: 'Web App Pen Testing', icon: 'bi-globe', description: 'Assess web application security including OWASP Top 10 vulnerabilities.' },
  { key: 'external_pentest', label: 'External Pen Testing', icon: 'bi-shield-exclamation', description: 'Evaluate external-facing infrastructure and perimeter defenses.' },
  { key: 'mobile_pentest', label: 'Mobile Pen Testing', icon: 'bi-phone', description: 'Test mobile applications for platform-specific security flaws.' },
  { key: 'internal_pentest', label: 'Internal Pen Testing', icon: 'bi-diagram-3', description: 'Simulate insider threats against internal network and services.' },
  { key: 'wifi', label: 'WiFi Assessment', icon: 'bi-wifi', description: 'Analyze wireless network security and access controls.' },
  { key: 'malware_analysis', label: 'Malware Analysis', icon: 'bi-bug', description: 'Reverse-engineer and analyze malicious software specimens.' },
  { key: 'digital_forensics', label: 'Digital Forensics', icon: 'bi-search', description: 'Investigate digital evidence and incident artifacts.' },
  { key: 'active_directory', label: 'Active Directory', icon: 'bi-server', description: 'Audit Active Directory configuration, GPOs, and trust relationships.' },
  { key: 'linux_audit', label: 'Linux Server Audit', icon: 'bi-terminal', description: 'Review Linux server hardening, services, and compliance.' },
  { key: 'windows_audit', label: 'Windows Audit', icon: 'bi-windows', description: 'Assess Windows systems for misconfigurations and vulnerabilities.' },
  { key: 'general', label: 'General / Other', icon: 'bi-clipboard-check', description: 'Custom or multi-scope security engagement.' },
];

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
  engagement_type: EngagementType;
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

export interface MalwareSample {
  id: string;
  original_filename: string;
  safe_filename: string;
  sha256: string;
  content_type: string;
  size_bytes: number;
  notes: string;
  download_url: string;
  created_at: string;
}

export type SowStatus = 'draft' | 'approved';

export interface Sow {
  id: string;
  engagement: string;
  title: string;
  status: SowStatus;
  created_at: string;
  updated_at: string;
}

