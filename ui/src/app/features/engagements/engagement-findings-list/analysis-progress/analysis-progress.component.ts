import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalysisStep } from '../../../../services/core/jobs/jobs.service';

@Component({
  selector: 'app-analysis-progress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './analysis-progress.component.html',
  styleUrl: './analysis-progress.component.css',
})
export class AnalysisProgressComponent {
  @Input() filename = '';
  @Input() steps: AnalysisStep[] = [];
  @Input() findingsCreated = 0;
  @Input() totalSteps = 0;
  @Input() status: 'running' | 'done' | 'failed' = 'running';
  @Input() errorMessage = '';

  @Output() dismissed = new EventEmitter<void>();

  get progressPercent(): number {
    if (this.totalSteps === 0) return 0;
    const done = this.steps.filter(s => s.status === 'done').length;
    return Math.round((done / this.totalSteps) * 100);
  }

  dismiss(): void {
    this.dismissed.emit();
  }
}
