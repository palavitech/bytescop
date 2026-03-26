import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { provideRouter } from '@angular/router';

import { AcceptInviteComponent } from './accept-invite.component';

const VALIDATE_URL = '/api/auth/accept-invite/validate/';
const SET_PASSWORD_URL = '/api/auth/accept-invite/set-password/';

const MOCK_VALIDATE_RESPONSE = {
  valid: true,
  session: 'signed-session-data',
  password_policy: {
    min_length: 10,
    require_uppercase: true,
    require_special: true,
    require_number: true,
    expiry_days: 90,
  },
  email: 'alice@example.com',
  tenant_name: 'Acme Corp',
  logo_url: 'https://s3.example.com/logo.png',
};

const matchUrl = (fragment: string) => (req: any) => req.url.includes(fragment);

describe('AcceptInviteComponent', () => {
  let component: AcceptInviteComponent;
  let fixture: ComponentFixture<AcceptInviteComponent>;
  let httpMock: HttpTestingController;
  let router: Router;

  function setup(queryParams: Record<string, string> = { token: 'abc123' }): void {
    TestBed.configureTestingModule({
      imports: [AcceptInviteComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
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

    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));

    fixture = TestBed.createComponent(AcceptInviteComponent);
    component = fixture.componentInstance;
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', fakeAsync(() => {
    setup();
    expect(component).toBeTruthy();
    fixture.detectChanges();
    httpMock.expectOne(matchUrl(VALIDATE_URL)).flush(MOCK_VALIDATE_RESPONSE);
    tick();
  }));

  // --- No token ---

  it('sets error step when no token in URL', () => {
    setup({});
    fixture.detectChanges();

    expect(component.step).toBe('error');
    expect(component.errorMessage).toContain('No invitation token');
  });

  // --- Token validation ---

  it('starts in loading state and transitions to welcome on valid token', fakeAsync(() => {
    setup();
    expect(component.step).toBe('loading');

    fixture.detectChanges();
    const req = httpMock.expectOne(matchUrl(VALIDATE_URL));
    expect(req.request.body).toEqual({ token: 'abc123' });
    req.flush(MOCK_VALIDATE_RESPONSE);
    tick();

    expect(component.step).toBe('welcome');
    expect(component.email).toBe('alice@example.com');
    expect(component.tenantName).toBe('Acme Corp');
    expect(component.logoUrl).toBe('https://s3.example.com/logo.png');
    expect(component.session).toBe('signed-session-data');
    expect(component.policy).toEqual(MOCK_VALIDATE_RESPONSE.password_policy);
  }));

  it('sets error step on invalid token', fakeAsync(() => {
    setup();
    fixture.detectChanges();

    const req = httpMock.expectOne(matchUrl(VALIDATE_URL));
    req.flush(
      { detail: 'This invitation link is invalid or has expired.' },
      { status: 400, statusText: 'Bad Request' },
    );
    tick();

    expect(component.step).toBe('error');
    expect(component.errorMessage).toContain('invalid or has expired');
  }));

  it('uses fallback error message when no detail in validation error', fakeAsync(() => {
    setup();
    fixture.detectChanges();

    const req = httpMock.expectOne(matchUrl(VALIDATE_URL));
    req.flush({}, { status: 400, statusText: 'Bad Request' });
    tick();

    expect(component.step).toBe('error');
    expect(component.errorMessage).toBe('This invitation link is invalid or has expired.');
  }));

  // --- Password policy checks ---

  describe('password policy', () => {
    beforeEach(fakeAsync(() => {
      setup();
      fixture.detectChanges();
      httpMock.expectOne(matchUrl(VALIDATE_URL)).flush(MOCK_VALIDATE_RESPONSE);
      tick();
    }));

    it('meetsMinLength returns false for short password', () => {
      component.password = 'short';
      expect(component.meetsMinLength).toBe(false);
    });

    it('meetsMinLength returns true for long enough password', () => {
      component.password = 'LongEnough1!';
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

    it('passwordsMatch returns true when passwords equal', () => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      expect(component.passwordsMatch).toBe(true);
    });

    it('passwordsMatch returns false when passwords differ', () => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'Different1!';
      expect(component.passwordsMatch).toBe(false);
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

    it('canSubmit is false when step is not welcome', () => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.step = 'submitting';
      expect(component.canSubmit).toBe(false);
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

    it('allPolicyChecksMet returns false when min length not met', () => {
      component.password = 'Short1!';
      expect(component.allPolicyChecksMet).toBe(false);
    });

    it('allPolicyChecksMet returns false when uppercase required but missing', () => {
      component.password = 'nouppercase1!';
      expect(component.allPolicyChecksMet).toBe(false);
    });

    it('allPolicyChecksMet returns false when number required but missing', () => {
      component.password = 'NoNumberHere!';
      expect(component.allPolicyChecksMet).toBe(false);
    });

    it('allPolicyChecksMet returns false when special required but missing', () => {
      component.password = 'NoSpecial123';
      expect(component.allPolicyChecksMet).toBe(false);
    });

    it('meetsMinLength uses default 10 when policy is null', () => {
      component.policy = null;
      component.password = '1234567890';
      expect(component.meetsMinLength).toBe(true);
    });

    it('meetsMinLength uses default 10 when policy min_length is undefined', () => {
      component.policy = { min_length: undefined as any } as any;
      component.password = '123456789';
      expect(component.meetsMinLength).toBe(false);
    });
  });

  // --- allPolicyChecksMet with relaxed policy ---

  describe('allPolicyChecksMet with relaxed policy', () => {
    beforeEach(fakeAsync(() => {
      setup();
      fixture.detectChanges();
      httpMock.expectOne(matchUrl(VALIDATE_URL)).flush({
        ...MOCK_VALIDATE_RESPONSE,
        password_policy: {
          min_length: 8,
          require_uppercase: false,
          require_special: false,
          require_number: false,
          expiry_days: 0,
        },
      });
      tick();
    }));

    it('allPolicyChecksMet returns true without uppercase/number/special when not required', () => {
      component.password = 'alllower!';
      expect(component.allPolicyChecksMet).toBe(true);
    });
  });

  // --- Set password ---

  describe('set password', () => {
    beforeEach(fakeAsync(() => {
      setup();
      fixture.detectChanges();
      httpMock.expectOne(matchUrl(VALIDATE_URL)).flush(MOCK_VALIDATE_RESPONSE);
      tick();
    }));

    it('submits password and transitions to success', fakeAsync(() => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();
      tick();

      expect(component.step).toBe('submitting');

      const req = httpMock.expectOne(matchUrl(SET_PASSWORD_URL));
      expect(req.request.body).toEqual({
        session: 'signed-session-data',
        password: 'StrongPass1!',
        password_confirm: 'StrongPass1!',
      });
      req.flush({ detail: 'Password set successfully. You may now log in.' });
      tick();

      expect(component.step).toBe('success');
    }));

    it('shows error on set-password failure with detail', fakeAsync(() => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();
      tick();

      httpMock.expectOne(matchUrl(SET_PASSWORD_URL)).flush(
        { detail: 'Your session has expired.' },
        { status: 400, statusText: 'Bad Request' },
      );
      tick();

      expect(component.step).toBe('welcome');
      expect(component.apiError).toBe('Your session has expired.');
    }));

    it('shows error on set-password failure with password array', fakeAsync(() => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();
      tick();

      httpMock.expectOne(matchUrl(SET_PASSWORD_URL)).flush(
        { password: ['Too common.', 'Too short.'] },
        { status: 400, statusText: 'Bad Request' },
      );
      tick();

      expect(component.step).toBe('welcome');
      expect(component.apiError).toBe('Too common. Too short.');
    }));

    it('shows generic error when no detail or password field', fakeAsync(() => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();
      tick();

      httpMock.expectOne(matchUrl(SET_PASSWORD_URL)).flush(
        {},
        { status: 500, statusText: 'Server Error' },
      );
      tick();

      expect(component.step).toBe('welcome');
      expect(component.apiError).toBe('Something went wrong. Please try again.');
    }));

    it('does not submit when canSubmit is false', () => {
      component.password = 'weak';
      component.passwordConfirm = 'weak';
      component.onSubmit();

      httpMock.expectNone(matchUrl(SET_PASSWORD_URL));
      expect(component.step).toBe('welcome');
    });

    it('shows error on set-password failure with password as string', fakeAsync(() => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();
      tick();

      httpMock.expectOne(matchUrl(SET_PASSWORD_URL)).flush(
        { password: 'This password is too common.' },
        { status: 400, statusText: 'Bad Request' },
      );
      tick();

      expect(component.step).toBe('welcome');
      expect(component.apiError).toBe('This password is too common.');
    }));

    it('shows error on set-password failure with password_confirm array', fakeAsync(() => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();
      tick();

      httpMock.expectOne(matchUrl(SET_PASSWORD_URL)).flush(
        { password_confirm: ['Passwords do not match.'] },
        { status: 400, statusText: 'Bad Request' },
      );
      tick();

      expect(component.step).toBe('welcome');
      expect(component.apiError).toBe('Passwords do not match.');
    }));

    it('shows error on set-password failure with password_confirm string', fakeAsync(() => {
      component.password = 'StrongPass1!';
      component.passwordConfirm = 'StrongPass1!';
      component.onSubmit();
      tick();

      httpMock.expectOne(matchUrl(SET_PASSWORD_URL)).flush(
        { password_confirm: 'Passwords must match.' },
        { status: 400, statusText: 'Bad Request' },
      );
      tick();

      expect(component.step).toBe('welcome');
      expect(component.apiError).toBe('Passwords must match.');
    }));
  });

  // --- goToLogin ---

  it('goToLogin navigates to /login', fakeAsync(() => {
    setup();
    fixture.detectChanges();
    httpMock.expectOne(matchUrl(VALIDATE_URL)).flush(MOCK_VALIDATE_RESPONSE);
    tick();

    component.goToLogin();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  }));
});
