export type ClientStatus = 'active' | 'inactive';

export interface Organization {
  id: string;
  name: string;
  website: string;
  status: ClientStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRef {
  id: string;
  name: string;
}
