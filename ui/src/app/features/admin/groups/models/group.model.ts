export interface PermissionItem {
  id: string;
  codename: string;
  name: string;
  category: string;
  resource: string;
}

export interface TenantGroupListItem {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  member_count: number;
  created_at: string;
}

export interface TenantGroupDetail {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  permissions: PermissionItem[];
  created_at: string;
  updated_at: string;
}

export interface TenantGroupCreate {
  name: string;
  description: string;
  permission_ids: string[];
}

export interface TenantGroupUpdate {
  name?: string;
  description?: string;
  permission_ids?: string[];
}
