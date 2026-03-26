export type UserIdentity = {
  id: string | number;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  password_changed_at: string | null;
};

export type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  role: string;
};

export type SubscriptionLimits = {
  max_members: number;
  max_clients: number;
  max_assets: number;
  max_engagements: number;
  max_findings_per_engagement: number;
  max_images_per_finding: number;
};

export type SubscriptionFeatures = {
  audit_log: boolean;
  data_export: boolean;
  custom_branding: boolean;
};

export type SubscriptionUsage = {
  members: number;
  clients: number;
  assets: number;
  engagements: number;
};

export type SubscriptionInfo = {
  plan_code: string;
  plan_name: string;
  limits: SubscriptionLimits;
  features: SubscriptionFeatures;
  usage: SubscriptionUsage;
};

export type UserProfile = {
  user: UserIdentity;
  tenant: TenantInfo | null;
  subscription: SubscriptionInfo | null;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  passwordResetRequired: boolean;
  passwordResetReason: string | null;
  passwordChangedAt: string | null;
  mfaSetupRequired: boolean;
  dateFormat: string | null;
};

export type UserProfileState = {
  profile: UserProfile | null;
  loadedAt: number | null;
  loading: boolean;
  error: string | null;
};
