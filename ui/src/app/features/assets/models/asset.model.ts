export type AssetType = 'host' | 'webapp' | 'api' | 'cloud' | 'network_device' | 'mobile_app' | 'other';
export type AssetEnvironment = 'prod' | 'staging' | 'dev' | 'lab';
export type AssetCriticality = 'low' | 'medium' | 'high';

export interface Asset {
  id: string;
  name: string;
  client_id: string | null;
  client_name: string;
  asset_type: AssetType;
  environment: AssetEnvironment;
  criticality: AssetCriticality;
  target: string;
  notes: string;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  host: 'Host',
  webapp: 'WebApp',
  api: 'API',
  cloud: 'Cloud',
  network_device: 'Network Device',
  mobile_app: 'Mobile App',
  other: 'Other',
};

export const ASSET_ENV_LABELS: Record<AssetEnvironment, string> = {
  prod: 'Prod',
  staging: 'Staging',
  dev: 'Dev',
  lab: 'Lab',
};

export const ASSET_CRIT_LABELS: Record<AssetCriticality, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
