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
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
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

});
