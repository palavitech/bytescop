export type SettingType = 'text' | 'boolean' | 'choice';

export interface SettingDefinition {
  key: string;
  label: string;
  description: string;
  setting_type: SettingType;
  choices: string[];
  default: string;
  group: string;
  order: number;
  value: string;
  has_value: boolean;
  updated_at: string | null;
  updated_by: string | null;
}
