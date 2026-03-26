import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { MfaSetupComponent } from './mfa-setup.component';
import { AuthService } from '../../services/core/auth/auth.service';
import { MfaService, MfaEnrollResponse } from '../../services/core/auth/mfa.service';
import { TokenService } from '../../services/core/auth/token.service';
import { UserProfileService } from '../../services/core/profile/user-profile.service';
import { NotificationService } from '../../services/core/notify/notification.service';

const ENROLL_RESPONSE: MfaEnrollResponse = {
  secret: 'JBSWY3DPEHPK3PXP',
  qr_code: 'data:image/png;base64,abc',
  backup_codes: ['code1', 'code2', 'code3'],
};

describe('MfaSetupComponent', () => {
  let component: MfaSetupComponent;
  let fixture: ComponentFixture<MfaSetupComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let mfaService: jasmine.SpyObj<MfaService>;
  let tokenService: jasmine.SpyObj<TokenService>;
  let profileService: jasmine.SpyObj<UserProfileService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let router: Router;

  beforeEach(async () => {
    authService = jasmine.createSpyObj('AuthService', ['logout']);
    mfaService = jasmine.createSpyObj('MfaService', ['enroll', 'enrollConfirm']);
    tokenService = jasmine.createSpyObj('TokenService', ['isAuthenticated', 'setAuthenticated', 'clear']);
    profileService = jasmine.createSpyObj('UserProfileService', ['clearMfaSetupFlag']);
    notify = jasmine.createSpyObj('NotificationService', ['success', 'error']);

    // Default: enroll returns success
    mfaService.enroll.and.returnValue(of(ENROLL_RESPONSE));

    await TestBed.configureTestingModule({
      imports: [MfaSetupComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
        { provide: MfaService, useValue: mfaService },
        { provide: TokenService, useValue: tokenService },
        { provide: UserProfileService, useValue: profileService },
        { provide: NotificationService, useValue: notify },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MfaSetupComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl');
    fixture.detectChanges(); // triggers ngOnInit -> startEnrollment
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit / startEnrollment ---

  it('calls mfa.enroll on init and transitions to enroll step', () => {
    expect(mfaService.enroll).toHaveBeenCalled();
    expect(component.step).toBe('enroll');
    expect(component.qrCode).toBe('data:image/png;base64,abc');
    expect(component.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(component.backupCodes).toEqual(['code1', 'code2', 'code3']);
    expect(component.backupDownloaded).toBe(false);
  });

  it('redirects to dashboard when MFA is already enabled', () => {
    // Reset and create with error response
    mfaService.enroll.and.returnValue(
      throwError(() => ({ error: { detail: 'MFA is already enabled. Disable it first.' } })),
    );

    const fixture2 = TestBed.createComponent(MfaSetupComponent);
    fixture2.detectChanges();

    expect(profileService.clearMfaSetupFlag).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows generic error when enroll fails with unknown error', () => {
    mfaService.enroll.and.returnValue(
      throwError(() => ({ error: {} })),
    );

    const fixture2 = TestBed.createComponent(MfaSetupComponent);
    const comp2 = fixture2.componentInstance;
    fixture2.detectChanges();

    expect(comp2.apiError).toBe('Failed to start MFA enrollment.');
    expect(comp2.step).toBe('enroll');
  });

  it('shows detail error from API on enroll failure', () => {
    mfaService.enroll.and.returnValue(
      throwError(() => ({ error: { detail: 'Rate limited' } })),
    );

    const fixture2 = TestBed.createComponent(MfaSetupComponent);
    const comp2 = fixture2.componentInstance;
    fixture2.detectChanges();

    expect(comp2.apiError).toBe('Rate limited');
    expect(comp2.step).toBe('enroll');
  });

  // --- canSubmitConfirm ---

  it('canSubmitConfirm is false when code is empty', () => {
    component.code = '';
    expect(component.canSubmitConfirm).toBe(false);
  });

  it('canSubmitConfirm is false when code is too short', () => {
    component.code = '12345';
    expect(component.canSubmitConfirm).toBe(false);
  });

  it('canSubmitConfirm is true when code is 6 digits', () => {
    component.code = '123456';
    expect(component.canSubmitConfirm).toBe(true);
  });

  it('canSubmitConfirm is false when submitting', () => {
    component.code = '123456';
    component.submitting = true;
    expect(component.canSubmitConfirm).toBe(false);
  });

  it('canSubmitConfirm is false when code is whitespace only', () => {
    component.code = '      ';
    expect(component.canSubmitConfirm).toBe(false);
  });

  // --- downloadBackupCodes ---

  it('creates download link and sets backupDownloaded flag', () => {
    component.backupCodes = ['code1', 'code2', 'code3'];

    const clickSpy = jasmine.createSpy('click');
    spyOn(document, 'createElement').and.returnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as any);
    spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
    spyOn(URL, 'revokeObjectURL');

    component.downloadBackupCodes();

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(component.backupDownloaded).toBe(true);
  });

  // --- proceedToConfirm ---

  it('transitions to confirm step and resets code and error', () => {
    component.code = '123456';
    component.apiError = 'old error';

    component.proceedToConfirm();

    expect(component.code).toBe('');
    expect(component.apiError).toBe('');
    expect(component.step).toBe('confirm');
  });

  // --- onConfirm ---

  it('does nothing when canSubmitConfirm is false', () => {
    component.code = '';
    component.onConfirm();
    expect(mfaService.enrollConfirm).not.toHaveBeenCalled();
  });

  it('calls enrollConfirm with trimmed code on success', fakeAsync(() => {
    mfaService.enrollConfirm.and.returnValue(of({ detail: 'ok' }));
    component.code = ' 123456 ';
    component.step = 'confirm';

    component.onConfirm();

    expect(mfaService.enrollConfirm).toHaveBeenCalledWith('123456');
    expect(component.submitting).toBe(true); // still true, waiting for setTimeout
    expect(profileService.clearMfaSetupFlag).toHaveBeenCalled();
    expect(notify.success).toHaveBeenCalledWith('MFA enabled successfully!');
    expect(component.step).toBe('done');

    tick(800);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  }));

  it('clears mfa flag and shows done step on confirm success', () => {
    mfaService.enrollConfirm.and.returnValue(of({ detail: 'ok' }));
    component.code = '123456';
    component.step = 'confirm';

    component.onConfirm();

    expect(profileService.clearMfaSetupFlag).toHaveBeenCalled();
    expect(component.step).toBe('done');
  });

  it('shows error on enrollConfirm failure', () => {
    mfaService.enrollConfirm.and.returnValue(
      throwError(() => ({ error: { detail: 'Invalid code' } })),
    );
    component.code = '123456';
    component.step = 'confirm';

    component.onConfirm();

    expect(component.submitting).toBe(false);
    expect(component.apiError).toBe('Invalid code');
  });

  it('shows generic error when enrollConfirm fails without detail', () => {
    mfaService.enrollConfirm.and.returnValue(
      throwError(() => ({ error: {} })),
    );
    component.code = '123456';
    component.step = 'confirm';

    component.onConfirm();

    expect(component.apiError).toBe('Invalid code. Please try again.');
  });

  it('sets submitting true and clears apiError on confirm', () => {
    mfaService.enrollConfirm.and.returnValue(of({ detail: 'ok' }));
    component.code = '123456';
    component.apiError = 'old error';

    component.onConfirm();

    expect(component.apiError).toBe(''); // cleared before request
  });

  // --- onLogout ---

  it('logs out and navigates to login on success', () => {
    authService.logout.and.returnValue(of(void 0));

    component.onLogout();

    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('navigates to login even on logout error', () => {
    authService.logout.and.returnValue(throwError(() => new Error('fail')));

    component.onLogout();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  // --- Template rendering ---

  it('renders loading state initially when step is loading', () => {
    component.step = 'loading';
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.bc-authTitle');
    expect(title?.textContent).toContain('Setting Up MFA');
  });

  it('renders enroll step with QR code', () => {
    component.step = 'enroll';
    component.qrCode = 'data:image/png;base64,abc';
    component.secret = 'SECRET';
    component.backupCodes = ['c1', 'c2'];
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.bc-authTitle');
    expect(title?.textContent).toContain('Set Up MFA');

    const img = fixture.nativeElement.querySelector('.bc-mfaQrImg');
    expect(img).not.toBeNull();

    const secret = fixture.nativeElement.querySelector('.bc-mfaSecret');
    expect(secret?.textContent).toContain('SECRET');
  });

  it('disables continue button when backup not downloaded', () => {
    component.step = 'enroll';
    component.qrCode = 'data:image/png;base64,abc';
    component.backupDownloaded = false;
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.bc-authSubmit') as HTMLButtonElement;
    expect(btn?.disabled).toBe(true);
    expect(btn?.textContent).toContain('Download codes to continue');
  });

  it('enables continue button when backup downloaded', () => {
    component.step = 'enroll';
    component.qrCode = 'data:image/png;base64,abc';
    component.backupDownloaded = true;
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('.bc-authSubmit') as HTMLButtonElement;
    expect(btn?.disabled).toBe(false);
    expect(btn?.textContent).toContain('Continue');
  });

  it('renders confirm step with code input', () => {
    component.step = 'confirm';
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.bc-authTitle');
    expect(title?.textContent).toContain('Verify Setup');

    const input = fixture.nativeElement.querySelector('#mfaSetupCode');
    expect(input).not.toBeNull();
  });

  it('renders done step', () => {
    component.step = 'done';
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.bc-authTitle');
    expect(title?.textContent).toContain('MFA Enabled');
  });

  it('shows apiError when set on enroll step', () => {
    component.step = 'enroll';
    component.apiError = 'Enrollment failed';
    fixture.detectChanges();

    const err = fixture.nativeElement.querySelector('.bc-authError');
    expect(err?.textContent).toContain('Enrollment failed');
  });

  it('shows apiError when set on confirm step', () => {
    component.step = 'confirm';
    component.apiError = 'Code invalid';
    fixture.detectChanges();

    const err = fixture.nativeElement.querySelector('.bc-authError');
    expect(err?.textContent).toContain('Code invalid');
  });
});
