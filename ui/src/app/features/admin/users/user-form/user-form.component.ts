import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TenantMember } from '../models/member.model';
import { MemberGroup } from '../models/member.model';
import { PasswordPolicy, PasswordPolicyService } from '../../../profile/services/password-policy.service';

export type UserFormValue = {
  email: string;
  first_name: string;
  last_name: string;
  password?: string;
  password_confirm?: string;
  group_ids: string[];
};

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.css',
})
export class UserFormComponent implements OnInit {
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() member: TenantMember | null = null;
  @Input() availableGroups: MemberGroup[] = [];
  @Input() saving = false;

  @Output() readonly formSubmit = new EventEmitter<UserFormValue>();
  @Output() readonly formCancel = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly policyService = inject(PasswordPolicyService);
  form!: FormGroup;
  policy: PasswordPolicy | null = null;

  ngOnInit(): void {
    this.form = this.fb.group({
      email: [this.member?.user?.email ?? '', [Validators.required, Validators.email]],
      first_name: [this.member?.user?.first_name ?? '', Validators.required],
      last_name: [this.member?.user?.last_name ?? '', Validators.required],
      group_ids: [this.member?.groups?.map(g => g.id) ?? []],
    });

    if (this.mode === 'create') {
      this.form.addControl('password', this.fb.control('', [Validators.required]));
      this.form.addControl('password_confirm', this.fb.control('', [Validators.required]));
      this.policyService.getPolicy().subscribe({
        next: (p) => this.policy = p,
      });
    }

    if (this.mode === 'edit') {
      this.form.get('email')?.disable();
    }
  }

  get passwordValue(): string {
    return this.form.get('password')?.value ?? '';
  }

  get passwordMismatch(): boolean {
    const pw = this.form.get('password')?.value;
    const confirm = this.form.get('password_confirm')?.value;
    return !!pw && !!confirm && pw !== confirm;
  }

  get meetsMinLength(): boolean {
    return this.passwordValue.length >= (this.policy?.min_length ?? 8);
  }

  get hasUppercase(): boolean {
    return /[A-Z]/.test(this.passwordValue);
  }

  get hasNumber(): boolean {
    return /\d/.test(this.passwordValue);
  }

  get hasSpecial(): boolean {
    return /[!@#$%^&*()\-_=+\[\]{}|;:'",.<>?/`~]/.test(this.passwordValue);
  }

  isGroupSelected(groupId: string): boolean {
    const ids: string[] = this.form.get('group_ids')?.value ?? [];
    return ids.includes(groupId);
  }

  toggleGroup(groupId: string): void {
    const ids: string[] = [...(this.form.get('group_ids')?.value ?? [])];
    const idx = ids.indexOf(groupId);
    if (idx >= 0) {
      ids.splice(idx, 1);
    } else {
      ids.push(groupId);
    }
    this.form.get('group_ids')?.setValue(ids);
  }

  onSubmit(): void {
    if (this.form.invalid || this.passwordMismatch) {
      this.form.markAllAsTouched();
      return;
    }
    this.formSubmit.emit(this.form.getRawValue());
  }

  onCancel(): void {
    this.formCancel.emit();
  }
}
