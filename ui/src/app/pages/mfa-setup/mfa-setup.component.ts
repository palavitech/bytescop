import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/core/auth/auth.service';
import { MfaService } from '../../services/core/auth/mfa.service';
import { TokenService } from '../../services/core/auth/token.service';
import { UserProfileService } from '../../services/core/profile/user-profile.service';
import { NotificationService } from '../../services/core/notify/notification.service';

type MfaSetupStep = 'loading' | 'enroll' | 'confirm' | 'done';

@Component({
  selector: 'app-mfa-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mfa-setup.component.html',
  styleUrls: ['../auth-shared.css'],
})
export class MfaSetupComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly mfa = inject(MfaService);
  private readonly tokens = inject(TokenService);
  private readonly profile = inject(UserProfileService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  step: MfaSetupStep = 'loading';
  submitting = false;
  apiError = '';

  // Enrollment data
  qrCode = '';
  secret = '';
  backupCodes: string[] = [];
  backupDownloaded = false;

  // Confirm
  code = '';

  ngOnInit(): void {
    this.startEnrollment();
  }

  get canSubmitConfirm(): boolean {
    return !this.submitting && this.code.trim().length === 6;
  }

  private startEnrollment(): void {
    this.step = 'loading';
    this.apiError = '';

    this.mfa.enroll().subscribe({
      next: (res) => {
        this.qrCode = res.qr_code;
        this.secret = res.secret;
        this.backupCodes = res.backup_codes;
        this.backupDownloaded = false;
        this.step = 'enroll';
      },
      error: (err) => {
        const detail = err?.error?.detail;
        if (detail === 'MFA is already enabled. Disable it first.') {
          // MFA already set up — clear flag and go to dashboard
          this.profile.clearMfaSetupFlag();
          this.router.navigateByUrl('/dashboard');
          return;
        }
        this.apiError = detail || 'Failed to start MFA enrollment.';
        this.step = 'enroll';
      },
    });
  }

  downloadBackupCodes(): void {
    const text = this.backupCodes.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bytescop-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    this.backupDownloaded = true;
  }

  proceedToConfirm(): void {
    this.code = '';
    this.apiError = '';
    this.step = 'confirm';
  }

  onConfirm(): void {
    if (!this.canSubmitConfirm) return;
    this.submitting = true;
    this.apiError = '';

    this.mfa.enrollConfirm(this.code.trim()).subscribe({
      next: (res) => {
        // Cookies are set by the server response — no client-side token storage needed.
        this.profile.clearMfaSetupFlag();
        this.notify.success('MFA enabled successfully!');
        this.step = 'done';

        // Navigate to dashboard after brief delay
        setTimeout(() => this.router.navigateByUrl('/dashboard'), 800);
      },
      error: (err) => {
        this.submitting = false;
        this.apiError = err?.error?.detail || 'Invalid code. Please try again.';
      },
    });
  }

  onLogout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => this.router.navigateByUrl('/login'),
    });
  }
}
