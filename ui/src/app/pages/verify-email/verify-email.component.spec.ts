import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { VerifyEmailComponent } from './verify-email.component';
import { AuthService } from '../../services/core/auth/auth.service';

describe('VerifyEmailComponent', () => {
  let component: VerifyEmailComponent;
  let fixture: ComponentFixture<VerifyEmailComponent>;
  let authService: jasmine.SpyObj<AuthService>;

  function setup(queryParams: Record<string, string> = { token: 'abc123' }): void {
    authService = jasmine.createSpyObj('AuthService', ['verifyEmail']);

    TestBed.configureTestingModule({
      imports: [VerifyEmailComponent],
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

    fixture = TestBed.createComponent(VerifyEmailComponent);
    component = fixture.componentInstance;
  }

  // --- No token ---

  it('should create', () => {
    setup();
    authService.verifyEmail.and.returnValue(of({ detail: 'Verified' }));
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('sets error state when no token in URL', () => {
    setup({});
    fixture.detectChanges();

    expect(component.state).toBe('error');
    expect(component.message).toBe('No verification token provided.');
    expect(authService.verifyEmail).not.toHaveBeenCalled();
  });

  // --- Token verification ---

  it('starts in loading state', () => {
    setup();
    expect(component.state).toBe('loading');
  });

  it('calls verifyEmail with token from URL', () => {
    setup({ token: 'my-token' });
    authService.verifyEmail.and.returnValue(of({ detail: 'Email verified.' }));
    fixture.detectChanges();

    expect(authService.verifyEmail).toHaveBeenCalledWith('my-token');
  });

  it('transitions to success on valid token', () => {
    setup();
    authService.verifyEmail.and.returnValue(of({ detail: 'Email verified successfully.' }));
    fixture.detectChanges();

    expect(component.state).toBe('success');
    expect(component.message).toBe('Email verified successfully.');
  });

  // --- Error handling ---

  it('transitions to expired on token_expired error', () => {
    setup();
    authService.verifyEmail.and.returnValue(
      throwError(() => ({
        error: { code: 'token_expired', detail: 'This link has expired.' },
      })),
    );
    fixture.detectChanges();

    expect(component.state).toBe('expired');
    expect(component.message).toBe('This link has expired.');
  });

  it('uses fallback message for expired token without detail', () => {
    setup();
    authService.verifyEmail.and.returnValue(
      throwError(() => ({
        error: { code: 'token_expired' },
      })),
    );
    fixture.detectChanges();

    expect(component.state).toBe('expired');
    expect(component.message).toBe('This verification link has expired.');
  });

  it('transitions to error on non-expired error with detail', () => {
    setup();
    authService.verifyEmail.and.returnValue(
      throwError(() => ({
        error: { code: 'invalid_token', detail: 'Token is invalid.' },
      })),
    );
    fixture.detectChanges();

    expect(component.state).toBe('error');
    expect(component.message).toBe('Token is invalid.');
  });

  it('uses fallback error message when no detail', () => {
    setup();
    authService.verifyEmail.and.returnValue(
      throwError(() => ({
        error: {},
      })),
    );
    fixture.detectChanges();

    expect(component.state).toBe('error');
    expect(component.message).toBe('Invalid or expired verification link.');
  });

  it('uses fallback error message when error is null', () => {
    setup();
    authService.verifyEmail.and.returnValue(
      throwError(() => ({})),
    );
    fixture.detectChanges();

    expect(component.state).toBe('error');
    expect(component.message).toBe('Invalid or expired verification link.');
  });
});
