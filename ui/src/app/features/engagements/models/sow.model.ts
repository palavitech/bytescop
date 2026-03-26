export type SowStatus = 'draft' | 'approved';

export interface Sow {
  id: string;
  title: string;
  status: SowStatus;
  created_at: string;
  updated_at: string;
}

export const SOW_STATUS_LABELS: Record<SowStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
};
