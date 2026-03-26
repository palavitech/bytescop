import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { Subject, of, throwError } from 'rxjs';

import { ProfilePageComponent } from './profile-page.component';
import { ProfileService } from '../services/profile.service';
import { PasswordPolicyService, PasswordPolicy } from '../services/password-policy.service';
import { MfaService, MfaStatusResponse } from '../../../services/core/auth/mfa.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { ProfileResponse } from '../models/profile.model';

describe('ProfilePageComponent', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let component: ProfilePageComponent;

  let profileServiceSpy: jasmine.SpyObj<ProfileService>;
  let passwordPolicySpy: jasmine.SpyObj<PasswordPolicyService>;
  let mfaServiceSpy: jasmine.SpyObj<MfaService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let httpSpy: jasmine.SpyObj<HttpClient>;

  const profileSubject = new Subject<any>();

  const mockUserProfileService = {
    profile$: profileSubject.asObservable(),
    updateName: jasmine.createSpy('updateName'),
    updateAvatarUrl: jasmine.createSpy('updateAvatarUrl'),
    clearPasswordResetFlag: jasmine.createSpy('clearPasswordResetFlag'),
  };

  const mockProfileResponse: ProfileResponse = {
    user: {
      id: 'u1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      phone: '555-1234',
      timezone: 'America/New_York',
      avatar_url: null,
    },
    role: 'member',
    member_since: '2025-01-01T00:00:00Z',
  };

  const mockPolicy: PasswordPolicy = {
    min_length: 10,
    require_uppercase: true,
    require_special: true,
    require_number: true,
    expiry_days: 90,
  };

  const mockMfaStatus: MfaStatusResponse = {
    mfa_enabled: false,
    mfa_enrolled_at: null,
    mfa_required: false,
    backup_codes_remaining: 0,
    policy: { required_all: false, required_for_owners: false, required_for_admins: false },
  };

  const mockMfaStatusEnabled: MfaStatusResponse = {
    mfa_enabled: true,
    mfa_enrolled_at: '2025-06-01T00:00:00Z',
    mfa_required: false,
    backup_codes_remaining: 5,
    policy: { required_all: false, required_for_owners: false, required_for_admins: false },
  };

  beforeEach(async () => {
    profileServiceSpy = jasmine.createSpyObj('ProfileService', [
      'getProfile', 'updateProfile', 'uploadAvatar', 'deleteAvatar',
    ]);
    passwordPolicySpy = jasmine.createSpyObj('PasswordPolicyService', [
      'getPolicy', 'changePassword',
    ]);
    mfaServiceSpy = jasmine.createSpyObj('MfaService', [
      'getStatus', 'enroll', 'enrollConfirm', 'disable', 'regenerateBackupCodes',
      'reEnroll', 'reEnrollConfirm',
    ]);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    httpSpy = jasmine.createSpyObj('HttpClient', ['get']);

    // Reset spies on mockUserProfileService
    mockUserProfileService.updateName.calls.reset();
    mockUserProfileService.updateAvatarUrl.calls.reset();
    mockUserProfileService.clearPasswordResetFlag.calls.reset();

    // Default stubs
    profileServiceSpy.getProfile.and.returnValue(of(mockProfileResponse));
    passwordPolicySpy.getPolicy.and.returnValue(of(mockPolicy));
    mfaServiceSpy.getStatus.and.returnValue(of(mockMfaStatus));
    httpSpy.get.and.returnValue(of(new Blob(['img'], { type: 'image/png' })));

    await TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProfileService, useValue: profileServiceSpy },
        { provide: PasswordPolicyService, useValue: passwordPolicySpy },
        { provide: MfaService, useValue: mfaServiceSpy },
        { provide: UserProfileService, useValue: mockUserProfileService },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: HttpClient, useValue: httpSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePageComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── ngOnInit / loadProfile ──

  it('ngOnInit should load profile, policy, and MFA status', () => {
    fixture.detectChanges();

    expect(profileServiceSpy.getProfile).toHaveBeenCalled();
    expect(passwordPolicySpy.getPolicy).toHaveBeenCalled();
    expect(mfaServiceSpy.getStatus).toHaveBeenCalled();
  });

  it('loadProfile should populate form fields and set state to ready', () => {
    fixture.detectChanges();

    expect(component.firstName).toBe('Test');
    expect(component.lastName).toBe('User');
    expect(component.phone).toBe('555-1234');
    expect(component.timezone).toBe('America/New_York');
    expect(component.state$.value).toBe('ready');
    expect(component.profile$.value).toEqual(mockProfileResponse);
  });

  it('loadProfile error should set state to error', () => {
    profileServiceSpy.getProfile.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();

    expect(component.state$.value).toBe('error');
  });

  it('loadProfile should call fetchAvatarBlob when avatar_url exists', () => {
    const profileWithAvatar = {
      ...mockProfileResponse,
      user: { ...mockProfileResponse.user, avatar_url: '/api/me/avatar/' },
    };
    profileServiceSpy.getProfile.and.returnValue(of(profileWithAvatar));
    fixture.detectChanges();

    expect(httpSpy.get).toHaveBeenCalled();
  });

  it('loadPasswordPolicy should set policy', () => {
    fixture.detectChanges();

    expect(component.policy).toEqual(mockPolicy);
  });

  it('loadMfaStatus should set mfaStatus', () => {
    fixture.detectChanges();

    expect(component.mfaStatus).toEqual(mockMfaStatus);
  });

  // ── userProfile.profile$ subscription ──

  it('should update passwordResetRequired from profile$ subscription', () => {
    fixture.detectChanges();

    profileSubject.next({
      passwordResetRequired: true,
      passwordResetReason: 'Admin forced reset',
      passwordChangedAt: '2025-06-01T00:00:00Z',
    });

    expect(component.passwordResetRequired).toBe(true);
    expect(component.passwordResetReason).toBe('Admin forced reset');
    expect(component.passwordChangedAt).toBe('2025-06-01T00:00:00Z');
  });

  it('should handle null values from profile$ subscription', () => {
    fixture.detectChanges();

    profileSubject.next(null);

    expect(component.passwordResetRequired).toBe(false);
    expect(component.passwordResetReason).toBeNull();
    expect(component.passwordChangedAt).toBeNull();
  });

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

  // ── scrollToSecurity ──

  it('scrollToSecurity should call scrollIntoView if securitySection exists', () => {
    const mockEl = { scrollIntoView: jasmine.createSpy('scrollIntoView') };
    component.securitySection = { nativeElement: mockEl } as any;
    component.scrollToSecurity();
    expect(mockEl.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('scrollToSecurity should not throw if securitySection is undefined', () => {
    expect(() => component.scrollToSecurity()).not.toThrow();
  });

  // ── saveName ──

  it('saveName should update profile and notify on success', () => {
    fixture.detectChanges();

    const updatedProfile = {
      ...mockProfileResponse,
      user: { ...mockProfileResponse.user, first_name: 'Updated', last_name: 'Name' },
    };
    profileServiceSpy.updateProfile.and.returnValue(of(updatedProfile));

    component.firstName = 'Updated';
    component.lastName = 'Name';
    component.saveName();

    expect(component.saving$.value).toBe(false);
    expect(component.profile$.value).toEqual(updatedProfile);
    expect(mockUserProfileService.updateName).toHaveBeenCalledWith('Updated', 'Name');
  });

  it('saveName should set saving$ to true during request', () => {
    fixture.detectChanges();

    const subject = new Subject<any>();
    profileServiceSpy.updateProfile.and.returnValue(subject.asObservable());

    component.saveName();
    expect(component.saving$.value).toBe(true);

    subject.next(mockProfileResponse);
    subject.complete();
    expect(component.saving$.value).toBe(false);
  });

  it('saveName error should notify with detail message', () => {
    fixture.detectChanges();

    profileServiceSpy.updateProfile.and.returnValue(
      throwError(() => ({ error: { detail: 'Validation error' } }))
    );
    component.saveName();

    expect(notifySpy.error).toHaveBeenCalledWith('Validation error');
    expect(component.saving$.value).toBe(false);
  });

  it('saveName error should use fallback message when no detail', () => {
    fixture.detectChanges();

    profileServiceSpy.updateProfile.and.returnValue(throwError(() => ({})));
    component.saveName();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to update profile.');
  });

  // ── cancelEdit ──

  it('cancelEdit should restore form fields from profile$', () => {
    fixture.detectChanges();

    component.firstName = 'Changed';
    component.lastName = 'Changed';
    component.phone = 'xxx';
    component.timezone = 'xxx';

    component.cancelEdit();

    expect(component.firstName).toBe('Test');
    expect(component.lastName).toBe('User');
    expect(component.phone).toBe('555-1234');
    expect(component.timezone).toBe('America/New_York');
  });

  it('cancelEdit should do nothing if profile$ is null', () => {
    component.firstName = 'Changed';
    component.cancelEdit();
    expect(component.firstName).toBe('Changed');
  });

  // ── onFileSelected ──

  it('onFileSelected should return early if no file', () => {
    const event = { target: { files: [] } } as any;
    component.onFileSelected(event);
    expect(profileServiceSpy.uploadAvatar).not.toHaveBeenCalled();
  });

  it('onFileSelected should reject SVG files', () => {
    const file = new File(['data'], 'test.svg', { type: 'image/svg+xml' });
    const input = { files: [file], value: 'test.svg' } as any;
    const event = { target: input } as any;

    component.onFileSelected(event);

    expect(notifySpy.error).toHaveBeenCalledWith('Please select a PNG, JPEG, GIF, or WebP image.');
    expect(input.value).toBe('');
  });

  it('onFileSelected should reject non-image files', () => {
    const file = new File(['data'], 'test.txt', { type: 'text/plain' });
    const input = { files: [file], value: 'test.txt' } as any;
    const event = { target: input } as any;

    component.onFileSelected(event);

    expect(notifySpy.error).toHaveBeenCalledWith('Please select a PNG, JPEG, GIF, or WebP image.');
  });

  it('onFileSelected should reject files over 2 MB', () => {
    const bigData = new Uint8Array(2 * 1024 * 1024 + 1);
    const file = new File([bigData], 'big.png', { type: 'image/png' });
    const input = { files: [file], value: 'big.png' } as any;
    const event = { target: input } as any;

    component.onFileSelected(event);

    expect(notifySpy.error).toHaveBeenCalledWith('Image must be under 2 MB.');
    expect(input.value).toBe('');
  });

  it('onFileSelected should upload valid image and update state on success', () => {
    fixture.detectChanges();

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    const input = { files: [file], value: 'test.png' } as any;
    const event = { target: input } as any;

    profileServiceSpy.uploadAvatar.and.returnValue(of({ avatar_url: '/api/me/avatar/' }));

    component.onFileSelected(event);

    expect(profileServiceSpy.uploadAvatar).toHaveBeenCalledWith(file);
    expect(mockUserProfileService.updateAvatarUrl).toHaveBeenCalledWith('/api/me/avatar/');
    expect(component.uploadingAvatar$.value).toBe(false);
    expect(input.value).toBe('');
  });

  it('onFileSelected should update profile$ user avatar_url on success', () => {
    fixture.detectChanges();

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    const input = { files: [file], value: 'test.png' } as any;
    const event = { target: input } as any;

    profileServiceSpy.uploadAvatar.and.returnValue(of({ avatar_url: '/api/me/avatar/' }));

    component.onFileSelected(event);

    expect(component.profile$.value!.user.avatar_url).toBe('/api/me/avatar/');
  });

  it('onFileSelected error should reset avatarBusy and notify', () => {
    fixture.detectChanges();

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    const input = { files: [file], value: 'test.png' } as any;
    const event = { target: input } as any;

    profileServiceSpy.uploadAvatar.and.returnValue(
      throwError(() => ({ error: { detail: 'Upload failed' } }))
    );

    component.onFileSelected(event);

    expect(component.avatarBusy).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Upload failed');
  });

  it('onFileSelected error should use fallback message when no detail', () => {
    fixture.detectChanges();

    const file = new File(['data'], 'test.png', { type: 'image/png' });
    const input = { files: [file], value: 'test.png' } as any;
    const event = { target: input } as any;

    profileServiceSpy.uploadAvatar.and.returnValue(throwError(() => ({})));
    component.onFileSelected(event);

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to upload avatar.');
  });

  // ── removeAvatar ──

  it('removeAvatar should clear avatar and notify on success', () => {
    fixture.detectChanges();

    profileServiceSpy.deleteAvatar.and.returnValue(of(void 0 as any));

    component.removeAvatar();

    expect(mockUserProfileService.updateAvatarUrl).toHaveBeenCalledWith(null);
    expect(component.avatarPreviewUrl).toBeNull();
    expect(component.removingAvatar$.value).toBe(false);
  });

  it('removeAvatar should update profile$ avatar_url to null', () => {
    fixture.detectChanges();

    profileServiceSpy.deleteAvatar.and.returnValue(of(void 0 as any));
    component.removeAvatar();

    expect(component.profile$.value!.user.avatar_url).toBeNull();
  });

  it('removeAvatar error should notify with detail', () => {
    fixture.detectChanges();

    profileServiceSpy.deleteAvatar.and.returnValue(
      throwError(() => ({ error: { detail: 'Delete failed' } }))
    );
    component.removeAvatar();

    expect(notifySpy.error).toHaveBeenCalledWith('Delete failed');
  });

  it('removeAvatar error should use fallback message', () => {
    fixture.detectChanges();

    profileServiceSpy.deleteAvatar.and.returnValue(throwError(() => ({})));
    component.removeAvatar();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove avatar.');
  });

  // ── getInitials ──

  it('getInitials should return BC when profile is null', () => {
    expect(component.getInitials()).toBe('BC');
  });

  it('getInitials should return first+last initials when both names exist', () => {
    fixture.detectChanges();
    expect(component.getInitials()).toBe('TU');
  });

  it('getInitials should return first two chars of first name when no last name', () => {
    const profile = {
      ...mockProfileResponse,
      user: { ...mockProfileResponse.user, first_name: 'Test', last_name: '' },
    };
    component.profile$.next(profile);
    expect(component.getInitials()).toBe('TE');
  });

  it('getInitials should return first two chars of email local part when no names', () => {
    const profile = {
      ...mockProfileResponse,
      user: { ...mockProfileResponse.user, first_name: '', last_name: '' },
    };
    component.profile$.next(profile);
    expect(component.getInitials()).toBe('TE');
  });

  // ── prettyRole ──

  it('prettyRole should capitalize first letter', () => {
    expect(component.prettyRole('member')).toBe('Member');
    expect(component.prettyRole('owner')).toBe('Owner');
  });

  it('prettyRole should return -- for null', () => {
    expect(component.prettyRole(null)).toBe('--');
  });

  // ── buildAvatarUrl ──

  it('buildAvatarUrl should prepend apiUrl', () => {
    const result = component.buildAvatarUrl('/api/me/avatar/');
    expect(result).toContain('/api/me/avatar/');
  });

  it('buildAvatarUrl should return null for null input', () => {
    expect(component.buildAvatarUrl(null)).toBeNull();
  });

  // ── fetchAvatarBlob (private, tested via loadProfile) ──

  it('fetchAvatarBlob should set avatarPreviewUrl on success', () => {
    const profileWithAvatar = {
      ...mockProfileResponse,
      user: { ...mockProfileResponse.user, avatar_url: '/api/me/avatar/' },
    };
    profileServiceSpy.getProfile.and.returnValue(of(profileWithAvatar));
    httpSpy.get.and.returnValue(of(new Blob(['img'], { type: 'image/png' })));

    fixture.detectChanges();

    expect(component.avatarPreviewUrl).toBeTruthy();
    expect(component.avatarBusy).toBe(false);
  });

  it('fetchAvatarBlob should handle null rawUrl', () => {
    // avatar_url is null in default mock
    fixture.detectChanges();
    expect(component.avatarPreviewUrl).toBeNull();
    expect(component.avatarBusy).toBe(false);
  });

  it('fetchAvatarBlob error should set avatarPreviewUrl to null', () => {
    const profileWithAvatar = {
      ...mockProfileResponse,
      user: { ...mockProfileResponse.user, avatar_url: '/api/me/avatar/' },
    };
    profileServiceSpy.getProfile.and.returnValue(of(profileWithAvatar));
    httpSpy.get.and.returnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();

    expect(component.avatarPreviewUrl).toBeNull();
    expect(component.avatarBusy).toBe(false);
  });

  // ── Password policy getters ──

  it('meetsMinLength should check password length against policy', () => {
    fixture.detectChanges();
    component.newPassword = '12345';
    expect(component.meetsMinLength).toBe(false);

    component.newPassword = '1234567890';
    expect(component.meetsMinLength).toBe(true);
  });

  it('hasUppercase should detect uppercase letters', () => {
    component.newPassword = 'lowercase';
    expect(component.hasUppercase).toBe(false);

    component.newPassword = 'Uppercase';
    expect(component.hasUppercase).toBe(true);
  });

  it('hasNumber should detect digits', () => {
    component.newPassword = 'noDigs';
    expect(component.hasNumber).toBe(false);

    component.newPassword = 'has1digit';
    expect(component.hasNumber).toBe(true);
  });

  it('hasSpecial should detect special characters', () => {
    component.newPassword = 'noSpecials123';
    expect(component.hasSpecial).toBe(false);

    component.newPassword = 'has@special';
    expect(component.hasSpecial).toBe(true);
  });

  it('allPolicyChecksMet should return false when policy is null', () => {
    component.policy = null;
    expect(component.allPolicyChecksMet).toBe(false);
  });

  it('allPolicyChecksMet should return true when all checks pass', () => {
    fixture.detectChanges();
    component.newPassword = 'GoodPass1!xx';
    expect(component.allPolicyChecksMet).toBe(true);
  });

  it('allPolicyChecksMet should return false when missing uppercase', () => {
    fixture.detectChanges();
    component.newPassword = 'goodpass1!xx';
    expect(component.allPolicyChecksMet).toBe(false);
  });

  it('allPolicyChecksMet should return false when missing number', () => {
    fixture.detectChanges();
    component.newPassword = 'GoodPass!!xx';
    expect(component.allPolicyChecksMet).toBe(false);
  });

  it('allPolicyChecksMet should return false when missing special', () => {
    fixture.detectChanges();
    component.newPassword = 'GoodPass1xxx';
    expect(component.allPolicyChecksMet).toBe(false);
  });

  it('allPolicyChecksMet should return false when too short', () => {
    fixture.detectChanges();
    component.newPassword = 'Go1!';
    expect(component.allPolicyChecksMet).toBe(false);
  });

  // ── canSubmitPasswordChange ──

  it('canSubmitPasswordChange should return false without currentPassword', () => {
    fixture.detectChanges();
    component.currentPassword = '';
    component.newPassword = 'GoodPass1!xx';
    expect(component.canSubmitPasswordChange).toBe(false);
  });

  it('canSubmitPasswordChange should return false without newPassword', () => {
    fixture.detectChanges();
    component.currentPassword = 'old';
    component.newPassword = '';
    expect(component.canSubmitPasswordChange).toBe(false);
  });

  it('canSubmitPasswordChange should return true when all requirements met (no MFA)', () => {
    fixture.detectChanges();
    component.currentPassword = 'oldpass';
    component.newPassword = 'GoodPass1!xx';
    expect(component.canSubmitPasswordChange).toBe(true);
  });

  it('canSubmitPasswordChange should require mfaCodeForPassword when MFA is enabled', () => {
    fixture.detectChanges();
    component.mfaStatus = mockMfaStatusEnabled;
    component.currentPassword = 'oldpass';
    component.newPassword = 'GoodPass1!xx';
    component.mfaCodeForPassword = '';

    expect(component.canSubmitPasswordChange).toBe(false);

    component.mfaCodeForPassword = '123456';
    expect(component.canSubmitPasswordChange).toBe(true);
  });

  // ── daysUntilExpiry ──

  it('daysUntilExpiry should return null when policy is null', () => {
    component.policy = null;
    expect(component.daysUntilExpiry).toBeNull();
  });

  it('daysUntilExpiry should return null when expiry_days is 0', () => {
    fixture.detectChanges();
    component.policy = { ...mockPolicy, expiry_days: 0 };
    expect(component.daysUntilExpiry).toBeNull();
  });

  it('daysUntilExpiry should return null when passwordChangedAt is null', () => {
    fixture.detectChanges();
    component.passwordChangedAt = null;
    expect(component.daysUntilExpiry).toBeNull();
  });

  it('daysUntilExpiry should calculate days remaining', () => {
    fixture.detectChanges();
    // Set passwordChangedAt to 10 days ago
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
    component.passwordChangedAt = tenDaysAgo;
    component.policy = { ...mockPolicy, expiry_days: 90 };

    expect(component.daysUntilExpiry).toBe(80);
  });

  // ── changePassword ──

  it('changePassword should succeed and clear fields', () => {
    fixture.detectChanges();

    passwordPolicySpy.changePassword.and.returnValue(of(void 0 as any));

    component.currentPassword = 'oldpass';
    component.newPassword = 'GoodPass1!xx';
    component.mfaCodeForPassword = '';
    component.changePassword();

    expect(notifySpy.success).toHaveBeenCalledWith('Password changed successfully.');
    expect(component.currentPassword).toBe('');
    expect(component.newPassword).toBe('');
    expect(component.mfaCodeForPassword).toBe('');
    expect(mockUserProfileService.clearPasswordResetFlag).toHaveBeenCalled();
    expect(component.passwordResetRequired).toBe(false);
    expect(component.passwordResetReason).toBeNull();
    expect(component.passwordChangedAt).toBeTruthy();
    expect(component.changingPassword$.value).toBe(false);
  });

  it('changePassword should pass MFA code when MFA is enabled', () => {
    fixture.detectChanges();

    component.mfaStatus = mockMfaStatusEnabled;
    component.currentPassword = 'oldpass';
    component.newPassword = 'GoodPass1!xx';
    component.mfaCodeForPassword = '123456';

    passwordPolicySpy.changePassword.and.returnValue(of(void 0 as any));
    component.changePassword();

    expect(passwordPolicySpy.changePassword).toHaveBeenCalledWith('oldpass', 'GoodPass1!xx', '123456');
  });

  it('changePassword should not pass MFA code when MFA is disabled', () => {
    fixture.detectChanges();

    component.currentPassword = 'oldpass';
    component.newPassword = 'GoodPass1!xx';

    passwordPolicySpy.changePassword.and.returnValue(of(void 0 as any));
    component.changePassword();

    expect(passwordPolicySpy.changePassword).toHaveBeenCalledWith('oldpass', 'GoodPass1!xx', undefined);
  });

  it('changePassword error with current_password array should set passwordErrors', () => {
    fixture.detectChanges();

    passwordPolicySpy.changePassword.and.returnValue(
      throwError(() => ({ error: { current_password: ['Incorrect password.'] } }))
    );

    component.currentPassword = 'wrong';
    component.newPassword = 'GoodPass1!xx';
    component.changePassword();

    expect(component.passwordErrors).toEqual(['Incorrect password.']);
  });

  it('changePassword error with current_password string should wrap in array', () => {
    fixture.detectChanges();

    passwordPolicySpy.changePassword.and.returnValue(
      throwError(() => ({ error: { current_password: 'Wrong' } }))
    );

    component.currentPassword = 'wrong';
    component.newPassword = 'GoodPass1!xx';
    component.changePassword();

    expect(component.passwordErrors).toEqual(['Wrong']);
  });

  it('changePassword error with new_password should set passwordErrors', () => {
    fixture.detectChanges();

    passwordPolicySpy.changePassword.and.returnValue(
      throwError(() => ({ error: { new_password: ['Too common.'] } }))
    );

    component.currentPassword = 'old';
    component.newPassword = 'GoodPass1!xx';
    component.changePassword();

    expect(component.passwordErrors).toEqual(['Too common.']);
  });

  it('changePassword error with mfa_code should set passwordErrors', () => {
    fixture.detectChanges();

    passwordPolicySpy.changePassword.and.returnValue(
      throwError(() => ({ error: { mfa_code: ['Invalid MFA code.'] } }))
    );

    component.currentPassword = 'old';
    component.newPassword = 'GoodPass1!xx';
    component.changePassword();

    expect(component.passwordErrors).toEqual(['Invalid MFA code.']);
  });

  it('changePassword error with detail fallback', () => {
    fixture.detectChanges();

    passwordPolicySpy.changePassword.and.returnValue(
      throwError(() => ({ error: { detail: 'Server error' } }))
    );

    component.currentPassword = 'old';
    component.newPassword = 'GoodPass1!xx';
    component.changePassword();

    expect(component.passwordErrors).toEqual(['Server error']);
  });

  it('changePassword error with no recognizable fields should use default message', () => {
    fixture.detectChanges();

    passwordPolicySpy.changePassword.and.returnValue(throwError(() => ({ error: {} })));

    component.currentPassword = 'old';
    component.newPassword = 'GoodPass1!xx';
    component.changePassword();

    expect(component.passwordErrors).toEqual(['Failed to change password.']);
  });

  // ── MFA: startMfaEnroll ──

  it('startMfaEnroll should set enrollment fields on success', () => {
    fixture.detectChanges();

    mfaServiceSpy.enroll.and.returnValue(of({
      qr_code: 'data:image/png;base64,abc',
      secret: 'ABCDEF',
      backup_codes: ['111', '222'],
    }));

    component.startMfaEnroll();

    expect(component.mfaEnrollQr).toBe('data:image/png;base64,abc');
    expect(component.mfaEnrollSecret).toBe('ABCDEF');
    expect(component.mfaBackupCodes).toEqual(['111', '222']);
    expect(component.mfaStep).toBe('enrolling');
    expect(component.mfaLoading$.value).toBe(false);
  });

  it('startMfaEnroll error should notify', () => {
    fixture.detectChanges();

    mfaServiceSpy.enroll.and.returnValue(
      throwError(() => ({ error: { detail: 'Enrollment failed' } }))
    );

    component.startMfaEnroll();

    expect(notifySpy.error).toHaveBeenCalledWith('Enrollment failed');
  });

  it('startMfaEnroll error should use fallback message', () => {
    fixture.detectChanges();

    mfaServiceSpy.enroll.and.returnValue(throwError(() => ({})));
    component.startMfaEnroll();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to start MFA enrollment.');
  });

  // ── MFA: confirmMfaEnroll ──

  it('confirmMfaEnroll should do nothing if mfaCode is empty', () => {
    component.mfaCode = '';
    component.confirmMfaEnroll();
    expect(mfaServiceSpy.enrollConfirm).not.toHaveBeenCalled();
  });

  it('confirmMfaEnroll should do nothing if mfaCode is whitespace', () => {
    component.mfaCode = '   ';
    component.confirmMfaEnroll();
    expect(mfaServiceSpy.enrollConfirm).not.toHaveBeenCalled();
  });

  it('confirmMfaEnroll should confirm and reset state on success', () => {
    fixture.detectChanges();

    mfaServiceSpy.enrollConfirm.and.returnValue(of({ detail: 'ok' }));

    component.mfaCode = '123456';
    component.confirmMfaEnroll();

    expect(mfaServiceSpy.enrollConfirm).toHaveBeenCalledWith('123456');
    expect(notifySpy.success).toHaveBeenCalledWith('MFA has been enabled.');
    expect(component.mfaStep).toBe('idle');
    expect(component.mfaCode).toBe('');
    expect(mfaServiceSpy.getStatus).toHaveBeenCalledTimes(2); // once in init + once after confirm
  });

  it('confirmMfaEnroll error should notify', () => {
    fixture.detectChanges();

    mfaServiceSpy.enrollConfirm.and.returnValue(
      throwError(() => ({ error: { detail: 'Bad code' } }))
    );

    component.mfaCode = '123456';
    component.confirmMfaEnroll();

    expect(notifySpy.error).toHaveBeenCalledWith('Bad code');
  });

  // ── MFA: disableMfa ──

  it('disableMfa should do nothing if mfaCode is empty', () => {
    component.mfaCode = '';
    component.disableMfa();
    expect(mfaServiceSpy.disable).not.toHaveBeenCalled();
  });

  it('disableMfa should disable and reset state on success', () => {
    fixture.detectChanges();

    mfaServiceSpy.disable.and.returnValue(of({ detail: 'ok' }));

    component.mfaCode = '123456';
    component.disableMfa();

    expect(mfaServiceSpy.disable).toHaveBeenCalledWith('123456');
    expect(notifySpy.success).toHaveBeenCalledWith('MFA has been disabled.');
    expect(component.mfaStep).toBe('idle');
    expect(component.mfaCode).toBe('');
  });

  it('disableMfa error should notify', () => {
    fixture.detectChanges();

    mfaServiceSpy.disable.and.returnValue(throwError(() => ({})));

    component.mfaCode = '123456';
    component.disableMfa();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to disable MFA.');
  });

  // ── MFA: regenerateBackupCodes ──

  it('regenerateBackupCodes should do nothing if mfaCode is empty', () => {
    component.mfaCode = '';
    component.regenerateBackupCodes();
    expect(mfaServiceSpy.regenerateBackupCodes).not.toHaveBeenCalled();
  });

  it('regenerateBackupCodes should update codes and notify on success', () => {
    fixture.detectChanges();

    mfaServiceSpy.regenerateBackupCodes.and.returnValue(of({
      backup_codes: ['aaa', 'bbb', 'ccc'],
    }));

    component.mfaCode = '123456';
    component.regenerateBackupCodes();

    expect(component.mfaBackupCodes).toEqual(['aaa', 'bbb', 'ccc']);
    expect(component.mfaStep).toBe('regenerated');
    expect(component.mfaCode).toBe('');
  });

  it('regenerateBackupCodes error should notify', () => {
    fixture.detectChanges();

    mfaServiceSpy.regenerateBackupCodes.and.returnValue(throwError(() => ({})));

    component.mfaCode = '123456';
    component.regenerateBackupCodes();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to regenerate backup codes.');
  });

  // ── MFA: startMfaReEnroll ──

  it('startMfaReEnroll should set step and clear code', () => {
    component.mfaCode = 'leftover';
    component.startMfaReEnroll();

    expect(component.mfaStep).toBe('re-enroll-verify');
    expect(component.mfaCode).toBe('');
  });

  // ── MFA: submitReEnrollVerify ──

  it('submitReEnrollVerify should do nothing if mfaCode is empty', () => {
    component.mfaCode = '';
    component.submitReEnrollVerify();
    expect(mfaServiceSpy.reEnroll).not.toHaveBeenCalled();
  });

  it('submitReEnrollVerify should set re-enrolling state on success', () => {
    fixture.detectChanges();

    mfaServiceSpy.reEnroll.and.returnValue(of({
      qr_code: 'data:image/png;base64,new',
      secret: 'NEWSECRET',
      backup_codes: ['x1', 'x2'],
      re_enroll_token: 'token123',
    }));

    component.mfaCode = '123456';
    component.submitReEnrollVerify();

    expect(component.mfaStep).toBe('re-enrolling');
    expect(component.mfaEnrollQr).toBe('data:image/png;base64,new');
    expect(component.mfaEnrollSecret).toBe('NEWSECRET');
    expect(component.reEnrollToken).toBe('token123');
    expect(component.mfaCode).toBe('');
  });

  it('submitReEnrollVerify error should notify', () => {
    fixture.detectChanges();

    mfaServiceSpy.reEnroll.and.returnValue(
      throwError(() => ({ error: { detail: 'Bad code' } }))
    );

    component.mfaCode = '123456';
    component.submitReEnrollVerify();

    expect(notifySpy.error).toHaveBeenCalledWith('Bad code');
  });

  // ── MFA: confirmReEnroll ──

  it('confirmReEnroll should do nothing if mfaCode is empty', () => {
    component.mfaCode = '';
    component.confirmReEnroll();
    expect(mfaServiceSpy.reEnrollConfirm).not.toHaveBeenCalled();
  });

  it('confirmReEnroll should reset state on success', () => {
    fixture.detectChanges();

    mfaServiceSpy.reEnrollConfirm.and.returnValue(of({ detail: 'OK' }));

    component.mfaCode = '654321';
    component.reEnrollToken = 'token123';
    component.confirmReEnroll();

    expect(mfaServiceSpy.reEnrollConfirm).toHaveBeenCalledWith('654321', 'token123');
    expect(notifySpy.success).toHaveBeenCalledWith('MFA device has been updated.');
    expect(component.mfaStep).toBe('idle');
    expect(component.mfaCode).toBe('');
    expect(component.reEnrollToken).toBe('');
  });

  it('confirmReEnroll error should notify', () => {
    fixture.detectChanges();

    mfaServiceSpy.reEnrollConfirm.and.returnValue(throwError(() => ({})));

    component.mfaCode = '654321';
    component.reEnrollToken = 'token123';
    component.confirmReEnroll();

    expect(notifySpy.error).toHaveBeenCalledWith('Invalid code. Please try again.');
  });

  // ── downloadMfaBackupCodes ──

  it('downloadMfaBackupCodes should create and click download link', () => {
    const clickSpy = jasmine.createSpy('click');
    spyOn(document, 'createElement').and.returnValue({ href: '', download: '', click: clickSpy } as any);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:url');
    spyOn(URL, 'revokeObjectURL');

    component.mfaBackupCodes = ['code1', 'code2', 'code3'];
    component.downloadMfaBackupCodes();

    expect(clickSpy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url');
  });

  // ── cancelMfaAction ──

  it('cancelMfaAction should reset MFA step and fields', () => {
    component.mfaStep = 'enrolling';
    component.mfaCode = '123456';
    component.reEnrollToken = 'token';

    component.cancelMfaAction();

    expect(component.mfaStep).toBe('idle');
    expect(component.mfaCode).toBe('');
    expect(component.reEnrollToken).toBe('');
  });
});
