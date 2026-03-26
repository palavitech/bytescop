import { AfterViewInit, Component, ElementRef, inject, ViewChild, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, TenantInfo } from '../../services/core/auth/auth.service';
import { MfaService } from '../../services/core/auth/mfa.service';
import { TokenService } from '../../services/core/auth/token.service';
import { NotificationService } from '../../services/core/notify/notification.service';

type LoginStep = 1 | 2 | 'email-verify' | 'mfa-verify' | 'mfa-setup' | 'mfa-setup-confirm';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['../auth-shared.css'],
})
export class LoginComponent implements AfterViewInit {
  @ViewChild('emailInput') private readonly emailInput!: ElementRef<HTMLInputElement>;
  @ViewChildren('mfaCodeInput') private readonly mfaCodeInputs!: QueryList<ElementRef<HTMLInputElement>>;

  private readonly auth = inject(AuthService);
  private readonly mfa = inject(MfaService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(NotificationService);

  // Step 1 fields
  email = '';
  password = '';
  rememberMe = false;

  // Step state
  step: LoginStep = 1;
  tenants: TenantInfo[] = [];
  submitting = false;
  selectedTenantSlug = '';
  apiError = '';

  // Tenant closed banner
  tenantClosedBanner = false;

  // Email verification state
  resendingVerification = false;
  verificationResent = false;

  // MFA state
  mfaToken = '';
  mfaCode = '';
  mfaSetupQr = '';
  mfaSetupSecret = '';
  mfaBackupCodes: string[] = [];
  mfaBackupDownloaded = false;

  constructor() {
    this.tenantClosedBanner = this.route.snapshot.queryParamMap.get('reason') === 'tenant_closed';
  }

  ngAfterViewInit(): void {
    this.emailInput.nativeElement.focus();
    // Auto-focus MFA code input whenever it appears in the DOM
    this.mfaCodeInputs.changes.subscribe((list: QueryList<ElementRef<HTMLInputElement>>) => {
      list.first?.nativeElement.focus();
    });
  }

  get canSubmitStep1(): boolean {
    return !this.submitting && !!this.email.trim() && !!this.password;
  }

  get canSubmitMfaVerify(): boolean {
    return !this.submitting && this.mfaCode.trim().length >= 6;
  }

  get canSubmitMfaSetupConfirm(): boolean {
    return !this.submitting && this.mfaCode.trim().length === 6;
  }

  onStep1(): void {
    if (!this.canSubmitStep1) return;
    this.submitting = true;
    this.apiError = '';

    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        this.submitting = false;
        this.tenants = res.tenants;

        if (this.tenants.length === 1) {
          this.selectTenant(this.tenants[0]);
        } else if (this.tenants.length === 0) {
          this.apiError = 'No active tenants found for this account.';
        } else {
          this.step = 2;
        }
      },
      error: (err) => {
        this.submitting = false;
        this.apiError = this.extractError(err);
      },
    });
  }

  selectTenant(tenant: TenantInfo): void {
    if (this.submitting) return;
    this.submitting = true;
    this.selectedTenantSlug = tenant.slug;
    this.apiError = '';
    this.auth.selectTenant(this.email, this.password, tenant.id, this.rememberMe).subscribe({
      next: (res) => {
        if (res.mfa_required) {
          this.submitting = false;
          this.mfaToken = res.mfa_token || '';
          this.mfaCode = '';

          if (res.mfa_setup_required) {
            // User needs to set up MFA before proceeding
            this.startMfaSetup();
          } else {
            // User has MFA, needs to verify
            this.step = 'mfa-verify';
          }
          return;
        }

        this.router.navigateByUrl('/dashboard');
      },
      error: (err) => {
        this.submitting = false;
        if (err?.error?.code === 'email_not_verified') {
          this.verificationResent = false;
          this.step = 'email-verify';
          return;
        }
        this.apiError = this.extractError(err);
        this.notify.error(this.apiError);
      },
    });
  }

  private startMfaSetup(): void {
    this.submitting = true;
    this.mfa.setup(this.mfaToken).subscribe({
      next: (res) => {
        this.submitting = false;
        this.mfaToken = res.mfa_token;
        this.mfaSetupQr = res.qr_code;
        this.mfaSetupSecret = res.secret;
        this.mfaBackupCodes = res.backup_codes;
        this.mfaBackupDownloaded = false;
        this.step = 'mfa-setup';
      },
      error: (err) => {
        this.submitting = false;
        this.apiError = this.extractError(err);
      },
    });
  }

  onMfaVerify(): void {
    if (!this.canSubmitMfaVerify) return;
    this.submitting = true;
    this.apiError = '';

    this.mfa.verify(this.mfaToken, this.mfaCode.trim(), this.rememberMe).subscribe({
      next: (res) => {
        this.auth.completeAuthFromMfa(res as any);
        this.router.navigateByUrl('/dashboard');
      },
      error: (err) => {
        this.submitting = false;
        this.apiError = this.extractError(err);
      },
    });
  }

  proceedToMfaConfirm(): void {
    this.mfaCode = '';
    this.apiError = '';
    this.step = 'mfa-setup-confirm';
  }

  onMfaSetupConfirm(): void {
    if (!this.canSubmitMfaSetupConfirm) return;
    this.submitting = true;
    this.apiError = '';

    this.mfa.setupConfirm(this.mfaToken, this.mfaCode.trim(), this.rememberMe).subscribe({
      next: (res) => {
        this.auth.completeAuthFromMfa(res as any);
        this.router.navigateByUrl('/dashboard');
      },
      error: (err) => {
        this.submitting = false;
        this.apiError = this.extractError(err);
      },
    });
  }

  downloadBackupCodes(): void {
    const text = this.mfaBackupCodes.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bytescop-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    this.mfaBackupDownloaded = true;
  }

  resendVerification(): void {
    if (this.resendingVerification) return;
    this.resendingVerification = true;
    this.apiError = '';

    this.auth.resendVerification(this.email, this.password).subscribe({
      next: () => {
        this.resendingVerification = false;
        this.verificationResent = true;
      },
      error: (err) => {
        this.resendingVerification = false;
        this.apiError = this.extractError(err);
      },
    });
  }

  backToStep1(): void {
    this.step = 1;
    this.tenants = [];
    this.apiError = '';
    this.selectedTenantSlug = '';
    this.mfaToken = '';
    this.mfaCode = '';
  }

  backToStep2(): void {
    this.step = 2;
    this.apiError = '';
    this.mfaToken = '';
    this.mfaCode = '';
  }

  private extractError(err: any): string {
    const data = err?.error;
    if (!data) return 'Something went wrong. Please try again.';
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    if (data.non_field_errors) {
      return Array.isArray(data.non_field_errors)
        ? data.non_field_errors.join(' ')
        : data.non_field_errors;
    }
    // API envelope: { message, errors: { field: [...] } }
    const errors = data.errors ?? data;
    const msgs: string[] = [];
    for (const key of Object.keys(errors)) {
      if (key === 'message' || key === 'request_id') continue;
      const val = errors[key];
      if (Array.isArray(val)) msgs.push(...val);
      else if (typeof val === 'string') msgs.push(val);
    }
    return msgs.length ? msgs.join(' ') : (data.message || 'Something went wrong. Please try again.');
  }
}
