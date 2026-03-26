/**
 * Permission codename constants.
 * Avoids magic strings throughout the application.
 */
export const Permissions = {
  // Client
  CLIENT_VIEW: 'client.view',
  CLIENT_CREATE: 'client.create',
  CLIENT_UPDATE: 'client.update',
  CLIENT_DELETE: 'client.delete',

  // Asset
  ASSET_VIEW: 'asset.view',
  ASSET_CREATE: 'asset.create',
  ASSET_UPDATE: 'asset.update',
  ASSET_DELETE: 'asset.delete',

  // Engagement
  ENGAGEMENT_VIEW: 'engagement.view',
  ENGAGEMENT_CREATE: 'engagement.create',
  ENGAGEMENT_UPDATE: 'engagement.update',
  ENGAGEMENT_DELETE: 'engagement.delete',

  // Engagement settings
  ENGAGEMENT_SETTINGS_VIEW: 'engagement_settings.view',

  // Finding
  FINDING_VIEW: 'finding.view',
  FINDING_CREATE: 'finding.create',
  FINDING_UPDATE: 'finding.update',
  FINDING_DELETE: 'finding.delete',

  // Evidence
  EVIDENCE_VIEW: 'evidence.view',
  EVIDENCE_CREATE: 'evidence.create',
  EVIDENCE_UPDATE: 'evidence.update',
  EVIDENCE_DELETE: 'evidence.delete',

  // SOW
  SOW_VIEW: 'sow.view',
  SOW_UPDATE: 'sow.update',

  // User management
  USER_VIEW: 'user.view',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',

  // Group management
  GROUP_VIEW: 'group.view',
  GROUP_CREATE: 'group.create',
  GROUP_UPDATE: 'group.update',
  GROUP_DELETE: 'group.delete',

  // Billing
  BILLING_VIEW: 'billing.view',
  BILLING_MANAGE: 'billing.manage',

  // Settings
  SETTINGS_VIEW: 'tenant_settings.view',
  SETTINGS_MANAGE: 'tenant_settings.manage',

  // Comment
  COMMENT_CREATE: 'comment.create',
  COMMENT_EDIT: 'comment.edit',
  COMMENT_DELETE: 'comment.delete',
} as const;

export type PermissionCodename = typeof Permissions[keyof typeof Permissions];
