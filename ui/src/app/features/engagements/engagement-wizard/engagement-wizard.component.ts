import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { EngagementsService } from '../services/engagements.service';
import { SowService } from '../services/sow.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { OrganizationRef, Organization } from '../../organizations/models/organization.model';
import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS } from '../../assets/models/asset.model';
import { Engagement, EngagementType, ENGAGEMENT_TYPE_LABELS, ENGAGEMENT_TYPE_META } from '../models/engagement.model';
import { Sow } from '../models/sow.model';
import { WizardStepAssetsComponent, AssetStepResult } from '../types/default';
import { WizardStepSamplesComponent, MalwareSample } from '../types/malware-analysis';
import { WizardStepEvidenceComponent, EvidenceStepResult, ForensicsEvidence } from '../types/digital-forensics';

export type WizardStep = 'org' | 'assets' | 'sample' | 'evidence' | 'details' | 'sow' | 'review';

const DEFAULT_STEP_ORDER: WizardStep[] = ['org', 'assets', 'details', 'sow', 'review'];
const MALWARE_STEP_ORDER: WizardStep[] = ['org', 'sample', 'details', 'sow', 'review'];
const FORENSICS_STEP_ORDER: WizardStep[] = ['org', 'evidence', 'details', 'sow', 'review'];

const STEP_LABELS: Record<WizardStep, string> = {
  org: 'Organization',
  assets: 'Assets',
  sample: 'Samples',
  evidence: 'Evidence',
  details: 'Engagement',
  sow: 'Statement of Work',
  review: 'Review & Activate',
};

function getStepOrder(type: EngagementType): WizardStep[] {
  if (type === 'malware_analysis') return MALWARE_STEP_ORDER;
  if (type === 'digital_forensics') return FORENSICS_STEP_ORDER;
  return DEFAULT_STEP_ORDER;
}

@Component({
  selector: 'app-engagement-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, WizardStepAssetsComponent, WizardStepSamplesComponent, WizardStepEvidenceComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagement-wizard.component.html',
  styleUrl: './engagement-wizard.component.css',
})
export class EngagementWizardComponent {
  private readonly engService = inject(EngagementsService);
  private readonly sowService = inject(SowService);
  private readonly orgService = inject(OrganizationsService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly fb = inject(FormBuilder);

  // -- Step state --
  readonly currentStep = signal<WizardStep>('org');
  readonly stepLabels = STEP_LABELS;
  readonly stepOrder = computed(() => getStepOrder(this.engagementType()));

  readonly currentStepIndex = computed(() => this.stepOrder().indexOf(this.currentStep()));
  readonly isMalwareFlow = computed(() => this.engagementType() === 'malware_analysis');
  readonly isForensicsFlow = computed(() => this.engagementType() === 'digital_forensics');

  // -- Loading / error --
  readonly submitting = signal(false);
  readonly error = signal('');

  // -- Step 1: Organization --
  readonly organizations = signal<OrganizationRef[]>([]);
  readonly selectedOrgId = signal<string | null>(null);
  readonly selectedOrgName = signal('');
  readonly showOrgForm = signal(false);
  readonly orgSaving = signal(false);
  orgForm!: FormGroup;

  // -- Step 2: Assets (stored from step component) --
  readonly selectedAssetIds = signal<string[]>([]);
  readonly selectedAssets = signal<Asset[]>([]);

  readonly assetTypeLabels = ASSET_TYPE_LABELS;
  readonly assetEnvLabels = ASSET_ENV_LABELS;
  readonly assetCritLabels = ASSET_CRIT_LABELS;

  // -- Step 2b: Malware Samples (stored from step component) --
  readonly uploadedSamples = signal<MalwareSample[]>([]);

  // -- Step 2c: Forensics Evidence (stored from step component) --
  readonly addedEvidence = signal<ForensicsEvidence[]>([]);

  // -- Step 3: Engagement details --
  engForm!: FormGroup;

  // -- Step 3→4 bridge: created engagement --
  readonly createdEngagement = signal<Engagement | null>(null);
  readonly createdSow = signal<Sow | null>(null);

  // -- Engagement type --
  readonly engagementType = signal<EngagementType>('general');
  readonly engagementTypeLabel = computed(() => ENGAGEMENT_TYPE_LABELS[this.engagementType()]);
  readonly engagementTypeIcon = computed(() => {
    const meta = ENGAGEMENT_TYPE_META.find(m => m.key === this.engagementType());
    return meta?.icon ?? 'bi-clipboard-check';
  });

  // -- Help --
  showHelp = false;

  constructor() {
    this.initEngagementType();
    this.initOrgForm();
    this.initEngForm();
    this.loadOrganizations();
  }

  // ── Initialization ─────────────────────────────────────────────────

  private initEngagementType(): void {
    const typeParam = this.route.snapshot.queryParamMap.get('type');
    const validTypes = ENGAGEMENT_TYPE_META.map(m => m.key) as string[];
    if (typeParam && validTypes.includes(typeParam)) {
      this.engagementType.set(typeParam as EngagementType);
    } else {
      this.router.navigate(['/engagements/create']);
    }
  }

  private initOrgForm(): void {
    this.orgForm = this.fb.group({
      name: ['', Validators.required],
      website: [''],
      status: ['active'],
      notes: [''],
    });
  }

  private initEngForm(): void {
    this.engForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      start_date: [new Date().toISOString().slice(0, 10), Validators.required],
      end_date: [''],
      description: ['', Validators.maxLength(5000)],
      notes: ['', Validators.maxLength(5000)],
    });
  }

  private loadOrganizations(): void {
    this.orgService.ref().subscribe({
      next: (orgs) => this.organizations.set(orgs),
      error: () => this.notify.error('Failed to load organizations.'),
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  nextStep(): void {
    const order = this.stepOrder();
    const idx = this.currentStepIndex();
    if (idx < order.length - 1) {
      this.error.set('');
      this.currentStep.set(order[idx + 1]);
    }
  }

  prevStep(): void {
    const order = this.stepOrder();
    const idx = this.currentStepIndex();
    if (idx > 0) {
      this.error.set('');
      this.currentStep.set(order[idx - 1]);
    }
  }

  isStepDone(step: WizardStep): boolean {
    return this.stepOrder().indexOf(step) < this.currentStepIndex();
  }

  isStepActive(step: WizardStep): boolean {
    return step === this.currentStep();
  }

  // ── Step 1: Organization ───────────────────────────────────────────

  selectOrg(orgId: string, orgName: string): void {
    this.selectedOrgId.set(orgId);
    this.selectedOrgName.set(orgName);
  }

  onOrgDropdownChange(orgId: string): void {
    const org = this.organizations().find((o) => o.id === orgId);
    this.selectOrg(orgId, org?.name ?? '');
  }

  toggleOrgForm(): void {
    this.showOrgForm.update((v) => !v);
    if (this.showOrgForm()) {
      this.orgForm.reset({ name: '', website: '', status: 'active', notes: '' });
    }
  }

  submitNewOrg(): void {
    if (this.orgForm.invalid) {
      this.orgForm.markAllAsTouched();
      return;
    }
    this.orgSaving.set(true);
    this.orgService.create(this.orgForm.getRawValue()).subscribe({
      next: (org: Organization) => {
        this.orgSaving.set(false);
        this.showOrgForm.set(false);
        // Add to list and select it
        this.organizations.update((list) => [...list, { id: org.id, name: org.name }]);
        this.selectOrg(org.id, org.name);
        this.notify.success(`Organization "${org.name}" created.`);
      },
      error: (err) => {
        this.orgSaving.set(false);
        const detail = err?.error?.name?.[0] || err?.error?.detail || 'Failed to create organization.';
        this.notify.error(detail);
      },
    });
  }

  canProceedFromOrg(): boolean {
    return !!this.selectedOrgId();
  }

  proceedFromOrg(): void {
    if (!this.canProceedFromOrg()) return;
    if (this.isMalwareFlow() || this.isForensicsFlow()) {
      this.ensureEarlyEngagement();
    }
    this.nextStep();
  }

  // ── Step 2: Assets (handled by WizardStepAssetsComponent) ──────────

  onAssetStepProceed(result: AssetStepResult): void {
    this.selectedAssetIds.set(result.selectedIds);
    this.selectedAssets.set(result.selectedAssets);
    this.nextStep();
  }

  // ── Step 2b: Malware Samples (handled by WizardStepSamplesComponent) ──

  onSampleStepProceed(samples: MalwareSample[]): void {
    this.uploadedSamples.set(samples);
    this.nextStep();
  }

  // ── Step 2c: Forensics Evidence (handled by WizardStepEvidenceComponent) ──

  onEvidenceStepProceed(result: EvidenceStepResult): void {
    this.addedEvidence.set(result.evidenceSources);
    this.nextStep();
  }

  /**
   * For malware flow, we need the engagement to be created before we can upload
   * samples (they require an engagement ID). We create a temporary engagement
   * early so the upload endpoint works, then update it in the details step.
   */
  private _tempEngagementId: string | null = null;

  earlyEngagementId(): string | null {
    return this._tempEngagementId;
  }

  ensureEarlyEngagement(): void {
    if (this._tempEngagementId) return;
    this.submitting.set(true);
    this.error.set('');
    const payload = {
      name: `${this.engagementTypeLabel()} — ${new Date().toISOString().slice(0, 10)}`,
      client_id: this.selectedOrgId(),
      engagement_type: this.engagementType(),
      status: 'planned' as const,
      start_date: new Date().toISOString().slice(0, 10),
    };
    this.engService.create(payload).subscribe({
      next: (eng) => {
        this._tempEngagementId = eng.id;
        this.createdEngagement.set(eng);
        this.submitting.set(false);
      },
      error: (err) => {
        this.submitting.set(false);
        if (err?.status !== 402) {
          const detail = err?.error?.message || err?.error?.detail || 'Failed to create engagement for samples.';
          this.error.set(detail);
          this.notify.error(detail);
        }
      },
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  selectedAssetsList(): Asset[] {
    return this.selectedAssets();
  }

  // ── Step 3: Engagement Details ─────────────────────────────────────

  isEngFormInvalid(name: string): boolean {
    const c = this.engForm.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  proceedFromDetails(): void {
    if (this.engForm.invalid) {
      this.engForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set('');

    const formVal = this.engForm.getRawValue();

    // For malware flow, the engagement was already created in the sample step.
    // Update it with the details form values instead of creating a new one.
    if ((this.isMalwareFlow() || this.isForensicsFlow()) && this._tempEngagementId) {
      this.engService.update(this._tempEngagementId, formVal).subscribe({
        next: (eng) => {
          this.createdEngagement.set(eng);
          this.fetchSowAndAdvance(eng.id);
        },
        error: (err) => {
          this.submitting.set(false);
          const detail = err?.error?.message || err?.error?.detail || err?.error?.name?.[0] || 'Failed to update engagement.';
          this.error.set(detail);
          this.notify.error(detail);
        },
      });
      return;
    }

    const payload = {
      ...formVal,
      client_id: this.selectedOrgId(),
      engagement_type: this.engagementType(),
      status: 'planned',
    };

    this.engService.create(payload).subscribe({
      next: (eng) => {
        this.createdEngagement.set(eng);
        // Now add selected assets to scope, then fetch SoW
        this.addAssetsToScopeAndFetchSow(eng.id);
      },
      error: (err) => {
        this.submitting.set(false);
        if (err?.status !== 402) {
          const detail = err?.error?.message || err?.error?.detail || err?.error?.name?.[0] || 'Failed to create engagement.';
          this.error.set(detail);
          this.notify.error(detail);
        }
      },
    });
  }

  private addAssetsToScopeAndFetchSow(engId: string): void {
    const assetIds = this.selectedAssetIds();
    if (assetIds.length === 0) {
      this.fetchSowAndAdvance(engId);
      return;
    }

    // Add all selected assets to scope in parallel
    const addOps = assetIds.map((id) => this.sowService.addScope(engId, id));
    forkJoin(addOps).subscribe({
      next: () => this.fetchSowAndAdvance(engId),
      error: (err) => {
        this.submitting.set(false);
        const detail = err?.error?.detail || 'Failed to add assets to scope.';
        this.error.set(detail);
        this.notify.error(detail);
      },
    });
  }

  private fetchSowAndAdvance(engId: string): void {
    this.sowService.get(engId).subscribe({
      next: (sow) => {
        this.createdSow.set(sow);
        this.submitting.set(false);
        this.nextStep(); // → SoW step
      },
      error: () => {
        this.submitting.set(false);
        // SoW might not exist yet, still advance
        this.nextStep();
      },
    });
  }

  // ── Step 4: Approve SoW ────────────────────────────────────────────

  approveSow(): void {
    const eng = this.createdEngagement();
    if (!eng) return;

    this.submitting.set(true);
    this.error.set('');

    this.sowService.update(eng.id, { status: 'approved' }).subscribe({
      next: (sow) => {
        this.createdSow.set(sow);
        this.submitting.set(false);
        this.nextStep(); // → Review step
      },
      error: (err) => {
        this.submitting.set(false);
        const detail = err?.error?.detail || 'Failed to approve Statement of Work.';
        this.error.set(detail);
        this.notify.error(detail);
      },
    });
  }

  // ── Step 5: Review & Activate ──────────────────────────────────────

  keepPlanned(): void {
    const eng = this.createdEngagement();
    if (!eng) return;
    this.router.navigate(['/engagements', eng.id]);
  }

  activateEngagement(): void {
    const eng = this.createdEngagement();
    if (!eng) return;

    this.submitting.set(true);
    this.error.set('');

    this.engService.update(eng.id, { status: 'active' }).subscribe({
      next: (updated) => {
        this.createdEngagement.set(updated);
        this.submitting.set(false);
        this.router.navigate(['/engagements', updated.id]);
      },
      error: (err) => {
        this.submitting.set(false);
        const detail = err?.error?.detail || 'Failed to activate engagement.';
        this.error.set(detail);
        this.notify.error(detail);
      },
    });
  }
}
