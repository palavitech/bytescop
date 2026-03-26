import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { Engagement, EngagementStatus, ENGAGEMENT_STATUS_LABELS } from '../models/engagement.model';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { OrganizationRef } from '../../organizations/models/organization.model';

export interface EngagementFormValue {
  name: string;
  client_id: string | null;
  status: EngagementStatus;
  start_date: string;
  end_date: string;
  description: string;
  notes: string;
}

@Component({
  selector: 'app-engagement-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagement-form.component.html',
})
export class EngagementFormComponent implements OnInit {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() engagement: Engagement | null = null;
  @Input() saving = false;
  @Input() prefill: Partial<Engagement> | null = null;

  @Output() readonly formSubmit = new EventEmitter<EngagementFormValue>();
  @Output() readonly formCancel = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly orgService = inject(OrganizationsService);

  form!: FormGroup;
  organizations$: Observable<OrganizationRef[]> = this.orgService.ref();

  readonly statuses: { value: EngagementStatus; label: string }[] = Object.entries(ENGAGEMENT_STATUS_LABELS)
    .map(([value, label]) => ({ value: value as EngagementStatus, label }));

  ngOnInit(): void {
    const src = this.engagement;
    const pre = this.prefill;

    this.form = this.fb.group({
      name: [src?.name ?? '', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
      client_id: [src?.client_id ?? pre?.client_id ?? null, [Validators.required]],
      status: [src?.status ?? pre?.status ?? 'planned', [Validators.required]],
      start_date: [src?.start_date ?? '', [Validators.required]],
      end_date: [src?.end_date ?? ''],
      description: [src?.description ?? '', [Validators.maxLength(5000)]],
      notes: [src?.notes ?? '', [Validators.maxLength(5000)]],
    });

    if (this.mode === 'edit') {
      this.form.get('client_id')?.disable();
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.formSubmit.emit(this.form.getRawValue());
  }

  onCancel(): void {
    this.formCancel.emit();
  }

  isInvalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
}
