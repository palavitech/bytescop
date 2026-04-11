import { Type } from '@angular/core';
import { EngagementType } from '../models/engagement.model';

export interface EngagementTypeConfig {
  findingsSectionComponent: Type<any>;
  findingsTableComponent: Type<any>;
  wizardStepScopeComponent: Type<any>;
}

// Lazy imports — each type barrel re-exports from current locations
import { FindingSectionStandardComponent } from './default';
import { FindingsTableStandardComponent } from './default';
import { WizardStepAssetsComponent } from './default';

import { FindingSectionMalwareComponent } from './malware-analysis';
import { FindingsTableMalwareComponent } from './malware-analysis';
import { WizardStepSamplesComponent } from './malware-analysis';

const DEFAULTS: EngagementTypeConfig = {
  findingsSectionComponent: FindingSectionStandardComponent,
  findingsTableComponent: FindingsTableStandardComponent,
  wizardStepScopeComponent: WizardStepAssetsComponent,
};

const OVERRIDES: Partial<Record<EngagementType, Partial<EngagementTypeConfig>>> = {
  malware_analysis: {
    findingsSectionComponent: FindingSectionMalwareComponent,
    findingsTableComponent: FindingsTableMalwareComponent,
    wizardStepScopeComponent: WizardStepSamplesComponent,
  },
};

export function getTypeConfig(type: EngagementType): EngagementTypeConfig {
  return { ...DEFAULTS, ...OVERRIDES[type] };
}
