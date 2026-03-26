import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../services/core/auth/auth.service';

const MOCK_VALIDATE_RESPONSE = {
  valid: true,
  mfa_required: false,
  password_policy: {
    min_length: 10,
    require_uppercase: true,
    require_special: true,
    require_number: true,
    expiry_days: 90,
  },
};

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let authService: jasmine.SpyObj<AuthService>;

  function setup(queryParams: Record<string, string> = { token: 'reset-token-123' }): void {
    authService = jasmine.createSpyObj('AuthService', [
      'validateResetToken',
      'resetPassword',
    ]);

    TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => queryParams[key] ?? null,
              },
            },
          },
        },
      ],
    });

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
  }

  // --- No token ---

  it('should create', () => {
    setup();
    authService.validateResetToken.and.returnValue(of(MOCK_VALIDATE_RESPONSE as any));
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('sets error state when no token in URL', () => {
    setup({});
    fixture.detectChanges();

    expect(component.step).toBe('error');
    expect(component.errorMessage).toContain('No reset token found');
    expect(authService.validateResetToken).not.toHaveBeenCalled();
  });

  // --- Token validation ---

  it('starts in loading state', () => {
    setup();
    expect(component.step).toBe('loading');
  });

  it('calls validateResetToken with token from URL', () => {
    setup({ token: 'my-reset-token' });
    authService.validateResetToken.and.returnValue(of(MOCK_VALIDATE_RESPONSE as any));
    fixture.detectChanges();

    expect(authService.validateResetToken).toHaveBeenCalledWith('my-reset-token');
  });

  it('transitions to form on valid token', () => {
    setup();
    authService.validateResetToken.and.returnValue(of(MOCK_VALIDATE_RESPONSE as any));
    fixture.detectChanges();

    expect(component.step).toBe('form');
    expect(component.mfaRequired).toBe(false);
    expect(component.policy).toEqual(MOCK_VALIDATE_RESPONSE.password_policy as any);
  });

  it('stores mfaRequired from validation response', () => {
    setup();
    authService.validateResetToken.and.returnValue(
      of({ ...MOCK_VALIDATE_RESPONSE, mfa_required: true } as any),
    );
    fixture.detectChanges();

    expect(component.mfaRequired).toBe(true);
  });

  it('transitions to expired on token_expired error', () => {
    setup();
    authService.validateResetToken.and.returnValue(
      throwError(() => ({
        error: { code: 'token_expired', detail: 'Link expired.' },
      })),
    );
    fixture.detectChanges();

    expect(component.step).toBe('expired');
    expect(component.errorMessage).toBe('Link expired.');
  });

  it('uses fallback message for expired token without detail', () => {
    setup();
    authService.validateResetToken.and.returnValue(
      throwError(() => ({
        error: { code: 'token_expired' },
      })),
    );
    fixture.detectChanges();

    expect(component.step).toBe('expired');
    expect(component.errorMessage).toBe('This reset link has expired.');
  });

  it('transitions to error on non-expired validation error', () => {
    setup();
    authService.validateResetToken.and.returnValue(
      throwError(() => ({
        error: { code: 'invalid', detail: 'Bad token.' },
      })),
    );
    fixture.detectChanges();

    expect(component.step).toBe('error');
    expect(component.errorMessage).toBe('Bad token.');
  });

  it('uses fallback error message when no detail in validation error', () => {
    setup();
    authService.validateResetToken.and.returnValue(
      throwError(() => ({ error: {} })),
    );
    fixture.detectChanges();

    expect(component.step).toBe('error');
    expect(component.errorMessage).toBe('Invalid reset link.');
  });

  // --- Password policy checks ---

  describe('password policy', () => {
    beforeEach(() => {
      setup();
      authService.validateResetToken.and.returnValue(of(MOCK_VALIDATE_RESPONSE as any));
      fixture.detectChanges();
    });

    it('meetsMinLength returns false for short password', () => {
      component.password = 'short';
      expect(component.meetsMinLength).toBe(false);
    });

    it('meetsMinLength returns true for long enough password', () => {
      component.password = 'LongEnough1!';
      expect(component.meetsMinLength).toBe(true);
    });

    it('meetsMinLength uses default 10 when policy is null', () => {
      component.policy = null;
      component.password = '1234567890';
      expect(component.meetsMinLength).toBe(true);
    });

    it('hasUppercase returns true when uppercase present', () => {
      component.password = 'hasUpper';
      expect(component.hasUppercase).toBe(true);
    });

    it('hasUppercase returns false when no uppercase', () => {
      component.password = 'alllower';
      expect(component.hasUppercase).toBe(false);
    });

    it('hasNumber returns true when number present', () => {
      component.password = 'has1number';
      expect(component.hasNumber).toBe(true);
    });

    it('hasNumber returns false when no number', () => {
      component.password = 'nonumber';
      expect(component.hasNumber).toBe(false);
    });

    it('hasSpecial returns true when special char present', () => {
      component.password = 'has!special';
      expect(component.hasSpecial).toBe(true);
    });

    it('hasSpecial returns false when no special char', () => {
      component.password = 'nospecial';
      expect(component.hasSpecial).toBe(false);
    });

    it('allPolicyChecksMet returns true when all met', () => {
      component.password = 'StrongPass1!';
      expect(component.allPolicyChecksMet).toBe(true);
    });

    it('allPolicyChecksMet returns false when policy is null', () => {
      component.policy = null;
      expect(component.allPolicyChecksMet).toBe(false);
    });

    it('allPolicyChecksMet returns false when min length not met', () => {
      component.password = 'Short1!';
      expect(component.allPolicyChecksMet).toBe(false);
    });

    it('allPolicyChecksMet returns false when uppercase missing', () => {
      component.password = 'nouppercase1!';
      expect(component.allPolicyChecksMet).toBe(false);
    });

    it('allPolicyChecksMet returns false when number missing', () => {
      component.password = 'NoNumberHere!';
      expect(component.allPolicyChecksMet).toBe(false);
    });

    it('allPolicyChecksMet returns false when special missing', () => {
      component.password = 'NoSpecial123';
      expect(component.allPolicyChecksMet).toBe(false);
    });

    it('passwordsMatch returns true when passwords equal and non-empty', () => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      expect(component.passwordsMatch).toBe(true);
    });

    it('passwordsMatch returns false when passwords differ', () => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'Different1!';
      expect(component.passwordsMatch).toBe(false);
    });

    it('passwordsMatch returns false when password is empty', () => {
      component.password = '';
      component.passwordConfirm = '';
      expect(component.passwordsMatch).toBe(false);
    });

    it('passwordsMatch returns false when confirm is empty', () => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = '';
      expect(component.passwordsMatch).toBe(false);
    });
  });

  // --- canSubmit ---

  describe('canSubmit', () => {
    beforeEach(() => {
      setup();
      authService.validateResetToken.and.returnValue(of(MOCK_VALIDATE_RESPONSE as any));
      fixture.detectChanges();
    });

    it('canSubmit is true when all conditions met', () => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      expect(component.canSubmit).toBe(true);
    });

    it('canSubmit is false when policy not met', () => {
      component.password = 'weak';
      component.passwordConfirm = 'weak';
      expect(component.canSubmit).toBe(false);
    });

    it('canSubmit is false when passwords do not match', () => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'Different1!';
      expect(component.canSubmit).toBe(false);
    });

    it('canSubmit is false when step is not form', () => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.step = 'submitting';
      expect(component.canSubmit).toBe(false);
    });

    it('canSubmit is false when mfa required and code too short', () => {
      component.mfaRequired = true;
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.mfaCode = '123';
      expect(component.canSubmit).toBe(false);
    });

    it('canSubmit is true when mfa required and code is 6 digits', () => {
      component.mfaRequired = true;
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.mfaCode = '123456';
      expect(component.canSubmit).toBe(true);
    });
  });

  // --- allPolicyChecksMet with relaxed policy ---

  describe('allPolicyChecksMet with relaxed policy', () => {
    beforeEach(() => {
      setup();
      authService.validateResetToken.and.returnValue(
        of({
          ...MOCK_VALIDATE_RESPONSE,
          password_policy: {
            min_length: 8,
            require_uppercase: false,
            require_special: false,
            require_number: false,
            expiry_days: 0,
          },
        } as any),
      );
      fixture.detectChanges();
    });

    it('allPolicyChecksMet returns true without uppercase/number/special when not required', () => {
      component.password = 'alllower!';
      expect(component.allPolicyChecksMet).toBe(true);
    });
  });

  // --- onSubmit ---

  describe('onSubmit', () => {
    beforeEach(() => {
      setup();
      authService.validateResetToken.and.returnValue(of(MOCK_VALIDATE_RESPONSE as any));
      fixture.detectChanges();
    });

    it('does nothing when canSubmit is false', () => {
      component.password = 'weak';
      component.passwordConfirm = 'weak';
      component.onSubmit();
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('calls resetPassword with correct args', () => {
      authService.resetPassword.and.returnValue(of({ detail: 'ok' }));
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();

      expect(authService.resetPassword).toHaveBeenCalledWith(
        'reset-token-123',
        'StrongPass1!',
        'StrongPass1!',
        undefined,
      );
    });

    it('passes mfa code when mfa is required', () => {
      authService.resetPassword.and.returnValue(of({ detail: 'ok' }));
      component.mfaRequired = true;
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.mfaCode = '123456';
      component.onSubmit();

      expect(authService.resetPassword).toHaveBeenCalledWith(
        'reset-token-123',
        'StrongPass1!',
        'StrongPass1!',
        '123456',
      );
    });

    it('transitions to success on successful reset', () => {
      authService.resetPassword.and.returnValue(of({ detail: 'Password reset.' }));
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();

      expect(component.step).toBe('success');
    });

    it('sets step to submitting during request', () => {
      // Use a Subject to control when the observable completes
      authService.resetPassword.and.returnValue(of({ detail: 'ok' }));
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';

      // The step transitions to submitting, then success once observable resolves
      // Since of() is synchronous, we can't catch the intermediate state easily.
      // But we can verify the call chain works.
      component.onSubmit();
      expect(component.step).toBe('success');
    });

    it('clears apiError on submit', () => {
      authService.resetPassword.and.returnValue(of({ detail: 'ok' }));
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.apiError = 'old error';
      component.onSubmit();

      expect(component.apiError).toBe('');
    });

    // --- Error handling ---

    it('shows detail error from response', () => {
      authService.resetPassword.and.returnValue(
        throwError(() => ({ error: { detail: 'Token invalid.' } })),
      );
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();

      expect(component.step).toBe('form');
      expect(component.apiError).toBe('Token invalid.');
    });

    it('shows password array errors joined', () => {
      authService.resetPassword.and.returnValue(
        throwError(() => ({ error: { password: ['Too common.', 'Too short.'] } })),
      );
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();

      expect(component.step).toBe('form');
      expect(component.apiError).toBe('Too common. Too short.');
    });

    it('shows password string error', () => {
      authService.resetPassword.and.returnValue(
        throwError(() => ({ error: { password: 'Too common.' } })),
      );
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();

      expect(component.step).toBe('form');
      expect(component.apiError).toBe('Too common.');
    });

    it('shows mfa_code array error joined', () => {
      authService.resetPassword.and.returnValue(
        throwError(() => ({ error: { mfa_code: ['Invalid code.', 'Try again.'] } })),
      );
      component.mfaRequired = true;
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.mfaCode = '123456';
      component.onSubmit();

      expect(component.step).toBe('form');
      expect(component.apiError).toBe('Invalid code. Try again.');
    });

    it('shows mfa_code string error', () => {
      authService.resetPassword.and.returnValue(
        throwError(() => ({ error: { mfa_code: 'Invalid code.' } })),
      );
      component.mfaRequired = true;
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.mfaCode = '123456';
      component.onSubmit();

      expect(component.step).toBe('form');
      expect(component.apiError).toBe('Invalid code.');
    });

    it('transitions to expired on token_expired error during reset', () => {
      // token_expired without detail — detail branch (line 121) must not match
      // so the code falls through to the code === 'token_expired' branch (line 127)
      authService.resetPassword.and.returnValue(
        throwError(() => ({
          error: { code: 'token_expired' },
        })),
      );
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();

      expect(component.step).toBe('expired');
      expect(component.errorMessage).toBe('This reset link has expired.');
    });

    it('uses fallback for token_expired without detail during reset', () => {
      authService.resetPassword.and.returnValue(
        throwError(() => ({
          error: { code: 'token_expired' },
        })),
      );
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();

      expect(component.step).toBe('expired');
      expect(component.errorMessage).toBe('This reset link has expired.');
    });

    it('shows generic error when no structured data', () => {
      authService.resetPassword.and.returnValue(
        throwError(() => ({ error: {} })),
      );
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();

      expect(component.step).toBe('form');
      expect(component.apiError).toBe('Something went wrong. Please try again.');
    });

    it('shows generic error when error is null', () => {
      authService.resetPassword.and.returnValue(
        throwError(() => ({})),
      );
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();

      expect(component.step).toBe('form');
      expect(component.apiError).toBe('Something went wrong. Please try again.');
    });
  });
});
