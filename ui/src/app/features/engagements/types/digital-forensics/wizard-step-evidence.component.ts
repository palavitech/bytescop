import {
  ChangeDetectionStrategy, Component, EventEmitter, inject,
  Input, Output, signal, ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ForensicsEvidenceService } from './forensics-evidence.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import {
  ForensicsEvidence, EvidenceSourceType, AcquisitionMethod,
  EVIDENCE_SOURCE_TYPE_LABELS, ACQUISITION_METHOD_LABELS,
} from './forensics.model';

export interface EvidenceStepResult {
  evidenceSources: ForensicsEvidence[];
}

@Component({
  selector: 'app-wizard-step-evidence',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, FormsModule],
  templateUrl: './wizard-step-evidence.component.html',
  styleUrl: './wizard-step-evidence.component.css',
})
export class WizardStepEvidenceComponent {
  private readonly forensicsService = inject(ForensicsEvidenceService);
  private readonly notify = inject(NotificationService);

  @Input({ required: true }) engagementId!: string;

  @Output() proceed = new EventEmitter<EvidenceStepResult>();
  @Output() back = new EventEmitter<void>();

  readonly evidenceSources = signal<ForensicsEvidence[]>([]);
  readonly adding = signal(false);
  readonly formOpen = signal(false);

  readonly typeLabels = EVIDENCE_SOURCE_TYPE_LABELS;
  readonly evidenceTypes = Object.entries(EVIDENCE_SOURCE_TYPE_LABELS).map(
    ([value, label]) => ({ value, label }),
  );
  readonly acquisitionMethods = Object.entries(ACQUISITION_METHOD_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  newName = '';
  newType: EvidenceSourceType = 'disk_image';
  newSourcePath = '';
  newAcquisitionDate = '';
  newAcquisitionMethod: AcquisitionMethod = '';
  newAcquisitionTool = '';
  newSourceDevice = '';
  newSha256 = '';
  newDescription = '';

  toggleForm(): void {
    this.formOpen.update(v => !v);
  }

  resetForm(): void {
    this.newName = '';
    this.newType = 'disk_image';
    this.newSourcePath = '';
    this.newAcquisitionDate = '';
    this.newAcquisitionMethod = '';
    this.newAcquisitionTool = '';
    this.newSourceDevice = '';
    this.newSha256 = '';
    this.newDescription = '';
  }

  addEvidence(): void {
    const name = this.newName.trim();
    const sourcePath = this.newSourcePath.trim();
    if (!name || !sourcePath || !this.engagementId) return;
    this.adding.set(true);

    this.forensicsService.addEvidence(this.engagementId, {
      name,
      evidence_type: this.newType,
      source_path: sourcePath,
      acquisition_date: this.newAcquisitionDate || undefined,
      acquisition_method: this.newAcquisitionMethod || undefined,
      acquisition_tool: this.newAcquisitionTool.trim() || undefined,
      source_device: this.newSourceDevice.trim() || undefined,
      sha256: this.newSha256.trim() || undefined,
      description: this.newDescription.trim() || undefined,
    }).subscribe({
      next: (evidence) => {
        this.evidenceSources.update(list => [...list, evidence]);
        this.resetForm();
        this.formOpen.set(false);
        this.adding.set(false);
      },
      error: (err) => {
        this.adding.set(false);
        this.notify.error(err?.error?.message || err?.error?.detail || 'Failed to add evidence source.');
      },
    });
  }

  removeEvidence(id: string): void {
    if (!this.engagementId) return;
    this.forensicsService.deleteEvidence(this.engagementId, id).subscribe({
      next: () => {
        this.evidenceSources.update(list => list.filter(e => e.id !== id));
      },
      error: () => this.notify.error('Failed to remove evidence source.'),
    });
  }

  canSubmitForm(): boolean {
    return !!this.newName.trim() && !!this.newSourcePath.trim();
  }

  canProceed(): boolean {
    return this.evidenceSources().length > 0;
  }

  onProceed(): void {
    if (!this.canProceed()) return;
    this.proceed.emit({ evidenceSources: this.evidenceSources() });
  }

  onBack(): void {
    this.back.emit();
  }
}
