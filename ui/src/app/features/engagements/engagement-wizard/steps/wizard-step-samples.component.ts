import {
  ChangeDetectionStrategy, Component, EventEmitter, inject,
  Input, Output, signal, ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { EngagementsService } from '../../services/engagements.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { MalwareSample } from '../../models/engagement.model';

@Component({
  selector: 'app-wizard-step-samples',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule],
  templateUrl: './wizard-step-samples.component.html',
  styleUrl: './wizard-step-samples.component.css',
})
export class WizardStepSamplesComponent {
  private readonly engService = inject(EngagementsService);
  private readonly notify = inject(NotificationService);

  @Input({ required: true }) engagementId!: string;
  @Input() submitting = false;

  @Output() proceed = new EventEmitter<MalwareSample[]>();
  @Output() back = new EventEmitter<void>();

  readonly uploadedSamples = signal<MalwareSample[]>([]);
  readonly sampleUploading = signal(false);
  readonly sampleDragOver = signal(false);

  onSampleFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      this.uploadSampleFile(files[i]);
    }
    input.value = '';
  }

  onSampleDrop(event: DragEvent): void {
    event.preventDefault();
    this.sampleDragOver.set(false);
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      this.uploadSampleFile(files[i]);
    }
  }

  onSampleDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onSampleDragEnter(event: DragEvent): void {
    event.preventDefault();
    this.sampleDragOver.set(true);
  }

  onSampleDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.sampleDragOver.set(false);
  }

  private uploadSampleFile(file: File): void {
    if (!this.engagementId) {
      this.notify.error('Engagement must be created before uploading samples.');
      return;
    }
    this.sampleUploading.set(true);
    this.engService.uploadSample(this.engagementId, file).subscribe({
      next: (sample) => {
        this.uploadedSamples.update((list) => [...list, sample]);
        this.sampleUploading.set(false);
      },
      error: (err) => {
        this.sampleUploading.set(false);
        const detail = err?.error?.file?.[0] || err?.error?.detail || err?.error?.error || 'Failed to upload sample.';
        this.notify.error(detail);
      },
    });
  }

  removeSample(sampleId: string): void {
    if (!this.engagementId) return;
    this.engService.deleteSample(this.engagementId, sampleId).subscribe({
      next: () => {
        this.uploadedSamples.update((list) => list.filter((s) => s.id !== sampleId));
        this.notify.success('Sample removed.');
      },
      error: () => this.notify.error('Failed to remove sample.'),
    });
  }

  canProceed(): boolean {
    return this.uploadedSamples().length > 0;
  }

  onProceed(): void {
    if (!this.canProceed()) return;
    this.proceed.emit(this.uploadedSamples());
  }

  onBack(): void {
    this.back.emit();
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}
