import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PasswordPolicy } from '../../features/profile/services/password-policy.service';

type InviteStep = 'loading' | 'error' | 'welcome' | 'submitting' | 'success';

interface ValidateResponse {
  valid: boolean;
  session: string;
  password_policy: PasswordPolicy;
  email: string;
  tenant_name: string;
  logo_url: string | null;
}

@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './accept-invite.component.html',
  styleUrls: ['../auth-shared.css', './accept-invite.component.css'],
})
export class AcceptInviteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  step: InviteStep = 'loading';
  errorMessage = '';

  // From validate response
  session = '';
  email = '';
  tenantName = '';
  logoUrl: string | null = null;
  policy: PasswordPolicy | null = null;

  // Password form
  password = '';
  passwordConfirm = '';
  apiError = '';

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.step = 'error';
      this.errorMessage = 'No invitation token found. Please check your email for the correct link.';
      return;
    }
    this.validateToken(token);
  }

  private validateToken(token: string): void {
    this.http.post<ValidateResponse>(
      `${this.apiUrl}/api/auth/accept-invite/validate/`,
      { token },
    ).subscribe({
      next: (res) => {
        this.session = res.session;
        this.email = res.email;
        this.tenantName = res.tenant_name;
        this.logoUrl = res.logo_url;
        this.policy = res.password_policy;
        this.step = 'welcome';
      },
      error: (err) => {
        this.step = 'error';
        this.errorMessage = err?.error?.detail
          || 'This invitation link is invalid or has expired.';
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
    return this.step === 'welcome'
      && this.allPolicyChecksMet
      && this.passwordsMatch;
  }

  onSubmit(): void {
    if (!this.canSubmit) return;
    this.step = 'submitting';
    this.apiError = '';

    this.http.post<{ detail: string }>(
      `${this.apiUrl}/api/auth/accept-invite/set-password/`,
      {
        session: this.session,
        password: this.password,
        password_confirm: this.passwordConfirm,
      },
    ).subscribe({
      next: () => {
        this.step = 'success';
      },
      error: (err) => {
        this.step = 'welcome';
        const data = err?.error;
        if (data?.detail) {
          this.apiError = data.detail;
        } else if (data?.password) {
          this.apiError = Array.isArray(data.password)
            ? data.password.join(' ')
            : data.password;
        } else if (data?.password_confirm) {
          this.apiError = Array.isArray(data.password_confirm)
            ? data.password_confirm.join(' ')
            : data.password_confirm;
        } else {
          this.apiError = 'Something went wrong. Please try again.';
        }
      },
    });
  }

  goToLogin(): void {
    this.router.navigateByUrl('/login');
  }
}
