import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/core/auth/auth.service';
import { PasswordPolicy } from '../../features/profile/services/password-policy.service';

type ResetStep = 'loading' | 'expired' | 'error' | 'form' | 'submitting' | 'success';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrls: ['../auth-shared.css'],
})
export class ResetPasswordComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  step: ResetStep = 'loading';
  errorMessage = '';
  private token = '';

  // From validate response
  mfaRequired = false;
  policy: PasswordPolicy | null = null;

  // Form fields
  password = '';
  passwordConfirm = '';
  mfaCode = '';
  apiError = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.step = 'error';
      this.errorMessage = 'No reset token found. Please check your email for the correct link.';
      return;
    }
    this.validateToken();
  }

  private validateToken(): void {
    this.auth.validateResetToken(this.token).subscribe({
      next: (res) => {
        this.mfaRequired = res.mfa_required;
        this.policy = res.password_policy as PasswordPolicy;
        this.step = 'form';
      },
      error: (err) => {
        const code = err?.error?.code;
        if (code === 'token_expired') {
          this.step = 'expired';
          this.errorMessage = err?.error?.detail ?? 'This reset link has expired.';
        } else {
          this.step = 'error';
          this.errorMessage = err?.error?.detail ?? 'Invalid reset link.';
        }
      },
    });
  }

  // Password policy checklist
  get meetsMinLength(): boolean {
    return this.password.length >= (this.policy?.min_length ?? 10);
  }

  get hasUppercase(): boolean {
    return /[A-Z]/.test(this.password);
  }

  get hasNumber(): boolean {
    return /[0-9]/.test(this.password);
  }

  get hasSpecial(): boolean {
    return /[!@#$%^&*()\-_=+\[\]{}|;:'",.<>?/`~]/.test(this.password);
  }

  get allPolicyChecksMet(): boolean {
    if (!this.policy) return false;
    if (!this.meetsMinLength) return false;
    if (this.policy.require_uppercase && !this.hasUppercase) return false;
    if (this.policy.require_number && !this.hasNumber) return false;
    if (this.policy.require_special && !this.hasSpecial) return false;
    return true;
  }

  get passwordsMatch(): boolean {
    return this.password.length > 0
      && this.passwordConfirm.length > 0
      && this.password === this.passwordConfirm;
  }

  get canSubmit(): boolean {
    if (this.step !== 'form') return false;
    if (!this.allPolicyChecksMet || !this.passwordsMatch) return false;
    if (this.mfaRequired && this.mfaCode.trim().length < 6) return false;
    return true;
  }

  onSubmit(): void {
    if (!this.canSubmit) return;
    this.step = 'submitting';
    this.apiError = '';

    this.auth.resetPassword(
      this.token,
      this.password,
      this.passwordConfirm,
      this.mfaRequired ? this.mfaCode.trim() : undefined,
    ).subscribe({
      next: () => {
        this.step = 'success';
      },
      error: (err) => {
        this.step = 'form';
        const data = err?.error;
        if (data?.detail) {
          this.apiError = data.detail;
        } else if (data?.password) {
          this.apiError = Array.isArray(data.password) ? data.password.join(' ') : data.password;
        } else if (data?.mfa_code) {
          this.apiError = Array.isArray(data.mfa_code) ? data.mfa_code.join(' ') : data.mfa_code;
        } else if (data?.code === 'token_expired') {
          this.step = 'expired';
          this.errorMessage = data?.detail ?? 'This reset link has expired.';
        } else {
          this.apiError = 'Something went wrong. Please try again.';
        }
      },
    });
  }
}
