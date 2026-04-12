export interface ForensicsEvidence {
  id: string;
  name: string;
  evidence_type: EvidenceSourceType;
  description: string;
  acquisition_date: string;
  sha256: string;
  size_bytes: number;
  chain_of_custody: string;
  created_at: string;
}

export type EvidenceSourceType =
  | 'disk_image'
  | 'memory_dump'
  | 'network_capture'
  | 'log_file'
  | 'mobile_extraction'
  | 'other';

export const EVIDENCE_SOURCE_TYPE_LABELS: Record<EvidenceSourceType, string> = {
  disk_image: 'Disk Image',
  memory_dump: 'Memory Dump',
  network_capture: 'Network Capture',
  log_file: 'Log File',
  mobile_extraction: 'Mobile Extraction',
  other: 'Other',
};

export type ForensicsConfidence = 'confirmed' | 'probable' | 'possible' | 'inconclusive';

export const FORENSICS_CONFIDENCE_LABELS: Record<ForensicsConfidence, string> = {
  confirmed: 'Confirmed',
  probable: 'Probable',
  possible: 'Possible',
  inconclusive: 'Inconclusive',
};

export const FORENSICS_CONFIDENCES: { value: ForensicsConfidence; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'probable', label: 'Probable' },
  { value: 'possible', label: 'Possible' },
  { value: 'inconclusive', label: 'Inconclusive' },
];

export type ForensicsVerificationStatus =
  | 'unverified'
  | 'confirmed'
  | 'corroborated'
  | 'disputed';

export const FORENSICS_VERIFICATION_LABELS: Record<ForensicsVerificationStatus, string> = {
  unverified: 'Unverified',
  confirmed: 'Confirmed',
  corroborated: 'Corroborated',
  disputed: 'Disputed',
};

export const FORENSICS_VERIFICATION_STATUSES: { value: ForensicsVerificationStatus; label: string }[] = [
  { value: 'unverified', label: 'Unverified' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'corroborated', label: 'Corroborated' },
  { value: 'disputed', label: 'Disputed' },
];

export const MITRE_TACTICS: { value: string; label: string }[] = [
  { value: 'initial_access', label: 'Initial Access' },
  { value: 'execution', label: 'Execution' },
  { value: 'persistence', label: 'Persistence' },
  { value: 'privilege_escalation', label: 'Privilege Escalation' },
  { value: 'defense_evasion', label: 'Defense Evasion' },
  { value: 'credential_access', label: 'Credential Access' },
  { value: 'discovery', label: 'Discovery' },
  { value: 'lateral_movement', label: 'Lateral Movement' },
  { value: 'collection', label: 'Collection' },
  { value: 'command_and_control', label: 'Command and Control' },
  { value: 'exfiltration', label: 'Exfiltration' },
  { value: 'impact', label: 'Impact' },
];

export const IOC_TYPES: { value: string; label: string }[] = [
  { value: 'ip_address', label: 'IP Address' },
  { value: 'domain', label: 'Domain' },
  { value: 'url', label: 'URL' },
  { value: 'file_hash', label: 'File Hash' },
  { value: 'file_path', label: 'File Path' },
  { value: 'registry_key', label: 'Registry Key' },
  { value: 'email_address', label: 'Email Address' },
  { value: 'user_agent', label: 'User Agent' },
  { value: 'other', label: 'Other' },
];

export interface ForensicsFindingPayload {
  title: string;
  evidence_source_id: string;
  mitre_tactic: string;
  mitre_technique: string;
  ioc_type: string;
  ioc_value: string;
  occurrence_date: string;
  description_md: string;
  is_draft: boolean;
}
