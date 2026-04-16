import { Type } from '@angular/core';
import { EngagementType } from '../models/engagement.model';
import { Finding, FINDING_SEVERITIES, FINDING_STATUSES } from '../models/finding.model';

export interface FilterOption {
  value: string;
  label: string;
}

export interface EngagementTypeConfig {
  findingsSectionComponent: Type<any>;
  findingsTableComponent: Type<any>;
  wizardStepScopeComponent: Type<any>;
  scopeSummaryComponent: Type<any>;
  sowScopeEditComponent: Type<any>;

  // Metadata for finding view / filters
  scopeEntityLabel: string;
  scopeEntityIcon: string | null;
  scopeEntityField: keyof Finding;
  scopeEntityFilterParam: string;
  severityOptions: FilterOption[];
  statusOptions: FilterOption[];
}

// Lazy imports — each type barrel re-exports from current locations
import { FindingSectionStandardComponent } from './default';
import { FindingsTableStandardComponent } from './default';
import { WizardStepAssetsComponent } from './default';
import { SowScopeAssetsComponent } from './default';
import { SowScopeAssetsEditComponent } from './default';

import { FindingSectionMalwareComponent } from './malware-analysis';
import { FindingsTableMalwareComponent } from './malware-analysis';
import { WizardStepSamplesComponent } from './malware-analysis';
import { SowScopeSamplesComponent } from './malware-analysis';
import { SowScopeSamplesEditComponent } from './malware-analysis';

import { FindingSectionForensicsComponent } from './digital-forensics';
import { FindingsTableForensicsComponent } from './digital-forensics';
import { WizardStepEvidenceComponent } from './digital-forensics';
import { SowScopeEvidenceComponent } from './digital-forensics';
import { SowScopeEvidenceEditComponent } from './digital-forensics';
import { FORENSICS_CONFIDENCES, FORENSICS_VERIFICATION_STATUSES } from './digital-forensics';

const DEFAULTS: EngagementTypeConfig = {
  findingsSectionComponent: FindingSectionStandardComponent,
  findingsTableComponent: FindingsTableStandardComponent,
  wizardStepScopeComponent: WizardStepAssetsComponent,
  scopeSummaryComponent: SowScopeAssetsComponent,
  sowScopeEditComponent: SowScopeAssetsEditComponent,
  scopeEntityLabel: 'Asset',
  scopeEntityIcon: null,
  scopeEntityField: 'asset_name',
  scopeEntityFilterParam: 'asset_id',
  severityOptions: FINDING_SEVERITIES,
  statusOptions: FINDING_STATUSES,
};

const OVERRIDES: Partial<Record<EngagementType, Partial<EngagementTypeConfig>>> = {
  malware_analysis: {
    findingsSectionComponent: FindingSectionMalwareComponent,
    findingsTableComponent: FindingsTableMalwareComponent,
    wizardStepScopeComponent: WizardStepSamplesComponent,
    scopeSummaryComponent: SowScopeSamplesComponent,
    sowScopeEditComponent: SowScopeSamplesEditComponent,
    scopeEntityLabel: 'Sample',
    scopeEntityIcon: 'bi bi-file-earmark-binary',
    scopeEntityField: 'sample_name',
    scopeEntityFilterParam: 'sample_id',
  },
  digital_forensics: {
    findingsSectionComponent: FindingSectionForensicsComponent,
    findingsTableComponent: FindingsTableForensicsComponent,
    wizardStepScopeComponent: WizardStepEvidenceComponent,
    scopeSummaryComponent: SowScopeEvidenceComponent,
    sowScopeEditComponent: SowScopeEvidenceEditComponent,
    scopeEntityLabel: 'Evidence Source',
    scopeEntityIcon: 'bi bi-search',
    scopeEntityField: 'evidence_source_name',
    scopeEntityFilterParam: 'evidence_source_id',
    severityOptions: FORENSICS_CONFIDENCES,
    statusOptions: FORENSICS_VERIFICATION_STATUSES,
  },
};

export function getTypeConfig(type: EngagementType): EngagementTypeConfig {
  return { ...DEFAULTS, ...OVERRIDES[type] };
}
