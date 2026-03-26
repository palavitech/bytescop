export interface UserNested {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  timezone: string;
  avatar_url: string | null;
  mfa_enabled: boolean;
}

export interface MemberGroup {
  id: string;
  name: string;
  is_default: boolean;
}

export interface TenantMember {
  id: string;
  user: UserNested;
  role: string;
  is_active: boolean;
  invite_status: 'none' | 'pending' | 'accepted';
  groups: MemberGroup[];
  created_at: string;
  updated_at: string;
}

export interface TenantMemberCreate {
  email: string;
  first_name: string;
  last_name: string;
  password?: string;
  password_confirm?: string;
  phone?: string;
  timezone?: string;
  group_ids?: string[];
}

export interface TenantMemberUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string;
  timezone?: string;
  group_ids?: string[];
}

export interface ToggleActiveResponse {
  id: string;
  is_active: boolean;
}

export interface EngagementAssignment {
  id: string;
  engagement_id: string;
  engagement_name: string;
  client_name: string;
  engagement_status: string;
  role: string;
  created_at: string;
}
