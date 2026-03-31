import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { EngagementsService } from '../services/engagements.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { AssetsService } from '../../assets/services/assets.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { OrganizationRef, Organization } from '../../organizations/models/organization.model';
import { Asset, ASSET_TYPE_LABELS, ASSET_ENV_LABELS, ASSET_CRIT_LABELS, AssetType, AssetEnvironment, AssetCriticality } from '../../assets/models/asset.model';
import { Engagement, Sow, EngagementType, ENGAGEMENT_TYPE_LABELS, ENGAGEMENT_TYPE_META } from '../models/engagement.model';

export type WizardStep = 'org' | 'assets' | 'details' | 'sow' | 'review';

const STEP_ORDER: WizardStep[] = ['org', 'assets', 'details', 'sow', 'review'];
const STEP_LABELS: Record<WizardStep, string> = {
  org: 'Organization',
  assets: 'Assets',
  details: 'Engagement',
  sow: 'Statement of Work',
  review: 'Review & Activate',
};

@Component({
  selector: 'app-engagement-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagement-wizard.component.html',
  styleUrl: './engagement-wizard.component.css',
})
export class EngagementWizardComponent {
  private readonly engService = inject(EngagementsService);
  private readonly orgService = inject(OrganizationsService);
  private readonly assetService = inject(AssetsService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly fb = inject(FormBuilder);

  // -- Step state --
  readonly currentStep = signal<WizardStep>('org');
  readonly stepOrder = STEP_ORDER;
  readonly stepLabels = STEP_LABELS;

  readonly currentStepIndex = computed(() => STEP_ORDER.indexOf(this.currentStep()));

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

  // -- Step 2: Assets --
  readonly orgAssets = signal<Asset[]>([]);
  readonly selectedAssetIds = signal<Set<string>>(new Set());
  readonly showAssetForm = signal(false);
  readonly assetSaving = signal(false);
  readonly assetsLoading = signal(false);
  assetForm!: FormGroup;

  readonly assetTypeLabels = ASSET_TYPE_LABELS;
  readonly assetEnvLabels = ASSET_ENV_LABELS;
  readonly assetCritLabels = ASSET_CRIT_LABELS;
  readonly typeOptions = Object.entries(ASSET_TYPE_LABELS) as [AssetType, string][];
  readonly envOptions = Object.entries(ASSET_ENV_LABELS) as [AssetEnvironment, string][];
  readonly critOptions = Object.entries(ASSET_CRIT_LABELS) as [AssetCriticality, string][];

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
    this.initAssetForm();
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

  private initAssetForm(): void {
    this.assetForm = this.fb.group({
      name: ['', Validators.required],
      asset_type: ['host'],
      environment: ['prod'],
      criticality: ['medium'],
      target: [''],
      notes: [''],
    });
  }

  private initEngForm(): void {
    this.engForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      start_date: ['', Validators.required],
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
    const idx = this.currentStepIndex();
    if (idx < STEP_ORDER.length - 1) {
      this.error.set('');
      this.currentStep.set(STEP_ORDER[idx + 1]);
    }
  }

  prevStep(): void {
    const idx = this.currentStepIndex();
    if (idx > 0) {
      this.error.set('');
      this.currentStep.set(STEP_ORDER[idx - 1]);
    }
  }

  isStepDone(step: WizardStep): boolean {
    return STEP_ORDER.indexOf(step) < this.currentStepIndex();
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
    this.loadAssetsForOrg();
    this.nextStep();
  }

  // ── Step 2: Assets ─────────────────────────────────────────────────

  private loadAssetsForOrg(): void {
    const orgId = this.selectedOrgId();
    if (!orgId) return;
    this.assetsLoading.set(true);
    this.assetService.list(orgId).subscribe({
      next: (assets) => {
        this.orgAssets.set(assets);
        this.assetsLoading.set(false);
      },
      error: () => {
        this.assetsLoading.set(false);
        this.notify.error('Failed to load assets.');
      },
    });
  }

  toggleAssetSelection(assetId: string): void {
    this.selectedAssetIds.update((set) => {
      const next = new Set(set);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }

  isAssetSelected(assetId: string): boolean {
    return this.selectedAssetIds().has(assetId);
  }

  selectAllAssets(): void {
    const allIds = this.orgAssets().map((a) => a.id);
    this.selectedAssetIds.set(new Set(allIds));
  }

  deselectAllAssets(): void {
    this.selectedAssetIds.set(new Set());
  }

  toggleAssetForm(): void {
    this.showAssetForm.update((v) => !v);
    if (this.showAssetForm()) {
      this.assetForm.reset({
        name: '', asset_type: 'host', environment: 'prod',
        criticality: 'medium', target: '', notes: '',
      });
    }
  }

  submitNewAsset(): void {
    if (this.assetForm.invalid) {
      this.assetForm.markAllAsTouched();
      return;
    }
    this.assetSaving.set(true);
    const value = {
      ...this.assetForm.getRawValue(),
      client_id: this.selectedOrgId(),
    };
    this.assetService.create(value).subscribe({
      next: (asset: Asset) => {
        this.assetSaving.set(false);
        this.showAssetForm.set(false);
        // Add to list and auto-select
        this.orgAssets.update((list) => [asset, ...list]);
        this.selectedAssetIds.update((set) => {
          const next = new Set(set);
          next.add(asset.id);
          return next;
        });
        this.notify.success(`Asset "${asset.name}" created.`);
      },
      error: (err) => {
        this.assetSaving.set(false);
        const detail = err?.error?.name?.[0] || err?.error?.detail || 'Failed to create asset.';
        this.notify.error(detail);
      },
    });
  }

  canProceedFromAssets(): boolean {
    return this.selectedAssetIds().size > 0;
  }

  proceedFromAssets(): void {
    if (!this.canProceedFromAssets()) return;
    this.nextStep();
  }

  selectedAssetsList(): Asset[] {
    const ids = this.selectedAssetIds();
    return this.orgAssets().filter((a) => ids.has(a.id));
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
    const assetIds = Array.from(this.selectedAssetIds());
    if (assetIds.length === 0) {
      this.fetchSowAndAdvance(engId);
      return;
    }

    // Add all selected assets to scope in parallel
    const addOps = assetIds.map((id) => this.engService.addToScope(engId, id));
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
    this.engService.getSow(engId).subscribe({
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

    this.engService.updateSow(eng.id, { status: 'approved' }).subscribe({
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
    this.notify.success(`Engagement "${eng.name}" saved as Planned.`);
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
        this.notify.success(`Engagement "${updated.name}" is now active!`);
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
