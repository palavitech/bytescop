export interface PermissionPreset {
  id: string;
  label: string;
  description: string;
  codenames: string[];
}

export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    id: 'manage-assessments',
    label: 'Manage Assessments',
    description: 'Full control over engagements, findings, evidence, SoW, and scope',
    codenames: [
      'engagement.view', 'engagement.create', 'engagement.update', 'engagement.delete',
      'finding.view', 'finding.create', 'finding.update', 'finding.delete',
      'evidence.view', 'evidence.create', 'evidence.update', 'evidence.delete',
      'sow.view', 'sow.create', 'sow.update', 'sow.delete',
      'scope.view', 'scope.manage',
      'engagement_settings.view',
    ],
  },
  {
    id: 'view-assessments',
    label: 'View Assessments',
    description: 'Read-only access to assessment data',
    codenames: [
      'engagement.view', 'finding.view', 'evidence.view', 'sow.view', 'scope.view',
    ],
  },
  {
    id: 'manage-organizations',
    label: 'Manage Clients',
    description: 'Full control over clients and assets',
    codenames: [
      'client.view', 'client.create', 'client.update', 'client.delete',
      'asset.view', 'asset.create', 'asset.update', 'asset.delete',
    ],
  },
  {
    id: 'view-organizations',
    label: 'View Clients',
    description: 'Read-only access to clients and assets',
    codenames: ['client.view', 'asset.view'],
  },
  {
    id: 'administer-users',
    label: 'Administer Users',
    description: 'Manage users and groups',
    codenames: [
      'user.view', 'user.create', 'user.update', 'user.delete',
      'group.view', 'group.create', 'group.update', 'group.delete',
    ],
  },
  {
    id: 'manage-settings',
    label: 'Manage Settings',
    description: 'Tenant settings and billing access',
    codenames: [
      'tenant_settings.view', 'tenant_settings.manage',
      'billing.view', 'billing.manage',
    ],
  },
];
