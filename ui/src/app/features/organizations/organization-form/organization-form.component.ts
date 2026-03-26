import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientStatus, Organization } from '../models/organization.model';

export interface OrganizationFormValue {
  name: string;
  website: string;
  status: ClientStatus;
  notes: string;
}

@Component({
  selector: 'app-organization-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organization-form.component.html',
})
export class OrganizationFormComponent implements OnInit {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() organization: Organization | null = null;
  @Input() saving = false;

  @Output() readonly formSubmit = new EventEmitter<OrganizationFormValue>();
  @Output() readonly formCancel = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  form!: FormGroup;

  ngOnInit(): void {
    this.form = this.fb.group({
      name: [this.organization?.name ?? '', Validators.required],
      website: [this.organization?.website ?? ''],
      status: [this.organization?.status ?? 'active'],
      notes: [this.organization?.notes ?? ''],
    });
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
}
