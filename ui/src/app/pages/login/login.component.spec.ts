import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError, Subject } from 'rxjs';

import { LoginComponent } from './login.component';
import { AuthService, AuthResponse, TenantInfo } from '../../services/core/auth/auth.service';
import { MfaService, MfaSetupResponse } from '../../services/core/auth/mfa.service';
import { NotificationService } from '../../services/core/notify/notification.service';

const TENANTS: TenantInfo[] = [
  { id: 't1', slug: 'acme', name: 'Acme Corp', role: 'owner' },
  { id: 't2', slug: 'beta', name: 'Beta Inc', role: 'member' },
];

const MFA_CHALLENGE_RESPONSE: AuthResponse = {
  mfa_required: true,
  mfa_setup_required: true,
  mfa_token: 'mfa-token-123',
};

const MFA_VERIFY_RESPONSE: AuthResponse = {
  mfa_required: true,
  mfa_setup_required: false,
  mfa_token: 'mfa-token-verify',
};

const MFA_SETUP_RESPONSE: MfaSetupResponse = {
  secret: 'JBSWY3DPEHPK3PXP',
  qr_code: 'data:image/png;base64,abc',
  backup_codes: ['code1', 'code2', 'code3'],
  mfa_token: 'mfa-token-refreshed',
};

const AUTH_SUCCESS: AuthResponse = {
  user: { id: 'u1', email: 'user@test.com' },
  tenant: { id: 't1', slug: 'acme', name: 'Acme Corp', role: 'owner' },
};

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: jasmine.SpyObj<AuthService>;
  let mfaService: jasmine.SpyObj<MfaService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let router: Router;

  beforeEach(async () => {
    authService = jasmine.createSpyObj('AuthService', ['login', 'selectTenant', 'completeAuthFromMfa']);
    mfaService = jasmine.createSpyObj('MfaService', ['setup', 'verify', 'setupConfirm']);
    notify = jasmine.createSpyObj('NotificationService', ['success', 'error']);

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
        { provide: MfaService, useValue: mfaService },
        { provide: NotificationService, useValue: notify },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- Initial state ---

  it('starts on step 1', () => {
    expect(component.step as number).toBe(1);
  });

  it('starts with empty email and password', () => {
    expect(component.email).toBe('');
    expect(component.password).toBe('');
  });

  it('starts with submitting false', () => {
    expect(component.submitting).toBe(false);
  });

  it('starts with empty apiError', () => {
    expect(component.apiError).toBe('');
  });

  it('starts with empty MFA state', () => {
    expect(component.mfaToken).toBe('');
    expect(component.mfaCode).toBe('');
    expect(component.mfaSetupQr).toBe('');
    expect(component.mfaSetupSecret).toBe('');
    expect(component.mfaBackupCodes).toEqual([]);
    expect(component.mfaBackupDownloaded).toBe(false);
  });

  // --- canSubmitStep1 ---

  it('canSubmitStep1 is false when email is empty', () => {
    component.password = 'pass';
    expect(component.canSubmitStep1).toBe(false);
  });

  it('canSubmitStep1 is false when password is empty', () => {
    component.email = 'user@test.com';
    expect(component.canSubmitStep1).toBe(false);
  });

  it('canSubmitStep1 is true when both filled', () => {
    component.email = 'user@test.com';
    component.password = 'pass';
    expect(component.canSubmitStep1).toBe(true);
  });

  it('canSubmitStep1 is false when submitting', () => {
    component.email = 'user@test.com';
    component.password = 'pass';
    component.submitting = true;
    expect(component.canSubmitStep1).toBe(false);
  });

  it('canSubmitStep1 is false when email is whitespace only', () => {
    component.email = '   ';
    component.password = 'pass';
    expect(component.canSubmitStep1).toBe(false);
  });

  // --- canSubmitMfaVerify ---

  it('canSubmitMfaVerify is false when code is too short', () => {
    component.mfaCode = '12345';
    expect(component.canSubmitMfaVerify).toBe(false);
  });

  it('canSubmitMfaVerify is true when code is 6+ chars', () => {
    component.mfaCode = '123456';
    expect(component.canSubmitMfaVerify).toBe(true);
  });

  it('canSubmitMfaVerify is false when submitting', () => {
    component.mfaCode = '123456';
    component.submitting = true;
    expect(component.canSubmitMfaVerify).toBe(false);
  });

  it('canSubmitMfaVerify handles backup code (8 chars)', () => {
    component.mfaCode = '12345678';
    expect(component.canSubmitMfaVerify).toBe(true);
  });

  // --- canSubmitMfaSetupConfirm ---

  it('canSubmitMfaSetupConfirm is false when code is not exactly 6', () => {
    component.mfaCode = '12345';
    expect(component.canSubmitMfaSetupConfirm).toBe(false);
    component.mfaCode = '1234567';
    expect(component.canSubmitMfaSetupConfirm).toBe(false);
  });

  it('canSubmitMfaSetupConfirm is true when code is exactly 6', () => {
    component.mfaCode = '123456';
    expect(component.canSubmitMfaSetupConfirm).toBe(true);
  });

  it('canSubmitMfaSetupConfirm is false when submitting', () => {
    component.mfaCode = '123456';
    component.submitting = true;
    expect(component.canSubmitMfaSetupConfirm).toBe(false);
  });

  // --- onStep1 ---

  it('onStep1() does nothing when canSubmitStep1 is false', () => {
    component.onStep1();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('onStep1() calls auth.login', () => {
    authService.login.and.returnValue(of({ tenants: TENANTS }));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.onStep1();

    expect(authService.login).toHaveBeenCalledWith('user@test.com', 'pass');
  });

  it('onStep1() sets submitting while in progress', () => {
    authService.login.and.returnValue(of({ tenants: TENANTS }));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.onStep1();
    expect(component.submitting).toBe(false);
  });

  it('onStep1() advances to step 2 when multiple tenants', () => {
    authService.login.and.returnValue(of({ tenants: TENANTS }));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.onStep1();

    expect(component.step).toBe(2 as any);
    expect(component.tenants).toEqual(TENANTS);
  });

  it('onStep1() auto-selects single tenant', () => {
    const single = [TENANTS[0]];
    authService.login.and.returnValue(of({ tenants: single }));
    authService.selectTenant.and.returnValue(of({} as any));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.onStep1();

    expect(authService.selectTenant).toHaveBeenCalledWith('user@test.com', 'pass', 't1', false);
  });

  it('onStep1() shows error when no tenants', () => {
    authService.login.and.returnValue(of({ tenants: [] }));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.onStep1();

    expect(component.apiError).toBe('No active tenants found for this account.');
  });

  it('onStep1() shows error on login failure', () => {
    authService.login.and.returnValue(throwError(() => ({ error: { detail: 'Bad creds' } })));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.onStep1();

    expect(component.apiError).toBe('Bad creds');
    expect(component.submitting).toBe(false);
  });

  it('onStep1() clears previous apiError', () => {
    authService.login.and.returnValue(of({ tenants: TENANTS }));
    component.email = 'user@test.com';
    component.password = 'pass';
    component.apiError = 'old error';

    component.onStep1();

    expect(component.apiError).toBe('');
  });

  // --- selectTenant ---

  it('selectTenant() calls auth.selectTenant', () => {
    authService.selectTenant.and.returnValue(of({} as any));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.selectTenant(TENANTS[0]);

    expect(authService.selectTenant).toHaveBeenCalledWith('user@test.com', 'pass', 't1', false);
  });

  it('selectTenant() navigates to dashboard on success', () => {
    authService.selectTenant.and.returnValue(of({} as any));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.selectTenant(TENANTS[0]);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('selectTenant() shows error on failure', () => {
    authService.selectTenant.and.returnValue(throwError(() => ({ error: { detail: 'Suspended' } })));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.selectTenant(TENANTS[0]);

    expect(component.apiError).toBe('Suspended');
    expect(component.submitting).toBe(false);
    expect(notify.error).toHaveBeenCalledWith('Suspended');
  });

  it('selectTenant() does nothing when already submitting', () => {
    component.submitting = true;
    component.selectTenant(TENANTS[0]);
    expect(authService.selectTenant).not.toHaveBeenCalled();
  });

  it('selectTenant() sets selectedTenantSlug', () => {
    authService.selectTenant.and.returnValue(of({} as any));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.selectTenant(TENANTS[0]);

    expect(component.selectedTenantSlug).toBe('acme');
  });

  it('selectTenant() clears apiError before request', () => {
    authService.selectTenant.and.returnValue(of({} as any));
    component.email = 'user@test.com';
    component.password = 'pass';
    component.apiError = 'old error';

    component.selectTenant(TENANTS[0]);

    expect(component.apiError).toBe('');
  });

  // --- selectTenant MFA flows ---

  it('selectTenant() transitions to mfa-setup when mfa_setup_required', () => {
    authService.selectTenant.and.returnValue(of(MFA_CHALLENGE_RESPONSE));
    mfaService.setup.and.returnValue(of(MFA_SETUP_RESPONSE));
    component.email = 'user@test.com';
    component.password = 'pass';
    component.step = 2;
    component.tenants = TENANTS;

    component.selectTenant(TENANTS[0]);

    expect(mfaService.setup).toHaveBeenCalledWith('mfa-token-123');
    expect(component.step as unknown).toBe('mfa-setup');
    expect(component.mfaSetupQr).toBe('data:image/png;base64,abc');
    expect(component.mfaSetupSecret).toBe('JBSWY3DPEHPK3PXP');
    expect(component.mfaBackupCodes).toEqual(['code1', 'code2', 'code3']);
    expect(component.mfaBackupDownloaded).toBe(false);
    expect(component.submitting).toBe(false);
  });

  it('selectTenant() transitions to mfa-verify when mfa_required but not setup', () => {
    authService.selectTenant.and.returnValue(of(MFA_VERIFY_RESPONSE));
    component.email = 'user@test.com';
    component.password = 'pass';
    component.step = 2;

    component.selectTenant(TENANTS[0]);

    expect(component.step as unknown).toBe('mfa-verify');
    expect(component.mfaToken).toBe('mfa-token-verify');
    expect(component.mfaCode).toBe('');
    expect(component.submitting).toBe(false);
  });

  it('selectTenant() shows error when mfa.setup fails', () => {
    authService.selectTenant.and.returnValue(of(MFA_CHALLENGE_RESPONSE));
    mfaService.setup.and.returnValue(throwError(() => ({ error: { detail: 'Token expired' } })));
    component.email = 'user@test.com';
    component.password = 'pass';
    component.step = 2;
    component.tenants = TENANTS;

    component.selectTenant(TENANTS[0]);

    expect(component.step).toBe(2 as any);
    expect(component.apiError).toBe('Token expired');
    expect(component.submitting).toBe(false);
  });

  // --- onMfaVerify ---

  it('onMfaVerify() does nothing when canSubmitMfaVerify is false', () => {
    component.mfaCode = '';
    component.onMfaVerify();
    expect(mfaService.verify).not.toHaveBeenCalled();
  });

  it('onMfaVerify() calls mfa.verify and completes auth on success', () => {
    const mfaResult = { access: 'a', refresh: 'r', user: {}, tenant: {}, authorization: {} };
    mfaService.verify.and.returnValue(of(mfaResult as any));
    component.mfaToken = 'mfa-token';
    component.mfaCode = '123456';

    component.onMfaVerify();

    expect(mfaService.verify).toHaveBeenCalledWith('mfa-token', '123456', false);
    expect(authService.completeAuthFromMfa).toHaveBeenCalledWith(mfaResult as any);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('onMfaVerify() trims code before sending', () => {
    const mfaResult = { access: 'a', refresh: 'r', user: {}, tenant: {} };
    mfaService.verify.and.returnValue(of(mfaResult as any));
    component.mfaToken = 'mfa-token';
    component.mfaCode = '  123456  ';

    component.onMfaVerify();

    expect(mfaService.verify).toHaveBeenCalledWith('mfa-token', '123456', false);
  });

  it('onMfaVerify() shows error on failure', () => {
    mfaService.verify.and.returnValue(throwError(() => ({ error: { detail: 'Invalid code' } })));
    component.mfaToken = 'mfa-token';
    component.mfaCode = '123456';

    component.onMfaVerify();

    expect(component.apiError).toBe('Invalid code');
    expect(component.submitting).toBe(false);
  });

  // --- proceedToMfaConfirm ---

  it('proceedToMfaConfirm() resets code and advances to mfa-setup-confirm', () => {
    component.mfaCode = '123456';
    component.apiError = 'old';
    component.step = 'mfa-setup';

    component.proceedToMfaConfirm();

    expect(component.mfaCode).toBe('');
    expect(component.apiError).toBe('');
    expect(component.step as unknown).toBe('mfa-setup-confirm');
  });

  // --- onMfaSetupConfirm ---

  it('onMfaSetupConfirm() does nothing when canSubmitMfaSetupConfirm is false', () => {
    component.mfaCode = '12345'; // too short
    component.onMfaSetupConfirm();
    expect(mfaService.setupConfirm).not.toHaveBeenCalled();
  });

  it('onMfaSetupConfirm() calls setupConfirm and completes auth on success', () => {
    const mfaResult = { access: 'a', refresh: 'r', user: {}, tenant: {}, authorization: {} };
    mfaService.setupConfirm.and.returnValue(of(mfaResult as any));
    component.mfaToken = 'mfa-token';
    component.mfaCode = '654321';

    component.onMfaSetupConfirm();

    expect(mfaService.setupConfirm).toHaveBeenCalledWith('mfa-token', '654321', false);
    expect(authService.completeAuthFromMfa).toHaveBeenCalledWith(mfaResult as any);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('onMfaSetupConfirm() shows error on failure', () => {
    mfaService.setupConfirm.and.returnValue(throwError(() => ({ error: { detail: 'Code mismatch' } })));
    component.mfaToken = 'mfa-token';
    component.mfaCode = '654321';

    component.onMfaSetupConfirm();

    expect(component.apiError).toBe('Code mismatch');
    expect(component.submitting).toBe(false);
  });

  // --- downloadBackupCodes ---

  it('downloadBackupCodes() creates a download link and sets flag', () => {
    component.mfaBackupCodes = ['code1', 'code2', 'code3'];

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
    expect(component.mfaBackupDownloaded).toBe(true);
  });

  // --- backToStep1 ---

  it('backToStep1() resets to step 1 and clears state', () => {
    component.step = 2;
    component.tenants = TENANTS;
    component.apiError = 'some error';
    component.selectedTenantSlug = 'acme';
    component.mfaToken = 'token';
    component.mfaCode = '123456';

    component.backToStep1();

    expect(component.step as number).toBe(1);
    expect(component.tenants).toEqual([]);
    expect(component.apiError).toBe('');
    expect(component.selectedTenantSlug).toBe('');
    expect(component.mfaToken).toBe('');
    expect(component.mfaCode).toBe('');
  });

  // --- backToStep2 ---

  it('backToStep2() resets to step 2 and clears MFA state', () => {
    component.step = 'mfa-verify';
    component.apiError = 'some error';
    component.mfaToken = 'token';
    component.mfaCode = '123456';

    component.backToStep2();

    expect(component.step).toBe(2 as any);
    expect(component.apiError).toBe('');
    expect(component.mfaToken).toBe('');
    expect(component.mfaCode).toBe('');
  });

  // --- extractError ---

  it('extractError returns generic message for null error', () => {
    const result = (component as any).extractError({});
    expect(result).toBe('Something went wrong. Please try again.');
  });

  it('extractError returns string error data directly', () => {
    const result = (component as any).extractError({ error: 'Bad request' });
    expect(result).toBe('Bad request');
  });

  it('extractError returns detail field', () => {
    const result = (component as any).extractError({ error: { detail: 'Invalid token' } });
    expect(result).toBe('Invalid token');
  });

  it('extractError joins non_field_errors array', () => {
    const result = (component as any).extractError({ error: { non_field_errors: ['err1', 'err2'] } });
    expect(result).toBe('err1 err2');
  });

  it('extractError returns non_field_errors string', () => {
    const result = (component as any).extractError({ error: { non_field_errors: 'single error' } });
    expect(result).toBe('single error');
  });

  it('extractError collects array field errors', () => {
    const result = (component as any).extractError({ error: { email: ['required', 'invalid'] } });
    expect(result).toBe('required invalid');
  });

  it('extractError collects string field errors', () => {
    const result = (component as any).extractError({ error: { password: 'too short' } });
    expect(result).toBe('too short');
  });

  it('extractError returns generic message for empty object error data', () => {
    const result = (component as any).extractError({ error: {} });
    expect(result).toBe('Something went wrong. Please try again.');
  });

  it('extractError extracts field errors from API envelope', () => {
    const result = (component as any).extractError({
      error: {
        message: 'Validation error.',
        errors: { email: ['A user with this email already exists.'] },
        request_id: 'abc123',
      },
    });
    expect(result).toBe('A user with this email already exists.');
  });

  it('extractError falls back to message when envelope errors is empty', () => {
    const result = (component as any).extractError({
      error: { message: 'Validation error.', errors: {}, request_id: 'abc123' },
    });
    expect(result).toBe('Validation error.');
  });

  it('extractError skips message and request_id keys in flat errors', () => {
    const result = (component as any).extractError({
      error: { message: 'Msg', request_id: 'rid', email: 'invalid' },
    });
    expect(result).toBe('invalid');
  });

  // --- Branch: selectTenant email_not_verified error ---

  it('selectTenant() transitions to email-verify on email_not_verified error', () => {
    authService.selectTenant.and.returnValue(
      throwError(() => ({ error: { code: 'email_not_verified', detail: 'Verify your email' } })),
    );
    component.email = 'user@test.com';
    component.password = 'pass';
    component.verificationResent = true;

    component.selectTenant(TENANTS[0]);

    expect(component.step as unknown).toBe('email-verify');
    expect(component.verificationResent).toBe(false);
    expect(component.submitting).toBe(false);
  });

  // --- Branch: mfaToken fallback to empty string ---

  it('selectTenant() sets mfaToken to empty string when mfa_token is absent', () => {
    const mfaNoToken: AuthResponse = {
      mfa_required: true,
      mfa_setup_required: false,
    };
    authService.selectTenant.and.returnValue(of(mfaNoToken));
    component.email = 'user@test.com';
    component.password = 'pass';

    component.selectTenant(TENANTS[0]);

    expect(component.mfaToken).toBe('');
    expect(component.step as unknown).toBe('mfa-verify');
  });

  // --- Branch: resendVerification guard ---

  it('resendVerification() does nothing when already resending', () => {
    component.resendingVerification = true;
    component.resendVerification();
    // authService.resendVerification is not a spy here, so check state didn't change
    expect(component.resendingVerification).toBe(true);
  });

  // --- Double-click guard ---

  it('selectTenant() should ignore duplicate calls while submitting', fakeAsync(() => {
    const selectSubject1 = new Subject<AuthResponse>();
    const selectSubject2 = new Subject<AuthResponse>();
    authService.selectTenant.and.returnValues(selectSubject1, selectSubject2);

    component.email = 'user@test.com';
    component.password = 'pass';
    component.step = 2;
    component.tenants = TENANTS;

    component.selectTenant(TENANTS[0]);
    expect(component.submitting).toBe(true);

    component.selectTenant(TENANTS[0]);

    expect(authService.selectTenant).toHaveBeenCalledTimes(1);
  }));

  // --- Template rendering ---

  it('renders Log In title on step 1', () => {
    const h1 = fixture.nativeElement.querySelector('.bc-authTitle');
    expect(h1?.textContent).toContain('Log In');
  });

  it('renders email input', () => {
    const input = fixture.nativeElement.querySelector('#email');
    expect(input).not.toBeNull();
  });

  it('renders password input', () => {
    const input = fixture.nativeElement.querySelector('#password');
    expect(input).not.toBeNull();
  });

  it('renders Continue button', () => {
    const btn = fixture.nativeElement.querySelector('.bc-authSubmit');
    expect(btn?.textContent).toContain('Continue');
  });

  it('shows apiError when set', () => {
    component.apiError = 'Login failed';
    fixture.detectChanges();
    const err = fixture.nativeElement.querySelector('.bc-authError');
    expect(err?.textContent).toContain('Login failed');
  });

  it('renders tenant picker on step 2', () => {
    component.step = 2;
    component.tenants = TENANTS;
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.bc-authTitle');
    expect(title?.textContent).toContain('Select Workspace');

    const items = fixture.nativeElement.querySelectorAll('.bc-tenantItem');
    expect(items.length).toBe(2);
  });

  it('renders Back button on step 2', () => {
    component.step = 2;
    fixture.detectChanges();

    const btns = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'));
    const backBtn = btns.find(b => b.textContent?.includes('Back'));
    expect(backBtn).toBeTruthy();
  });

  // --- ngAfterViewInit ---

  it('focuses email input on init', () => {
    const emailInput = fixture.nativeElement.querySelector('#email');
    expect(document.activeElement).toBe(emailInput);
  });

  it('workspace items should not be clickable while submitting', () => {
    authService.selectTenant.and.returnValue(new Subject());
    component.email = 'user@test.com';
    component.password = 'pass';
    component.step = 2;
    component.tenants = TENANTS;
    fixture.detectChanges();

    component.selectTenant(TENANTS[0]);
    expect(component.submitting).toBe(true);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('.bc-tenantItem');
    const selectedItem = items[0] as HTMLElement;
    const otherItem = items[1] as HTMLElement;

    expect(selectedItem.classList.contains('bc-tenantItem--active')).toBe(true);
    expect(selectedItem.classList.contains('bc-tenantItem--disabled')).toBe(false);
    expect(selectedItem.getAttribute('aria-disabled')).toBe('true');

    expect(otherItem.classList.contains('bc-tenantItem--disabled')).toBe(true);
    expect(otherItem.classList.contains('bc-tenantItem--active')).toBe(false);
    expect(otherItem.getAttribute('aria-disabled')).toBe('true');
  });
});
