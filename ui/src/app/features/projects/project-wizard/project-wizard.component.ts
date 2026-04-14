import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { ProjectsService } from '../services/projects.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { OrganizationRef, Organization } from '../../organizations/models/organization.model';
import { EngagementType, ENGAGEMENT_TYPE_META, EngagementTypeMeta } from '../../engagements/models/engagement.model';

export type WizardStep = 'details' | 'client' | 'types' | 'review';

const STEP_ORDER: WizardStep[] = ['details', 'client', 'types', 'review'];

const STEP_LABELS: Record<WizardStep, string> = {
  details: 'Project Details',
  client: 'Client',
  types: 'Engagements',
  review: 'Review & Create',
};

@Component({
  selector: 'app-project-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-wizard.component.html',
  styleUrl: './project-wizard.component.css',
})
export class ProjectWizardComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly orgService = inject(OrganizationsService);
  private readonly notify = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly fb = inject(FormBuilder);

  // -- Step state --
  readonly currentStep = signal<WizardStep>('details');
  readonly stepLabels = STEP_LABELS;
  readonly stepOrder = STEP_ORDER;

  readonly currentStepIndex = computed(() => STEP_ORDER.indexOf(this.currentStep()));

  // -- Loading / error --
  readonly submitting = signal(false);
  readonly error = signal('');

  // -- Step 1: Project details --
  projectForm!: FormGroup;
  readonly durationLabel = signal<string>('—');

  // -- Step 2: Client selection --
  readonly organizations = signal<OrganizationRef[]>([]);
  readonly selectedOrgId = signal<string | null>(null);
  readonly selectedOrgName = signal('');
  readonly showOrgForm = signal(false);
  readonly orgSaving = signal(false);
  orgForm!: FormGroup;

  // -- Step 3: Engagement type selection --
  readonly selectedTypes = signal<EngagementType[]>([]);
  readonly engagementTypes = ENGAGEMENT_TYPE_META;

  // -- Help --
  showHelp = false;

  constructor() {
    this.initProjectForm();
    this.initOrgForm();
    this.loadOrganizations();
  }

  // ── Initialization ─────────────────────────────────────────────────

  private initProjectForm(): void {
    this.projectForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      description: [''],
      start_date: ['', [Validators.required]],
      end_date: [''],
    });

    this.projectForm.get('start_date')?.valueChanges.subscribe(() => this.updateDuration());
    this.projectForm.get('end_date')?.valueChanges.subscribe(() => this.updateDuration());
  }

  private initOrgForm(): void {
    this.orgForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      website: [''],
      notes: [''],
    });
  }

  private loadOrganizations(): void {
    this.orgService.ref().subscribe({
      next: orgs => this.organizations.set(orgs),
      error: () => this.organizations.set([]),
    });
  }

  private updateDuration(): void {
    const start = this.projectForm.get('start_date')?.value;
    const end = this.projectForm.get('end_date')?.value;
    if (start && end) {
      const diff = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
      this.durationLabel.set(diff > 0 ? `${diff} day${diff === 1 ? '' : 's'}` : '—');
    } else {
      this.durationLabel.set('—');
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────

  isStepDone(step: WizardStep): boolean {
    return STEP_ORDER.indexOf(step) < this.currentStepIndex();
  }

  isStepActive(step: WizardStep): boolean {
    return step === this.currentStep();
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

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  // ── Step 1: Project Details ────────────────────────────────────────

  isProjectFormInvalid(field: string): boolean {
    const ctrl = this.projectForm.get(field);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }

  canProceedFromDetails(): boolean {
    return this.projectForm.valid;
  }

  proceedFromDetails(): void {
    if (!this.projectForm.valid) {
      this.projectForm.markAllAsTouched();
      return;
    }
    this.nextStep();
  }

  // ── Step 2: Client Selection ───────────────────────────────────────

  onOrgDropdownChange(id: string | null): void {
    this.selectedOrgId.set(id);
    const org = this.organizations().find(o => o.id === id);
    this.selectedOrgName.set(org?.name ?? '');
  }

  toggleOrgForm(): void {
    this.showOrgForm.set(!this.showOrgForm());
  }

  submitNewOrg(): void {
    if (this.orgForm.invalid) {
      this.orgForm.markAllAsTouched();
      return;
    }
    this.orgSaving.set(true);
    this.orgService.create(this.orgForm.value).subscribe({
      next: (org: Organization) => {
        this.organizations.update(list => [...list, { id: org.id, name: org.name }]);
        this.selectedOrgId.set(org.id);
        this.selectedOrgName.set(org.name);
        this.showOrgForm.set(false);
        this.orgSaving.set(false);
        this.orgForm.reset();

      },
      error: () => {
        this.orgSaving.set(false);
        this.notify.error('Failed to create client.');
      },
    });
  }

  canProceedFromClient(): boolean {
    return !!this.selectedOrgId();
  }

  proceedFromClient(): void {
    if (!this.canProceedFromClient()) return;
    this.nextStep();
  }

  // ── Step 3: Engagement Type Selection ──────────────────────────────

  isTypeSelected(type: EngagementType): boolean {
    return this.selectedTypes().includes(type);
  }

  toggleType(type: EngagementType): void {
    this.selectedTypes.update(types => {
      if (types.includes(type)) {
        return types.filter(t => t !== type);
      }
      return [...types, type];
    });
  }

  canProceedFromTypes(): boolean {
    return true;
  }

  proceedFromTypes(): void {
    if (!this.canProceedFromTypes()) return;
    this.nextStep();
  }

  // ── Step 4: Review & Create ────────────────────────────────────────

  getTypeLabel(type: string): string {
    const meta = ENGAGEMENT_TYPE_META.find(m => m.key === type);
    return meta?.label ?? type;
  }

  getTypeIcon(type: string): string {
    const meta = ENGAGEMENT_TYPE_META.find(m => m.key === type);
    return meta?.icon ?? 'bi-clipboard-check';
  }

  createProject(): void {
    this.submitting.set(true);
    this.error.set('');

    const form = this.projectForm.value;
    this.projectsService.create({
      name: form.name,
      description: form.description || '',
      client_id: this.selectedOrgId(),
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      engagement_types: this.selectedTypes(),
    }).subscribe({
      next: project => {
        this.submitting.set(false);

        this.router.navigate(['/projects', project.id]);
      },
      error: (err) => {
        this.submitting.set(false);
        const detail = err?.error?.detail || err?.error?.engagement_types?.[0] || 'Failed to create project.';
        this.error.set(detail);
      },
    });
  }
}
