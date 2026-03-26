import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { Subject, of, throwError } from 'rxjs';

import { ProfilePageComponent } from './profile-page.component';
import { ProfileService } from '../services/profile.service';
import { PasswordPolicyService } from '../services/password-policy.service';
import { MfaService } from '../../../services/core/auth/mfa.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { NotificationService } from '../../../services/core/notify/notification.service';

describe('ProfilePageComponent OnPush', () => {
  let fixture: ComponentFixture<ProfilePageComponent>;
  let component: ProfilePageComponent;
  let markSpy: jasmine.Spy;

  let profileServiceSpy: jasmine.SpyObj<ProfileService>;
  let passwordPolicySpy: jasmine.SpyObj<PasswordPolicyService>;
  let mfaServiceSpy: jasmine.SpyObj<MfaService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;

  const profileSubject = new Subject<any>();

  const mockUserProfileService = {
    profile$: profileSubject.asObservable(),
    updateName: jasmine.createSpy('updateName'),
    updateAvatarUrl: jasmine.createSpy('updateAvatarUrl'),
    clearPasswordResetFlag: jasmine.createSpy('clearPasswordResetFlag'),
  };

  const mockProfileResponse = {
    user: {
      id: 'u1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      avatar_url: null,
      phone: '',
      timezone: '',
    },
    role: 'member',
    member_since: '2025-01-01T00:00:00Z',
  };

  const mockPolicy = {
    min_length: 10,
    require_uppercase: true,
    require_special: true,
    require_number: true,
    expiry_days: 90,
  };

  const mockMfaStatus = {
    mfa_enabled: false,
    mfa_enrolled_at: null,
    mfa_required: false,
    backup_codes_remaining: 0,
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

    // Default stubs so component can initialize
    profileServiceSpy.getProfile.and.returnValue(of(mockProfileResponse));
    passwordPolicySpy.getPolicy.and.returnValue(of(mockPolicy));
    mfaServiceSpy.getStatus.and.returnValue(of(mockMfaStatus));

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
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfilePageComponent);
    component = fixture.componentInstance;
  });

  function getMarkSpy(): jasmine.Spy {
    return spyOn((component as any).cdr, 'markForCheck');
  }

  it('loadProfile should call markForCheck after HTTP response', () => {
    // Set up spy before ngOnInit triggers loadProfile
    const loadSubject = new Subject<any>();
    profileServiceSpy.getProfile.and.returnValue(loadSubject.asObservable());

    fixture.detectChanges(); // triggers ngOnInit → loadProfile

    markSpy = getMarkSpy();

    loadSubject.next(mockProfileResponse);
    loadSubject.complete();

    expect(markSpy).toHaveBeenCalled();
  });

  it('userProfile.profile$ should call markForCheck when emitting', () => {
    fixture.detectChanges(); // triggers ngOnInit

    markSpy = getMarkSpy();

    profileSubject.next({
      passwordResetRequired: true,
      passwordResetReason: 'Admin forced reset',
      passwordChangedAt: '2025-06-01T00:00:00Z',
    });

    expect(markSpy).toHaveBeenCalled();
  });

  it('startMfaEnroll should call markForCheck after success', () => {
    fixture.detectChanges();

    markSpy = getMarkSpy();

    const enrollSubject = new Subject<any>();
    mfaServiceSpy.enroll.and.returnValue(enrollSubject.asObservable());

    component.startMfaEnroll();

    enrollSubject.next({
      qr_code: 'data:image/png;base64,abc',
      secret: 'ABCDEF',
      backup_codes: ['111', '222'],
    });
    enrollSubject.complete();

    expect(markSpy).toHaveBeenCalled();
  });

  it('changePassword error should call markForCheck', () => {
    fixture.detectChanges();

    markSpy = getMarkSpy();

    const errorSubject = new Subject<any>();
    passwordPolicySpy.changePassword.and.returnValue(errorSubject.asObservable());

    component.currentPassword = 'oldpass';
    component.newPassword = 'NewPass123!';
    component.changePassword();

    errorSubject.error({ error: { current_password: ['Incorrect password.'] } });

    expect(markSpy).toHaveBeenCalled();
  });

  it('submitReEnrollVerify should call markForCheck after success', () => {
    fixture.detectChanges();

    markSpy = getMarkSpy();

    const reEnrollSubject = new Subject<any>();
    mfaServiceSpy.reEnroll.and.returnValue(reEnrollSubject.asObservable());

    component.mfaCode = '123456';
    component.submitReEnrollVerify();

    reEnrollSubject.next({
      qr_code: 'data:image/png;base64,abc',
      secret: 'NEWSECRET',
      backup_codes: ['aaa', 'bbb'],
      re_enroll_token: 'token123',
    });
    reEnrollSubject.complete();

    expect(markSpy).toHaveBeenCalled();
    expect(component.mfaStep).toBe('re-enrolling');
    expect(component.reEnrollToken).toBe('token123');
  });

  it('confirmReEnroll should call markForCheck after success', () => {
    fixture.detectChanges();

    markSpy = getMarkSpy();

    const confirmSubject = new Subject<any>();
    mfaServiceSpy.reEnrollConfirm.and.returnValue(confirmSubject.asObservable());

    component.mfaCode = '654321';
    component.reEnrollToken = 'token123';
    component.confirmReEnroll();

    confirmSubject.next({ detail: 'MFA device has been updated.' });
    confirmSubject.complete();

    expect(markSpy).toHaveBeenCalled();
    expect(component.mfaStep).toBe('idle');
    expect(component.reEnrollToken).toBe('');
  });
});
