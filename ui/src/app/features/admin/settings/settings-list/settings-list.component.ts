import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';

import { SettingsService, LicenseStatus } from '../services/settings.service';
import { SettingDefinition } from '../models/setting.model';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { DateFormatService, DateFormatKey } from '../../../../services/core/date-format.service';
import { HasPermissionDirective } from '../../../../components/directives/has-permission.directive';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { SubscriptionInfo } from '../../../../services/core/profile/user-profile.types';
import { AuthService } from '../../../../services/core/auth/auth.service';
import { TokenService } from '../../../../services/core/auth/token.service';
import { Router } from '@angular/router';

type ViewState = 'init' | 'ready' | 'error';
type ClosureStep = 'warn' | 'acknowledge' | 'mfa' | 'confirm';

interface SettingRow extends SettingDefinition {
  editValue: string;
  dirty: boolean;
  saving: boolean;
}

interface SettingGroup {
  name: string;
  settings: SettingRow[];
}

interface ViewModel {
  state: ViewState;
  groups: SettingGroup[];
  totalCount: number;
}

@Component({
  selector: 'app-settings-list',
  standalone: true,
  imports: [CommonModule, FormsModule, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-list.component.html',
  styleUrl: './settings-list.component.css',
})
export class SettingsListComponent implements OnDestroy {
  private readonly settingsService = inject(SettingsService);
  private readonly notify = inject(NotificationService);
  private readonly location = inject(Location);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly dateFormatService = inject(DateFormatService);
  private readonly userProfile = inject(UserProfileService);
  private readonly auth = inject(AuthService);
  private readonly tokens = inject(TokenService);
  private readonly router = inject(Router);

  get subscriptionSnapshot(): SubscriptionInfo | null {
    return this.userProfile.currentSubscription();
  }

  get subscriptionLimits(): { label: string; description: string; value: number }[] {
    const sub = this.subscriptionSnapshot;
    if (!sub?.limits) return [];
    return [
      { label: 'Team Members', description: 'Maximum number of users in your tenant.', value: sub.limits.max_members },
      { label: 'Clients', description: 'Maximum number of clients.', value: sub.limits.max_clients },
      { label: 'Assets', description: 'Maximum number of assets across all clients.', value: sub.limits.max_assets },
      { label: 'Engagements', description: 'Maximum number of engagements.', value: sub.limits.max_engagements },
      { label: 'Findings per Engagement', description: 'Maximum findings allowed in a single engagement.', value: sub.limits.max_findings_per_engagement },
      { label: 'Images per Finding', description: 'Maximum images that can be embedded in a single finding.', value: sub.limits.max_images_per_finding },
    ];
  }

  showHelp = false;

  // Logo state
  logoObjectUrl = signal<string | null>(null);
  logoLoading = signal(false);
  logoUploading = signal(false);

  // License state
  licenseStatus = signal<LicenseStatus | null>(null);
  licenseLoading = signal(false);
  licenseActivating = signal(false);
  licenseRemoving = signal(false);
  licenseKey = '';
  licenseError = signal('');
  licenseShowInput = signal(false);

  // Tenant name (for delete workspace confirmation)
  tenantName = '';

  // Closure wizard state
  showClosureWizard = signal(false);
  closureStep = signal<ClosureStep>('warn');
  closureAcknowledge = signal(false);
  closureMfaCode = '';
  closureWorkspaceName = '';
  closureSubmitting = signal(false);
  closureError = signal('');

  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  readonly vm$ = this.refresh$.pipe(
    switchMap(() =>
      this.settingsService.list().pipe(
        map(settings => this.buildViewModel(settings)),
        catchError(() => of<ViewModel>({
          state: 'error',
          groups: [],
          totalCount: 0,
        })),
      ),
    ),
  );

  constructor() {
    this.loadLogo();
    this.loadLicense();

    this.userProfile.profile$.subscribe(p => {
      this.tenantName = p?.tenant?.name ?? '';
    });

    // If subscription data is missing (stale cached profile), refresh from API
    if (!this.userProfile.currentSubscription()) {
      this.userProfile.refreshProfile().subscribe({
        next: () => this.cdr.markForCheck(),
        error: () => {},
      });
    }
  }

  ngOnDestroy(): void {
    const url = this.logoObjectUrl();
    if (url) URL.revokeObjectURL(url);
  }

  private buildViewModel(settings: SettingDefinition[]): ViewModel {
    const groupMap = new Map<string, SettingRow[]>();

    for (const s of settings) {
      const row: SettingRow = {
        ...s,
        editValue: s.value,
        dirty: false,
        saving: false,
      };
      const list = groupMap.get(s.group) ?? [];
      list.push(row);
      groupMap.set(s.group, list);
    }

    const groups: SettingGroup[] = [];
    for (const [name, rows] of groupMap) {
      rows.sort((a, b) => a.order - b.order);
      groups.push({ name, settings: rows });
    }
    groups.sort((a, b) => a.settings[0].order - b.settings[0].order);

    return {
      state: 'ready',
      groups,
      totalCount: settings.length,
    };
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  refresh(): void {
    this.refresh$.next();
  }

  onEditValueChange(row: SettingRow): void {
    row.dirty = row.editValue !== row.value;
  }

  onToggleChange(row: SettingRow): void {
    row.dirty = row.editValue !== row.value;
    if (row.dirty) {
      this.save(row);
    }
  }

  save(row: SettingRow): void {
    row.saving = true;
    this.settingsService.upsert(row.key, row.editValue).subscribe({
      next: (updated) => {
        row.value = updated.value;
        row.has_value = updated.has_value;
        row.updated_at = updated.updated_at;
        row.updated_by = updated.updated_by;
        row.dirty = false;
        row.saving = false;
        if (row.key === 'date_format') {
          this.dateFormatService.setFormat(row.value as DateFormatKey);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        row.saving = false;
        this.notify.error(`Failed to save ${row.label}.`);
        this.cdr.markForCheck();
      },
    });
  }

  resetSetting(row: SettingRow): void {
    row.saving = true;
    this.settingsService.reset(row.key).subscribe({
      next: (updated) => {
        row.value = updated.value;
        row.editValue = updated.value;
        row.has_value = updated.has_value;
        row.updated_at = updated.updated_at;
        row.updated_by = updated.updated_by;
        row.dirty = false;
        row.saving = false;
        this.cdr.markForCheck();
      },
      error: () => {
        row.saving = false;
        this.notify.error(`Failed to reset ${row.label}.`);
        this.cdr.markForCheck();
      },
    });
  }

  // ── Logo ──────────────────────────────────────────────────────────────────

  private loadLogo(): void {
    this.logoLoading.set(true);
    this.settingsService.hasLogo().subscribe({
      next: ({ has_logo }) => {
        this.logoLoading.set(false);
        if (has_logo) this.fetchLogoBlob();
      },
      error: () => this.logoLoading.set(false),
    });
  }

  private fetchLogoBlob(): void {
    this.logoLoading.set(true);
    this.settingsService.getLogoBlob().subscribe({
      next: blob => {
        const prev = this.logoObjectUrl();
        if (prev) URL.revokeObjectURL(prev);
        this.logoObjectUrl.set(URL.createObjectURL(blob));
        this.logoLoading.set(false);
      },
      error: () => this.logoLoading.set(false),
    });
  }

  onLogoFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      this.notify.error('Logo must be 1 MB or less.');
      input.value = '';
      return;
    }

    this.logoUploading.set(true);
    this.settingsService.uploadLogo(file).subscribe({
      next: () => {
        this.logoUploading.set(false);
        this.fetchLogoBlob();
        input.value = '';
      },
      error: (err) => {
        this.logoUploading.set(false);
        const msg = err?.error?.detail || 'Failed to upload logo.';
        this.notify.error(msg);
        input.value = '';
      },
    });
  }

  removeLogo(): void {
    this.settingsService.deleteLogo().subscribe({
      next: () => {
        const prev = this.logoObjectUrl();
        if (prev) URL.revokeObjectURL(prev);
        this.logoObjectUrl.set(null);
      },
      error: () => this.notify.error('Failed to remove logo.'),
    });
  }

  // ── License ────────────────────────────────────────────────────────────

  private loadLicense(): void {
    this.licenseLoading.set(true);
    this.settingsService.getLicenseStatus().subscribe({
      next: (lic) => {
        this.licenseStatus.set(lic);
        this.licenseLoading.set(false);
      },
      error: () => this.licenseLoading.set(false),
    });
  }

  showLicenseInput(): void {
    this.licenseShowInput.set(true);
    this.licenseKey = '';
    this.licenseError.set('');
  }

  cancelLicenseInput(): void {
    this.licenseShowInput.set(false);
    this.licenseKey = '';
    this.licenseError.set('');
  }

  activateLicense(): void {
    const key = this.licenseKey.trim();
    if (!key) return;

    this.licenseActivating.set(true);
    this.licenseError.set('');
    this.settingsService.activateLicense(key).subscribe({
      next: (lic) => {
        this.licenseStatus.set(lic);
        this.licenseActivating.set(false);
        this.licenseShowInput.set(false);
        this.licenseKey = '';
        if (lic.expired) {
          this.notify.warning('License key accepted but is expired. Features remain at Community Edition.');
        } else {
          this.notify.success(`License activated — ${lic.plan} plan.`);
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.licenseActivating.set(false);
        this.licenseError.set(err?.error?.detail || 'Failed to activate license key.');
        this.cdr.markForCheck();
      },
    });
  }

  removeLicenseKey(): void {
    this.licenseRemoving.set(true);
    this.settingsService.removeLicense().subscribe({
      next: (lic) => {
        this.licenseStatus.set(lic);
        this.licenseRemoving.set(false);
        this.licenseShowInput.set(false);
        this.notify.success('License removed — reverted to Community Edition.');
        this.cdr.markForCheck();
      },
      error: () => {
        this.licenseRemoving.set(false);
        this.notify.error('Failed to remove license.');
        this.cdr.markForCheck();
      },
    });
  }

  // ── Tenant Closure ─────────────────────────────────────────────────────

  openClosureWizard(): void {
    this.closureStep.set('warn');
    this.closureAcknowledge.set(false);
    this.closureMfaCode = '';
    this.closureWorkspaceName = '';
    this.closureError.set('');
    this.showClosureWizard.set(true);
  }

  cancelClosure(): void {
    this.showClosureWizard.set(false);
  }

  closureNextStep(): void {
    const current = this.closureStep();
    if (current === 'warn') this.closureStep.set('acknowledge');
    else if (current === 'acknowledge') this.closureStep.set('mfa');
  }

  closurePrevStep(): void {
    const current = this.closureStep();
    if (current === 'acknowledge') this.closureStep.set('warn');
    else if (current === 'mfa') this.closureStep.set('acknowledge');
    else if (current === 'confirm') this.closureStep.set('mfa');
  }

  submitClosureVerifyMfa(): void {
    if (this.closureMfaCode.trim().length < 6) return;

    this.closureSubmitting.set(true);
    this.closureError.set('');

    this.settingsService.verifyClosureMfa(this.closureMfaCode.trim()).subscribe({
      next: () => {
        this.closureSubmitting.set(false);
        this.closureStep.set('confirm');
      },
      error: err => {
        this.closureSubmitting.set(false);
        this.closureError.set(err?.error?.detail || 'MFA verification failed.');
      },
    });
  }

  submitClosureExecute(): void {
    if (!this.closureWorkspaceName.trim()) return;

    this.closureSubmitting.set(true);
    this.closureError.set('');

    this.settingsService.executeClosure(
      this.closureWorkspaceName.trim(),
    ).subscribe({
      next: (res) => {
        this.auth.setUser(null);
        this.tokens.clear();
        this.router.navigateByUrl(`/closing?closure_id=${res.closure_id}`);
      },
      error: err => {
        this.closureSubmitting.set(false);
        this.closureError.set(err?.error?.detail || 'Failed to delete workspace.');
      },
    });
  }
}
