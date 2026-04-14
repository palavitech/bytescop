import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { Subject, of, throwError } from 'rxjs';

import { SettingsListComponent } from './settings-list.component';
import { SettingsService } from '../services/settings.service';
import { SettingDefinition } from '../models/setting.model';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { PermissionService } from '../../../../services/core/auth/permission.service';
import { DateFormatService } from '../../../../services/core/date-format.service';
import { AuthService } from '../../../../services/core/auth/auth.service';
import { TokenService } from '../../../../services/core/auth/token.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { Router } from '@angular/router';

const mockSetting: SettingDefinition = {
  key: 'test_key',
  label: 'Test Setting',
  description: 'A test setting',
  setting_type: 'text',
  choices: [],
  default: 'default_val',
  group: 'General',
  order: 1,
  value: 'current_val',
  has_value: true,
  updated_at: '2025-01-01T00:00:00Z',
  updated_by: 'admin',
};

const mockBoolSetting: SettingDefinition = {
  key: 'bool_key',
  label: 'Bool Setting',
  description: 'A boolean setting',
  setting_type: 'boolean',
  choices: [],
  default: 'false',
  group: 'General',
  order: 2,
  value: 'false',
  has_value: true,
  updated_at: '2025-01-01T00:00:00Z',
  updated_by: 'admin',
};

const mockChoiceSetting: SettingDefinition = {
  key: 'choice_key',
  label: 'Choice Setting',
  description: 'A choice setting',
  setting_type: 'choice',
  choices: ['opt1', 'opt2', 'opt3'],
  default: 'opt1',
  group: 'Security',
  order: 10,
  value: 'opt2',
  has_value: true,
  updated_at: '2025-01-01T00:00:00Z',
  updated_by: 'admin',
};

const mockDateFormatSetting: SettingDefinition = {
  key: 'date_format',
  label: 'Date Format',
  description: 'Date display format',
  setting_type: 'choice',
  choices: ['MMM d, yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'],
  default: 'MMM d, yyyy',
  group: 'General',
  order: 3,
  value: 'MMM d, yyyy',
  has_value: true,
  updated_at: null,
  updated_by: null,
};

describe('SettingsListComponent', () => {
  let fixture: ComponentFixture<SettingsListComponent>;
  let component: SettingsListComponent;
  let settingsServiceSpy: jasmine.SpyObj<SettingsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let dateFormatSpy: jasmine.SpyObj<DateFormatService>;
  let authSpy: jasmine.SpyObj<AuthService>;
  let tokensSpy: jasmine.SpyObj<TokenService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    settingsServiceSpy = jasmine.createSpyObj('SettingsService', [
      'list', 'upsert', 'reset', 'hasLogo',
      'deleteLogo', 'getLogoBlob', 'uploadLogo',
      'getLicenseStatus', 'activateLicense', 'removeLicense',
      'verifyClosureMfa', 'executeClosure',
    ]);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error', 'warning']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    dateFormatSpy = jasmine.createSpyObj('DateFormatService', ['setFormat']);
    authSpy = jasmine.createSpyObj('AuthService', ['setUser']);
    tokensSpy = jasmine.createSpyObj('TokenService', ['clear']);
    routerSpy = jasmine.createSpyObj('Router', ['navigateByUrl']);
    routerSpy.navigateByUrl.and.returnValue(Promise.resolve(true));

    // Default stubs
    settingsServiceSpy.list.and.returnValue(of([mockSetting, mockBoolSetting, mockChoiceSetting]));
    settingsServiceSpy.hasLogo.and.returnValue(of({ has_logo: false }));
    settingsServiceSpy.getLicenseStatus.and.returnValue(of({ plan: 'community', features: [], max_users: 3, max_workspaces: 1, expired: false, expires_at: null, customer: '', has_key: false }));

    await TestBed.configureTestingModule({
      imports: [SettingsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: settingsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: DateFormatService, useValue: dateFormatSpy },
        { provide: AuthService, useValue: authSpy },
        { provide: TokenService, useValue: tokensSpy },
        { provide: Router, useValue: routerSpy },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
        { provide: UserProfileService, useValue: { profile$: of(null), currentSubscription: () => ({ limits: {} }), refreshProfile: () => of({}) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── Constructor / init ──

  it('should load logo on construction', () => {
    expect(settingsServiceSpy.hasLogo).toHaveBeenCalled();
  });

  it('should load settings via vm$ on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => vm = v);
    tick();

    expect(vm.state).toBe('ready');
    expect(vm.totalCount).toBe(3);
    expect(vm.groups.length).toBe(2); // General + Security
  }));

  it('vm$ should group settings by group name and sort by order', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => vm = v);
    tick();

    const generalGroup = vm.groups.find((g: any) => g.name === 'General');
    const securityGroup = vm.groups.find((g: any) => g.name === 'Security');

    expect(generalGroup).toBeTruthy();
    expect(securityGroup).toBeTruthy();
    expect(generalGroup.settings.length).toBe(2);
    expect(securityGroup.settings.length).toBe(1);

    // General (order 1,2) should come before Security (order 10)
    expect(vm.groups[0].name).toBe('General');
    expect(vm.groups[1].name).toBe('Security');
  }));

  it('vm$ should handle error state', fakeAsync(() => {
    settingsServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));

    let vm: any;
    component.vm$.subscribe(v => vm = v);
    tick();

    expect(vm.state).toBe('error');
    expect(vm.groups).toEqual([]);
    expect(vm.totalCount).toBe(0);
  }));

  it('vm$ rows should have editValue, dirty=false, saving=false', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => vm = v);
    tick();

    const row = vm.groups[0].settings[0];
    expect(row.editValue).toBe('current_val');
    expect(row.dirty).toBe(false);
    expect(row.saving).toBe(false);
  }));

  // ── goBack ──

  it('goBack should call location.back()', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  // ── toggleHelp ──

  it('toggleHelp should toggle showHelp', () => {
    expect(component.showHelp).toBe(false);
    component.toggleHelp();
    expect(component.showHelp).toBe(true);
    component.toggleHelp();
    expect(component.showHelp).toBe(false);
  });

  // ── refresh ──

  it('refresh should trigger a new data load', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    settingsServiceSpy.list.calls.reset();
    component.refresh();
    tick();

    expect(settingsServiceSpy.list).toHaveBeenCalled();
  }));

  // ── onEditValueChange ──

  it('onEditValueChange should set dirty=true when value differs', () => {
    const row: any = { ...mockSetting, editValue: 'new_val', value: 'current_val', dirty: false, saving: false };
    component.onEditValueChange(row);
    expect(row.dirty).toBe(true);
  });

  it('onEditValueChange should set dirty=false when value matches', () => {
    const row: any = { ...mockSetting, editValue: 'current_val', value: 'current_val', dirty: true, saving: false };
    component.onEditValueChange(row);
    expect(row.dirty).toBe(false);
  });

  // ── onToggleChange ──

  it('onToggleChange should auto-save when dirty', () => {
    const row: any = {
      ...mockBoolSetting,
      editValue: 'true',
      value: 'false',
      dirty: false,
      saving: false,
    };

    settingsServiceSpy.upsert.and.returnValue(of({
      ...mockBoolSetting,
      value: 'true',
      has_value: true,
      updated_at: '2025-06-01T00:00:00Z',
      updated_by: 'admin',
    }));

    component.onToggleChange(row);

    // save() is called synchronously and completes, resetting dirty to false
    expect(settingsServiceSpy.upsert).toHaveBeenCalledWith('bool_key', 'true');
    expect(row.dirty).toBe(false); // save completed synchronously
    expect(row.value).toBe('true');
  });

  it('onToggleChange should not save when not dirty', () => {
    const row: any = {
      ...mockBoolSetting,
      editValue: 'false',
      value: 'false',
      dirty: false,
      saving: false,
    };

    component.onToggleChange(row);

    expect(row.dirty).toBe(false);
    expect(settingsServiceSpy.upsert).not.toHaveBeenCalled();
  });

  // ── save ──

  it('save should update row on success', () => {
    const row: any = {
      ...mockSetting,
      editValue: 'new_val',
      dirty: true,
      saving: false,
    };

    settingsServiceSpy.upsert.and.returnValue(of({
      ...mockSetting,
      value: 'new_val',
      has_value: true,
      updated_at: '2025-06-01T00:00:00Z',
      updated_by: 'admin',
    }));

    component.save(row);

    expect(row.saving).toBe(false);
    expect(row.value).toBe('new_val');
    expect(row.dirty).toBe(false);
    expect(row.has_value).toBe(true);
    expect(row.updated_at).toBe('2025-06-01T00:00:00Z');
  });

  it('save should set saving=true during request', () => {
    const row: any = { ...mockSetting, editValue: 'new_val', dirty: true, saving: false };
    const subject = new Subject<any>();
    settingsServiceSpy.upsert.and.returnValue(subject.asObservable());

    component.save(row);
    expect(row.saving).toBe(true);

    subject.next({ ...mockSetting, value: 'new_val' });
    subject.complete();
    expect(row.saving).toBe(false);
  });

  it('save error should reset saving and notify', () => {
    const row: any = { ...mockSetting, editValue: 'new_val', dirty: true, saving: false };
    settingsServiceSpy.upsert.and.returnValue(throwError(() => new Error('fail')));

    component.save(row);

    expect(row.saving).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to save Test Setting.');
  });

  it('save date_format should call dateFormatService.setFormat', () => {
    const row: any = {
      ...mockDateFormatSetting,
      editValue: 'dd/MM/yyyy',
      dirty: true,
      saving: false,
    };

    settingsServiceSpy.upsert.and.returnValue(of({
      ...mockDateFormatSetting,
      value: 'dd/MM/yyyy',
    }));

    component.save(row);

    expect(dateFormatSpy.setFormat).toHaveBeenCalledWith('dd/MM/yyyy' as any);
  });

  it('save non-date_format should not call dateFormatService.setFormat', () => {
    const row: any = { ...mockSetting, editValue: 'new_val', dirty: true, saving: false };
    settingsServiceSpy.upsert.and.returnValue(of({ ...mockSetting, value: 'new_val' }));

    component.save(row);

    expect(dateFormatSpy.setFormat).not.toHaveBeenCalled();
  });

  // ── resetSetting ──

  it('resetSetting should update row to default on success', () => {
    const row: any = {
      ...mockSetting,
      editValue: 'current_val',
      dirty: false,
      saving: false,
    };

    settingsServiceSpy.reset.and.returnValue(of({
      ...mockSetting,
      value: 'default_val',
      has_value: false,
      updated_at: null,
      updated_by: null,
    }));

    component.resetSetting(row);

    expect(row.value).toBe('default_val');
    expect(row.editValue).toBe('default_val');
    expect(row.has_value).toBe(false);
    expect(row.dirty).toBe(false);
    expect(row.saving).toBe(false);
  });

  it('resetSetting error should reset saving and notify', () => {
    const row: any = { ...mockSetting, editValue: 'current_val', dirty: false, saving: false };
    settingsServiceSpy.reset.and.returnValue(throwError(() => new Error('fail')));

    component.resetSetting(row);

    expect(row.saving).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to reset Test Setting.');
  });

  // ── Logo: loadLogo ──

  it('should not fetch logo blob when has_logo is false', () => {
    settingsServiceSpy.hasLogo.and.returnValue(of({ has_logo: false }));
    fixture.detectChanges();

    expect(settingsServiceSpy.getLogoBlob).not.toHaveBeenCalled();
    expect(component.logoLoading()).toBe(false);
  });

  it('should fetch logo blob when has_logo is true', () => {
    settingsServiceSpy.hasLogo.and.returnValue(of({ has_logo: true }));
    settingsServiceSpy.getLogoBlob.and.returnValue(of(new Blob(['img'], { type: 'image/png' })));

    // Re-create component since constructor calls loadLogo
    fixture = TestBed.createComponent(SettingsListComponent);
    component = fixture.componentInstance;

    expect(settingsServiceSpy.getLogoBlob).toHaveBeenCalled();
    expect(component.logoLoading()).toBe(false);
    expect(component.logoObjectUrl()).toBeTruthy();
  });

  it('hasLogo error should set logoLoading to false', () => {
    settingsServiceSpy.hasLogo.and.returnValue(throwError(() => new Error('fail')));

    fixture = TestBed.createComponent(SettingsListComponent);
    component = fixture.componentInstance;

    expect(component.logoLoading()).toBe(false);
  });

  it('fetchLogoBlob error should set logoLoading to false', () => {
    settingsServiceSpy.hasLogo.and.returnValue(of({ has_logo: true }));
    settingsServiceSpy.getLogoBlob.and.returnValue(throwError(() => new Error('fail')));

    fixture = TestBed.createComponent(SettingsListComponent);
    component = fixture.componentInstance;

    expect(component.logoLoading()).toBe(false);
  });

  // ── Logo: onLogoFileChange ──

  it('onLogoFileChange should return early if no file', () => {
    const event = { target: { files: [] } } as any;
    component.onLogoFileChange(event);
    expect(settingsServiceSpy.uploadLogo).not.toHaveBeenCalled();
  });

  it('onLogoFileChange should reject files over 1 MB', () => {
    const bigData = new Uint8Array(1024 * 1024 + 1);
    const file = new File([bigData], 'big.png', { type: 'image/png' });
    const input = { files: [file], value: 'big.png' } as any;
    const event = { target: input } as any;

    component.onLogoFileChange(event);

    expect(notifySpy.error).toHaveBeenCalledWith('Logo must be 1 MB or less.');
    expect(input.value).toBe('');
  });

  it('onLogoFileChange should upload valid file and notify on success', () => {
    const file = new File(['data'], 'logo.png', { type: 'image/png' });
    const input = { files: [file], value: 'logo.png' } as any;
    const event = { target: input } as any;

    settingsServiceSpy.uploadLogo.and.returnValue(of({ has_logo: true }));
    settingsServiceSpy.getLogoBlob.and.returnValue(of(new Blob(['img'], { type: 'image/png' })));

    component.onLogoFileChange(event);

    expect(settingsServiceSpy.uploadLogo).toHaveBeenCalledWith(file);
    expect(component.logoUploading()).toBe(false);
    expect(input.value).toBe('');
  });

  it('onLogoFileChange error should notify with detail', () => {
    const file = new File(['data'], 'logo.png', { type: 'image/png' });
    const input = { files: [file], value: 'logo.png' } as any;
    const event = { target: input } as any;

    settingsServiceSpy.uploadLogo.and.returnValue(
      throwError(() => ({ error: { detail: 'Bad image' } }))
    );

    component.onLogoFileChange(event);

    expect(notifySpy.error).toHaveBeenCalledWith('Bad image');
    expect(component.logoUploading()).toBe(false);
    expect(input.value).toBe('');
  });

  it('onLogoFileChange error should use fallback message', () => {
    const file = new File(['data'], 'logo.png', { type: 'image/png' });
    const input = { files: [file], value: 'logo.png' } as any;
    const event = { target: input } as any;

    settingsServiceSpy.uploadLogo.and.returnValue(throwError(() => ({})));

    component.onLogoFileChange(event);

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to upload logo.');
  });

  // ── Logo: removeLogo ──

  it('removeLogo should clear logo and notify on success', () => {
    // Set up existing logo
    component.logoObjectUrl.set('blob:existing');
    spyOn(URL, 'revokeObjectURL');

    settingsServiceSpy.deleteLogo.and.returnValue(of(void 0));

    component.removeLogo();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:existing');
    expect(component.logoObjectUrl()).toBeNull();
  });

  it('removeLogo should notify error on failure', () => {
    settingsServiceSpy.deleteLogo.and.returnValue(throwError(() => new Error('fail')));

    component.removeLogo();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove logo.');
  });

  it('removeLogo should not call revokeObjectURL if no existing logo', () => {
    component.logoObjectUrl.set(null);
    spyOn(URL, 'revokeObjectURL');

    settingsServiceSpy.deleteLogo.and.returnValue(of(void 0));
    component.removeLogo();

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  // ── ngOnDestroy ──

  it('ngOnDestroy should revoke logo object URL if exists', () => {
    component.logoObjectUrl.set('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.ngOnDestroy();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('ngOnDestroy should not call revokeObjectURL if no logo', () => {
    component.logoObjectUrl.set(null);
    spyOn(URL, 'revokeObjectURL');

    component.ngOnDestroy();

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  // ── fetchLogoBlob: revoke previous URL ──

  it('fetchLogoBlob should revoke previous object URL before setting new one', () => {
    spyOn(URL, 'revokeObjectURL');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:new');

    settingsServiceSpy.hasLogo.and.returnValue(of({ has_logo: true }));
    settingsServiceSpy.getLogoBlob.and.returnValue(of(new Blob(['img'], { type: 'image/png' })));

    // Pre-set an existing URL
    fixture = TestBed.createComponent(SettingsListComponent);
    component = fixture.componentInstance;
    // First call sets a URL; re-trigger fetchLogoBlob by calling it indirectly
    // The constructor already called loadLogo -> fetchLogoBlob once
    const firstUrl = component.logoObjectUrl();
    expect(firstUrl).toBeTruthy();

    // Now trigger another fetch via removeLogo success -> fetchLogoBlob path won't apply
    // Instead, directly test by calling upload which triggers fetchLogoBlob after success
    settingsServiceSpy.uploadLogo.and.returnValue(of({ has_logo: true }));
    const file = new File(['data'], 'logo.png', { type: 'image/png' });
    const input = { files: [file], value: 'logo.png' } as any;
    component.onLogoFileChange({ target: input } as any);

    // fetchLogoBlob should have revoked the first URL
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstUrl as string);
  });

  // ── Closure: openClosureWizard ──

  it('openClosureWizard should reset state and show wizard', () => {
    component.openClosureWizard();

    expect(component.showClosureWizard()).toBe(true);
    expect(component.closureStep()).toBe('warn');
    expect(component.closureAcknowledge()).toBe(false);
    expect(component.closureMfaCode).toBe('');
    expect(component.closureError()).toBe('');
  });

  // ── Closure: cancelClosure ──

  it('cancelClosure should hide wizard', () => {
    component.showClosureWizard.set(true);
    component.cancelClosure();
    expect(component.showClosureWizard()).toBe(false);
  });

  // ── Closure: closureNextStep ──

  it('closureNextStep from warn should go to acknowledge', () => {
    component.closureStep.set('warn');
    component.closureNextStep();
    expect(component.closureStep()).toBe('acknowledge');
  });

  it('closureNextStep from acknowledge should go to mfa', () => {
    component.closureStep.set('acknowledge');
    component.closureNextStep();
    expect(component.closureStep()).toBe('mfa');
  });

  // ── Closure: closurePrevStep ──

  it('closurePrevStep from acknowledge should go to warn', () => {
    component.closureStep.set('acknowledge');
    component.closurePrevStep();
    expect(component.closureStep()).toBe('warn');
  });

  it('closurePrevStep from mfa should go to acknowledge', () => {
    component.closureStep.set('mfa');
    component.closurePrevStep();
    expect(component.closureStep()).toBe('acknowledge');
  });

  it('closurePrevStep from confirm should go to mfa', () => {
    component.closureStep.set('confirm');
    component.closurePrevStep();
    expect(component.closureStep()).toBe('mfa');
  });

  // ── subscriptionSnapshot ──

  it('subscriptionSnapshot returns current subscription from profile service', () => {
    const snapshot = component.subscriptionSnapshot;
    expect(snapshot).toEqual({ limits: {} } as any);
  });

  // ── subscriptionLimits ──

  it('subscriptionLimits returns empty array when no subscription', () => {
    const profileService = TestBed.inject(UserProfileService) as any;
    profileService.currentSubscription = () => null;
    expect(component.subscriptionLimits).toEqual([]);
  });

  it('subscriptionLimits returns empty array when subscription has no limits', () => {
    const profileService = TestBed.inject(UserProfileService) as any;
    profileService.currentSubscription = () => ({});
    expect(component.subscriptionLimits).toEqual([]);
  });

  it('subscriptionLimits returns limit rows when subscription has limits', () => {
    const profileService = TestBed.inject(UserProfileService) as any;
    profileService.currentSubscription = () => ({
      limits: {
        max_members: 5,
        max_clients: 10,
        max_assets: 50,
        max_engagements: 20,
        max_findings_per_engagement: 100,
        max_images_per_finding: 10,
      },
    });
    const limits = component.subscriptionLimits;
    expect(limits.length).toBe(6);
    expect(limits[0]).toEqual({ label: 'Team Members', description: 'Maximum number of users in your tenant.', value: 5 });
    expect(limits[5]).toEqual({ label: 'Images per Finding', description: 'Maximum images that can be embedded in a single finding.', value: 10 });
  });

  // ── License: showLicenseInput / cancelLicenseInput ──

  it('showLicenseInput sets licenseShowInput to true and clears state', () => {
    component.licenseKey = 'old-key';
    component.licenseError.set('old error');
    component.showLicenseInput();

    expect(component.licenseShowInput()).toBe(true);
    expect(component.licenseKey).toBe('');
    expect(component.licenseError()).toBe('');
  });

  it('cancelLicenseInput sets licenseShowInput to false and clears state', () => {
    component.licenseShowInput.set(true);
    component.licenseKey = 'some-key';
    component.licenseError.set('some error');
    component.cancelLicenseInput();

    expect(component.licenseShowInput()).toBe(false);
    expect(component.licenseKey).toBe('');
    expect(component.licenseError()).toBe('');
  });

  // ── License: activateLicense ──

  it('activateLicense does nothing when key is empty', () => {
    component.licenseKey = '   ';
    component.activateLicense();
    expect(settingsServiceSpy.activateLicense).not.toHaveBeenCalled();
  });

  it('activateLicense calls service and notifies on success (non-expired)', () => {
    const licStatus = {
      plan: 'enterprise', features: ['all'], max_users: 100, max_workspaces: 10,
      expired: false, expires_at: '2027-01-01', customer: 'ACME', has_key: true,
    };
    settingsServiceSpy.activateLicense.and.returnValue(of(licStatus));
    component.licenseKey = 'ENT-KEY-123';
    component.licenseShowInput.set(true);
    component.activateLicense();

    expect(settingsServiceSpy.activateLicense).toHaveBeenCalledWith('ENT-KEY-123');
    expect(component.licenseStatus()).toEqual(licStatus);
    expect(component.licenseActivating()).toBe(false);
    expect(component.licenseShowInput()).toBe(false);
    expect(component.licenseKey).toBe('');
    expect(notifySpy.success).toHaveBeenCalledWith('License activated — enterprise plan.');
  });

  it('activateLicense notifies warning on expired license', () => {
    const licStatus = {
      plan: 'enterprise', features: [], max_users: 100, max_workspaces: 10,
      expired: true, expires_at: '2024-01-01', customer: 'ACME', has_key: true,
    };
    settingsServiceSpy.activateLicense.and.returnValue(of(licStatus));
    component.licenseKey = 'EXPIRED-KEY';
    component.activateLicense();

    expect(notifySpy.warning).toHaveBeenCalledWith('License key accepted but is expired. Features remain at Community Edition.');
  });

  it('activateLicense shows error on failure with detail', () => {
    settingsServiceSpy.activateLicense.and.returnValue(
      throwError(() => ({ error: { detail: 'Invalid key' } })),
    );
    component.licenseKey = 'BAD-KEY';
    component.activateLicense();

    expect(component.licenseActivating()).toBe(false);
    expect(component.licenseError()).toBe('Invalid key');
  });

  it('activateLicense shows generic error when no detail', () => {
    settingsServiceSpy.activateLicense.and.returnValue(throwError(() => ({})));
    component.licenseKey = 'BAD-KEY';
    component.activateLicense();

    expect(component.licenseError()).toBe('Failed to activate license key.');
  });

  // ── License: removeLicenseKey ──

  it('removeLicenseKey calls service and notifies on success', () => {
    const licStatus = {
      plan: 'community', features: [], max_users: 3, max_workspaces: 1,
      expired: false, expires_at: null, customer: '', has_key: false,
    };
    settingsServiceSpy.removeLicense.and.returnValue(of(licStatus));
    component.licenseShowInput.set(true);
    component.removeLicenseKey();

    expect(component.licenseStatus()).toEqual(licStatus);
    expect(component.licenseRemoving()).toBe(false);
    expect(component.licenseShowInput()).toBe(false);
    expect(notifySpy.success).toHaveBeenCalledWith('License removed — reverted to Community Edition.');
  });

  it('removeLicenseKey shows error on failure', () => {
    settingsServiceSpy.removeLicense.and.returnValue(throwError(() => new Error('fail')));
    component.removeLicenseKey();

    expect(component.licenseRemoving()).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove license.');
  });

  // ── License: loadLicense error ──

  it('loadLicense error sets licenseLoading to false', () => {
    settingsServiceSpy.getLicenseStatus.and.returnValue(throwError(() => new Error('fail')));
    fixture = TestBed.createComponent(SettingsListComponent);
    component = fixture.componentInstance;

    expect(component.licenseLoading()).toBe(false);
  });

  // ── Closure: submitClosureVerifyMfa ──

  it('submitClosureVerifyMfa does nothing when code is less than 6 chars', () => {
    component.closureMfaCode = '12345';
    component.submitClosureVerifyMfa();
    expect(settingsServiceSpy.verifyClosureMfa).not.toHaveBeenCalled();
  });

  it('submitClosureVerifyMfa does nothing when code is empty whitespace', () => {
    component.closureMfaCode = '     ';
    component.submitClosureVerifyMfa();
    expect(settingsServiceSpy.verifyClosureMfa).not.toHaveBeenCalled();
  });

  it('submitClosureVerifyMfa advances to confirm step on success', () => {
    settingsServiceSpy.verifyClosureMfa.and.returnValue(of({ verified: true }));
    component.closureMfaCode = '123456';
    component.submitClosureVerifyMfa();

    expect(settingsServiceSpy.verifyClosureMfa).toHaveBeenCalledWith('123456');
    expect(component.closureSubmitting()).toBe(false);
    expect(component.closureStep()).toBe('confirm');
  });

  it('submitClosureVerifyMfa shows error on failure with detail', () => {
    settingsServiceSpy.verifyClosureMfa.and.returnValue(
      throwError(() => ({ error: { detail: 'Invalid code' } })),
    );
    component.closureMfaCode = '123456';
    component.submitClosureVerifyMfa();

    expect(component.closureSubmitting()).toBe(false);
    expect(component.closureError()).toBe('Invalid code');
  });

  it('submitClosureVerifyMfa shows generic error when no detail', () => {
    settingsServiceSpy.verifyClosureMfa.and.returnValue(throwError(() => ({})));
    component.closureMfaCode = '123456';
    component.submitClosureVerifyMfa();

    expect(component.closureError()).toBe('MFA verification failed.');
  });

  // ── Closure: submitClosureExecute ──

  it('submitClosureExecute does nothing when workspace name is empty', () => {
    component.closureWorkspaceName = '   ';
    component.submitClosureExecute();
    expect(settingsServiceSpy.executeClosure).not.toHaveBeenCalled();
  });

  it('submitClosureExecute navigates to closing page on success', () => {
    settingsServiceSpy.executeClosure.and.returnValue(of({ detail: 'Closing', closure_id: 'cl-123' }));
    component.closureWorkspaceName = 'My Workspace';
    component.submitClosureExecute();

    expect(settingsServiceSpy.executeClosure).toHaveBeenCalledWith('My Workspace');
    expect(authSpy.setUser).toHaveBeenCalledWith(null);
    expect(tokensSpy.clear).toHaveBeenCalled();
    expect(routerSpy.navigateByUrl).toHaveBeenCalledWith('/closing?closure_id=cl-123');
  });

  it('submitClosureExecute shows error on failure with detail', () => {
    settingsServiceSpy.executeClosure.and.returnValue(
      throwError(() => ({ error: { detail: 'Name mismatch' } })),
    );
    component.closureWorkspaceName = 'Wrong Name';
    component.submitClosureExecute();

    expect(component.closureSubmitting()).toBe(false);
    expect(component.closureError()).toBe('Name mismatch');
  });

  it('submitClosureExecute shows generic error when no detail', () => {
    settingsServiceSpy.executeClosure.and.returnValue(throwError(() => ({})));
    component.closureWorkspaceName = 'My Workspace';
    component.submitClosureExecute();

    expect(component.closureSubmitting()).toBe(false);
    expect(component.closureError()).toBe('Failed to delete workspace.');
  });

  // ── openClosureWizard ──

  it('openClosureWizard initializes closureWorkspaceName to empty', () => {
    component.closureWorkspaceName = 'leftover';
    component.openClosureWizard();
    expect(component.closureWorkspaceName).toBe('');
  });

  // ── Constructor: tenantName from profile ──

  it('sets tenantName from profile', () => {
    // The constructor was already called with profile$ = of(null), so tenantName is ''
    expect(component.tenantName).toBe('');
  });

  // ── resetSetting: saving=true during request ──

  it('resetSetting sets saving=true during request', () => {
    const row: any = { ...mockSetting, editValue: 'current_val', dirty: false, saving: false };
    const subject = new Subject<any>();
    settingsServiceSpy.reset.and.returnValue(subject.asObservable());

    component.resetSetting(row);
    expect(row.saving).toBe(true);

    subject.next({ ...mockSetting, value: 'default_val', has_value: false, updated_at: null, updated_by: null });
    subject.complete();
    expect(row.saving).toBe(false);
  });

});

describe('SettingsListComponent (with tenant profile)', () => {
  it('sets tenantName from profile subscription', () => {
    const settingsSpy = jasmine.createSpyObj('SettingsService', [
      'list', 'upsert', 'reset', 'hasLogo',
      'deleteLogo', 'getLogoBlob', 'uploadLogo',
      'getLicenseStatus', 'activateLicense', 'removeLicense',
      'verifyClosureMfa', 'executeClosure',
    ]);
    settingsSpy.list.and.returnValue(of([]));
    settingsSpy.hasLogo.and.returnValue(of({ has_logo: false }));
    settingsSpy.getLicenseStatus.and.returnValue(of({
      plan: 'community', features: [], max_users: 3, max_workspaces: 1,
      expired: false, expires_at: null, customer: '', has_key: false,
    }));

    TestBed.configureTestingModule({
      imports: [SettingsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: settingsSpy },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['success', 'error', 'warning']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        { provide: DateFormatService, useValue: jasmine.createSpyObj('DateFormatService', ['setFormat']) },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['setUser']) },
        { provide: TokenService, useValue: jasmine.createSpyObj('TokenService', ['clear']) },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigateByUrl']) },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
        {
          provide: UserProfileService,
          useValue: {
            profile$: of({ tenant: { name: 'Acme Corp' } }),
            currentSubscription: () => ({ limits: { max_members: 5 } }),
            refreshProfile: () => of({}),
          },
        },
      ],
    });

    const fix = TestBed.createComponent(SettingsListComponent);
    const comp = fix.componentInstance;
    expect(comp.tenantName).toBe('Acme Corp');
  });
});

describe('SettingsListComponent (no subscription, triggers refresh)', () => {
  it('calls refreshProfile when currentSubscription returns null', () => {
    const settingsSpy = jasmine.createSpyObj('SettingsService', [
      'list', 'upsert', 'reset', 'hasLogo',
      'deleteLogo', 'getLogoBlob', 'uploadLogo',
      'getLicenseStatus', 'activateLicense', 'removeLicense',
      'verifyClosureMfa', 'executeClosure',
    ]);
    settingsSpy.list.and.returnValue(of([]));
    settingsSpy.hasLogo.and.returnValue(of({ has_logo: false }));
    settingsSpy.getLicenseStatus.and.returnValue(of({
      plan: 'community', features: [], max_users: 3, max_workspaces: 1,
      expired: false, expires_at: null, customer: '', has_key: false,
    }));

    const refreshSpy = jasmine.createSpy('refreshProfile').and.returnValue(of({}));

    TestBed.configureTestingModule({
      imports: [SettingsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: settingsSpy },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['success', 'error', 'warning']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        { provide: DateFormatService, useValue: jasmine.createSpyObj('DateFormatService', ['setFormat']) },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['setUser']) },
        { provide: TokenService, useValue: jasmine.createSpyObj('TokenService', ['clear']) },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigateByUrl']) },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
        {
          provide: UserProfileService,
          useValue: {
            profile$: of(null),
            currentSubscription: () => null,
            refreshProfile: refreshSpy,
          },
        },
      ],
    });

    TestBed.createComponent(SettingsListComponent);
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('handles refreshProfile error gracefully', () => {
    const settingsSpy = jasmine.createSpyObj('SettingsService', [
      'list', 'upsert', 'reset', 'hasLogo',
      'deleteLogo', 'getLogoBlob', 'uploadLogo',
      'getLicenseStatus', 'activateLicense', 'removeLicense',
      'verifyClosureMfa', 'executeClosure',
    ]);
    settingsSpy.list.and.returnValue(of([]));
    settingsSpy.hasLogo.and.returnValue(of({ has_logo: false }));
    settingsSpy.getLicenseStatus.and.returnValue(of({
      plan: 'community', features: [], max_users: 3, max_workspaces: 1,
      expired: false, expires_at: null, customer: '', has_key: false,
    }));

    TestBed.configureTestingModule({
      imports: [SettingsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: settingsSpy },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['success', 'error', 'warning']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        { provide: DateFormatService, useValue: jasmine.createSpyObj('DateFormatService', ['setFormat']) },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['setUser']) },
        { provide: TokenService, useValue: jasmine.createSpyObj('TokenService', ['clear']) },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigateByUrl']) },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
        {
          provide: UserProfileService,
          useValue: {
            profile$: of(null),
            currentSubscription: () => null,
            refreshProfile: () => throwError(() => new Error('network fail')),
          },
        },
      ],
    });

    // Should not throw
    expect(() => TestBed.createComponent(SettingsListComponent)).not.toThrow();
  });
});
