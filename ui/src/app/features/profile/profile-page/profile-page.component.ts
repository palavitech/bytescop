import { Component, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, finalize } from 'rxjs';

import { ProfileService } from '../services/profile.service';
import { PasswordPolicyService, PasswordPolicy } from '../services/password-policy.service';
import { ProfileResponse } from '../models/profile.model';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { MfaService, MfaStatusResponse } from '../../../services/core/auth/mfa.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { environment } from '../../../../environments/environment';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';
import { MfaSetupCardComponent } from '../../../components/mfa-setup-card/mfa-setup-card.component';

type ViewState = 'init' | 'ready' | 'error';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [CommonModule, FormsModule, BcDatePipe, MfaSetupCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.css',
})
export class ProfilePageComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly passwordPolicyService = inject(PasswordPolicyService);
  private readonly mfaService = inject(MfaService);
  private readonly userProfile = inject(UserProfileService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly http = inject(HttpClient);

  @ViewChild('securitySection') securitySection!: ElementRef<HTMLElement>;

  showHelp = false;

  readonly state$ = new BehaviorSubject<ViewState>('init');
  readonly profile$ = new BehaviorSubject<ProfileResponse | null>(null);
  readonly saving$ = new BehaviorSubject(false);
  readonly uploadingAvatar$ = new BehaviorSubject(false);
  readonly removingAvatar$ = new BehaviorSubject(false);
  readonly changingPassword$ = new BehaviorSubject(false);

  firstName = '';
  lastName = '';
  phone = '';
  timezone = '';
  avatarPreviewUrl: string | null = null;
  avatarBusy = false;

  // Password change
  currentPassword = '';
  newPassword = '';
  passwordErrors: string[] = [];

  // Password change — MFA code
  mfaCodeForPassword = '';

  // Password policy
  policy: PasswordPolicy | null = null;
  passwordResetRequired = false;
  passwordResetReason: string | null = null;
  passwordChangedAt: string | null = null;

  // MFA state
  mfaStatus: MfaStatusResponse | null = null;
  mfaStep: 'idle' | 'enrolling' | 'confirm' | 'disabling' | 'regenerating' | 'regenerated' | 're-enroll-verify' | 're-enrolling' = 'idle';
  mfaEnrollQr = '';
  mfaEnrollSecret = '';
  mfaBackupCodes: string[] = [];
  mfaCode = '';
  reEnrollToken = '';
  readonly mfaLoading$ = new BehaviorSubject(false);

  ngOnInit(): void {
    this.loadProfile();
    this.loadPasswordPolicy();
    this.loadMfaStatus();

    this.userProfile.profile$.subscribe(p => {
      this.passwordResetRequired = p?.passwordResetRequired ?? false;
      this.passwordResetReason = p?.passwordResetReason ?? null;
      this.passwordChangedAt = p?.passwordChangedAt ?? null;
      this.cdr.markForCheck();
    });
  }

  goBack(): void {
    this.location.back();
  }

  scrollToSecurity(): void {
    this.securitySection?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  saveName(): void {
    this.saving$.next(true);
    this.profileService.updateProfile({
      first_name: this.firstName,
      last_name: this.lastName,
      phone: this.phone,
      timezone: this.timezone,
    }).pipe(
      finalize(() => this.saving$.next(false)),
    ).subscribe({
      next: (res) => {
        this.profile$.next(res);
        this.userProfile.updateName(res.user.first_name, res.user.last_name);
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to update profile.');
      },
    });
  }

  cancelEdit(): void {
    const p = this.profile$.value;
    if (p) {
      this.firstName = p.user.first_name;
      this.lastName = p.user.last_name;
      this.phone = p.user.phone;
      this.timezone = p.user.timezone;
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Client-side validation
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      this.notify.error('Please select a PNG, JPEG, GIF, or WebP image.');
      input.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      this.notify.error('Image must be under 2 MB.');
      input.value = '';
      return;
    }

    this.uploadingAvatar$.next(true);
    this.avatarBusy = true;
    this.cdr.markForCheck();
    this.profileService.uploadAvatar(file).pipe(
      finalize(() => {
        this.uploadingAvatar$.next(false);
        input.value = '';
      }),
    ).subscribe({
      next: (res) => {
        this.userProfile.updateAvatarUrl(res.avatar_url);
        this.fetchAvatarBlob(res.avatar_url);
        const p = this.profile$.value;
        if (p) {
          this.profile$.next({
            ...p,
            user: { ...p.user, avatar_url: res.avatar_url },
          });
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.avatarBusy = false;
        this.cdr.markForCheck();
        this.notify.error(err?.error?.detail || 'Failed to upload avatar.');
      },
    });
  }

  removeAvatar(): void {
    this.removingAvatar$.next(true);
    this.profileService.deleteAvatar().pipe(
      finalize(() => this.removingAvatar$.next(false)),
    ).subscribe({
      next: () => {
        this.userProfile.updateAvatarUrl(null);
        this.avatarPreviewUrl = null;
        const p = this.profile$.value;
        if (p) {
          this.profile$.next({
            ...p,
            user: { ...p.user, avatar_url: null },
          });
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to remove avatar.');
      },
    });
  }

  getInitials(): string {
    const p = this.profile$.value;
    if (!p) return 'BC';
    const f = p.user.first_name;
    const l = p.user.last_name;
    if (f && l) return (f[0] + l[0]).toUpperCase();
    if (f) return f.substring(0, 2).toUpperCase();
    const local = p.user.email.split('@')[0];
    return local.substring(0, 2).toUpperCase();
  }

  prettyRole(role: string | null): string {
    if (!role) return '--';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }


  buildAvatarUrl(rawUrl: string | null): string | null {
    if (!rawUrl) return null;
    return `${environment.apiUrl}${rawUrl}`;
  }

  /** Fetch avatar as blob via HttpClient (with auth) and set preview URL. */
  private fetchAvatarBlob(rawUrl: string | null): void {
    if (!rawUrl) {
      this.avatarPreviewUrl = null;
      this.avatarBusy = false;
      this.cdr.markForCheck();
      return;
    }
    this.avatarBusy = true;
    this.cdr.markForCheck();
    const url = `${environment.apiUrl}${rawUrl}?t=${Date.now()}`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.avatarPreviewUrl = URL.createObjectURL(blob);
        this.avatarBusy = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.avatarPreviewUrl = null;
        this.avatarBusy = false;
        this.cdr.markForCheck();
      },
    });
  }

  // Password policy checklist
  get meetsMinLength(): boolean {
    return this.newPassword.length >= (this.policy?.min_length ?? 10);
  }

  get hasUppercase(): boolean {
    return /[A-Z]/.test(this.newPassword);
  }

  get hasNumber(): boolean {
    return /[0-9]/.test(this.newPassword);
  }

  get hasSpecial(): boolean {
    return /[!@#$%^&*()\-_=+\[\]{}|;:'",.<>?/`~]/.test(this.newPassword);
  }

  get allPolicyChecksMet(): boolean {
    if (!this.policy) return false;
    if (!this.meetsMinLength) return false;
    if (this.policy.require_uppercase && !this.hasUppercase) return false;
    if (this.policy.require_number && !this.hasNumber) return false;
    if (this.policy.require_special && !this.hasSpecial) return false;
    return true;
  }

  get canSubmitPasswordChange(): boolean {
    if (!this.currentPassword || !this.newPassword || !this.allPolicyChecksMet) return false;
    if (this.mfaStatus?.mfa_enabled && !this.mfaCodeForPassword) return false;
    return true;
  }

  get daysUntilExpiry(): number | null {
    if (!this.policy || this.policy.expiry_days === 0 || !this.passwordChangedAt) return null;
    const changedAt = new Date(this.passwordChangedAt).getTime();
    const expiresAt = changedAt + this.policy.expiry_days * 86400000;
    return Math.ceil((expiresAt - Date.now()) / 86400000);
  }

  changePassword(): void {
    this.passwordErrors = [];
    this.changingPassword$.next(true);
    const mfaCode = this.mfaStatus?.mfa_enabled ? this.mfaCodeForPassword : undefined;
    this.passwordPolicyService.changePassword(this.currentPassword, this.newPassword, mfaCode).pipe(
      finalize(() => this.changingPassword$.next(false)),
    ).subscribe({
      next: () => {
        this.notify.success('Password changed successfully.');
        this.currentPassword = '';
        this.newPassword = '';
        this.mfaCodeForPassword = '';
        this.userProfile.clearPasswordResetFlag();
        this.passwordResetRequired = false;
        this.passwordResetReason = null;
        this.passwordChangedAt = new Date().toISOString();
        this.cdr.markForCheck();
      },
      error: (err) => {
        const data = err?.error;
        if (data?.current_password) {
          this.passwordErrors = Array.isArray(data.current_password) ? data.current_password : [data.current_password];
        } else if (data?.new_password) {
          this.passwordErrors = Array.isArray(data.new_password) ? data.new_password : [data.new_password];
        } else if (data?.mfa_code) {
          this.passwordErrors = Array.isArray(data.mfa_code) ? data.mfa_code : [data.mfa_code];
        } else {
          this.passwordErrors = [data?.detail || 'Failed to change password.'];
        }
        this.cdr.markForCheck();
      },
    });
  }

  // ── MFA operations ──

  startMfaEnroll(): void {
    this.mfaLoading$.next(true);
    this.mfaService.enroll().pipe(
      finalize(() => this.mfaLoading$.next(false)),
    ).subscribe({
      next: (res) => {
        this.mfaEnrollQr = res.qr_code;
        this.mfaEnrollSecret = res.secret;
        this.mfaBackupCodes = res.backup_codes;
        this.mfaStep = 'enrolling';
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to start MFA enrollment.');
      },
    });
  }

  confirmMfaEnroll(): void {
    if (!this.mfaCode.trim()) return;
    this.mfaLoading$.next(true);
    this.mfaService.enrollConfirm(this.mfaCode.trim()).pipe(
      finalize(() => this.mfaLoading$.next(false)),
    ).subscribe({
      next: () => {
        this.notify.success('MFA has been enabled.');
        this.mfaStep = 'idle';
        this.mfaCode = '';
        this.loadMfaStatus();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Invalid code. Please try again.');
      },
    });
  }

  disableMfa(): void {
    if (!this.mfaCode.trim()) return;
    this.mfaLoading$.next(true);
    this.mfaService.disable(this.mfaCode.trim()).pipe(
      finalize(() => this.mfaLoading$.next(false)),
    ).subscribe({
      next: () => {
        this.notify.success('MFA has been disabled.');
        this.mfaStep = 'idle';
        this.mfaCode = '';
        this.loadMfaStatus();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to disable MFA.');
      },
    });
  }

  regenerateBackupCodes(): void {
    if (!this.mfaCode.trim()) return;
    this.mfaLoading$.next(true);
    this.mfaService.regenerateBackupCodes(this.mfaCode.trim()).pipe(
      finalize(() => this.mfaLoading$.next(false)),
    ).subscribe({
      next: (res) => {
        this.mfaBackupCodes = res.backup_codes;
        this.mfaStep = 'regenerated';
        this.mfaCode = '';
        this.loadMfaStatus();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to regenerate backup codes.');
      },
    });
  }

  startMfaReEnroll(): void {
    this.mfaStep = 're-enroll-verify';
    this.mfaCode = '';
  }

  submitReEnrollVerify(): void {
    if (!this.mfaCode.trim()) return;
    this.mfaLoading$.next(true);
    this.mfaService.reEnroll(this.mfaCode.trim()).pipe(
      finalize(() => this.mfaLoading$.next(false)),
    ).subscribe({
      next: (res) => {
        this.mfaEnrollQr = res.qr_code;
        this.mfaEnrollSecret = res.secret;
        this.mfaBackupCodes = res.backup_codes;
        this.reEnrollToken = res.re_enroll_token;
        this.mfaStep = 're-enrolling';
        this.mfaCode = '';
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Invalid code. Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  confirmReEnroll(): void {
    if (!this.mfaCode.trim()) return;
    this.mfaLoading$.next(true);
    this.mfaService.reEnrollConfirm(this.mfaCode.trim(), this.reEnrollToken).pipe(
      finalize(() => this.mfaLoading$.next(false)),
    ).subscribe({
      next: () => {
        this.notify.success('MFA device has been updated.');
        this.mfaStep = 'idle';
        this.mfaCode = '';
        this.reEnrollToken = '';
        this.loadMfaStatus();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Invalid code. Please try again.');
        this.cdr.markForCheck();
      },
    });
  }

  downloadMfaBackupCodes(): void {
    const text = this.mfaBackupCodes.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bytescop-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  cancelMfaAction(): void {
    this.mfaStep = 'idle';
    this.mfaCode = '';
    this.reEnrollToken = '';
    this.mfaBackupCodes = [];
    this.mfaEnrollQr = '';
    this.mfaEnrollSecret = '';
  }

  private loadMfaStatus(): void {
    this.mfaService.getStatus().subscribe({
      next: (status) => {
        this.mfaStatus = status;
        this.cdr.markForCheck();
      },
    });
  }

  private loadPasswordPolicy(): void {
    this.passwordPolicyService.getPolicy().subscribe({
      next: (policy) => {
        this.policy = policy;
        this.cdr.markForCheck();
      },
    });
  }

  private loadProfile(): void {
    this.state$.next('init');
    this.profileService.getProfile().subscribe({
      next: (res) => {
        this.profile$.next(res);
        this.firstName = res.user.first_name;
        this.lastName = res.user.last_name;
        this.phone = res.user.phone;
        this.timezone = res.user.timezone;
        this.fetchAvatarBlob(res.user.avatar_url);
        this.state$.next('ready');
        this.cdr.markForCheck();
      },
      error: () => {
        this.state$.next('error');
      },
    });
  }
}
