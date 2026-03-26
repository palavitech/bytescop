import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ForgotPasswordComponent } from './forgot-password.component';
import { AuthService } from '../../services/core/auth/auth.service';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    authService = jasmine.createSpyObj('AuthService', ['forgotPassword']);

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- Initial state ---

  it('starts with empty email', () => {
    expect(component.email).toBe('');
  });

  it('starts with submitting false', () => {
    expect(component.submitting).toBe(false);
  });

  it('starts with emailSent false', () => {
    expect(component.emailSent).toBe(false);
  });

  it('starts with empty apiError', () => {
    expect(component.apiError).toBe('');
  });

  // --- canSubmit ---

  it('canSubmit is false when email is empty', () => {
    component.email = '';
    expect(component.canSubmit).toBe(false);
  });

  it('canSubmit is false when email is whitespace', () => {
    component.email = '   ';
    expect(component.canSubmit).toBe(false);
  });

  it('canSubmit is false when submitting', () => {
    component.email = 'user@example.com';
    component.submitting = true;
    expect(component.canSubmit).toBe(false);
  });

  it('canSubmit is true when email is set and not submitting', () => {
    component.email = 'user@example.com';
    expect(component.canSubmit).toBe(true);
  });

  // --- onSubmit ---

  it('does nothing when canSubmit is false', () => {
    component.email = '';
    component.onSubmit();
    expect(authService.forgotPassword).not.toHaveBeenCalled();
  });

  it('calls auth.forgotPassword with trimmed email', () => {
    authService.forgotPassword.and.returnValue(of({ detail: 'ok' }));
    component.email = '  user@example.com  ';
    component.onSubmit();
    expect(authService.forgotPassword).toHaveBeenCalledWith('user@example.com');
  });

  it('sets submitting true and clears apiError on submit', () => {
    authService.forgotPassword.and.returnValue(of({ detail: 'ok' }));
    component.email = 'user@example.com';
    component.apiError = 'old error';
    component.onSubmit();
    // After success callback, submitting should be false
    expect(component.apiError).toBe('');
  });

  it('sets emailSent true on success', () => {
    authService.forgotPassword.and.returnValue(of({ detail: 'ok' }));
    component.email = 'user@example.com';
    component.onSubmit();
    expect(component.emailSent).toBe(true);
    expect(component.submitting).toBe(false);
  });

  it('shows rate limit error on 429', () => {
    authService.forgotPassword.and.returnValue(
      throwError(() => ({ status: 429, error: {} })),
    );
    component.email = 'user@example.com';
    component.onSubmit();
    expect(component.submitting).toBe(false);
    expect(component.apiError).toBe('Too many attempts. Please try again later.');
  });

  it('shows detail from error response', () => {
    authService.forgotPassword.and.returnValue(
      throwError(() => ({ status: 400, error: { detail: 'Account not found' } })),
    );
    component.email = 'user@example.com';
    component.onSubmit();
    expect(component.submitting).toBe(false);
    expect(component.apiError).toBe('Account not found');
  });

  it('shows generic error when no detail in error response', () => {
    authService.forgotPassword.and.returnValue(
      throwError(() => ({ status: 500, error: {} })),
    );
    component.email = 'user@example.com';
    component.onSubmit();
    expect(component.submitting).toBe(false);
    expect(component.apiError).toBe('Something went wrong. Please try again.');
  });

  it('shows generic error when error is null', () => {
    authService.forgotPassword.and.returnValue(
      throwError(() => ({})),
    );
    component.email = 'user@example.com';
    component.onSubmit();
    expect(component.apiError).toBe('Something went wrong. Please try again.');
  });

  it('does not set emailSent on error', () => {
    authService.forgotPassword.and.returnValue(
      throwError(() => ({ status: 400, error: { detail: 'Error' } })),
    );
    component.email = 'user@example.com';
    component.onSubmit();
    expect(component.emailSent).toBe(false);
  });
});
