import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, distinctUntilChanged, finalize, map, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { PermissionService } from './permission.service';
import { TokenService } from './token.service';
import { UserProfileService } from '../profile/user-profile.service';

export type TenantInfo = {
  id: string;
  slug: string;
  name: string;
  role: string;
};

export type LoginStep1Response = {
  tenants: TenantInfo[];
};

export type SignupResponse = {
  detail: string;
  email_sent: boolean;
};

export type AuthResponse = {
  user?: any;
  tenant?: TenantInfo;
  authorization?: any;
  subscription?: any;
  password_reset_required?: boolean;
  password_reset_reason?: string | null;
  // MFA challenge fields (present instead of session when MFA is needed)
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  mfa_token?: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
  private readonly profile = inject(UserProfileService);
  private readonly permissions = inject(PermissionService);

  private readonly _user$ = new BehaviorSubject<any | null>(null);
  readonly user$ = this._user$.asObservable();

  readonly isAuthenticated$ = this.tokens.state$.pipe(
    map(s => s.authenticated),
    distinctUntilChanged(),
    shareReplay(1),
  );

  isAuthenticatedSync(): boolean {
    return this.tokens.isAuthenticated();
  }

  private url(path: string): string {
    const base = (environment.apiUrl || '').replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  signup(data: {
    company_name: string;
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    password_confirm: string;
  }): Observable<SignupResponse> {
    return this.http.post<SignupResponse>(this.url('/api/auth/signup/'), data);
  }

  verifyEmail(token: string): Observable<{ detail: string }> {
    return this.http.get<{ detail: string }>(this.url('/api/auth/verify-email/'), {
      params: { token },
    });
  }

  resendVerification(email: string, password: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/auth/resend-verification/'), {
      email,
      password,
    });
  }

  // -- Forgot password --

  forgotPassword(email: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(this.url('/api/auth/forgot-password/'), { email });
  }

  validateResetToken(token: string): Observable<{
    valid: boolean;
    mfa_required: boolean;
    password_policy: Record<string, any>;
  }> {
    return this.http.get<any>(this.url('/api/auth/reset-password/validate/'), {
      params: { token },
    });
  }

  resetPassword(token: string, password: string, passwordConfirm: string, mfaCode?: string): Observable<{ detail: string }> {
    const body: Record<string, string> = { token, password, password_confirm: passwordConfirm };
    if (mfaCode) body['mfa_code'] = mfaCode;
    return this.http.post<{ detail: string }>(this.url('/api/auth/reset-password/'), body);
  }

  // -- Login --

  login(email: string, password: string): Observable<LoginStep1Response> {
    return this.http.post<LoginStep1Response>(this.url('/api/auth/login/'), { email, password });
  }

  listTenants(): Observable<LoginStep1Response> {
    return this.http.get<LoginStep1Response>(this.url('/api/auth/tenants/'));
  }

  switchTenant(tenantId: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(this.url('/api/auth/switch-tenant/'), { tenant_id: tenantId })
      .pipe(
        tap(res => {
          this.tokens.setAuthenticated();
          this._user$.next(res.user ?? null);
          this.profile.setFromAuthResponse(res);
          this.permissions.setFromAuthResponse((res as any).authorization);
        }),
      );
  }

  selectTenant(email: string, password: string, tenantId: string, remember: boolean): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(this.url('/api/auth/login/select-tenant/'), {
        email, password, tenant_id: tenantId, remember,
      })
      .pipe(
        tap(res => {
          // When MFA is required, session is not established yet — skip state update
          if (res.mfa_required) return;

          this.tokens.setAuthenticated();
          this._user$.next(res.user ?? null);
          this.profile.setFromAuthResponse(res);
          this.permissions.setFromAuthResponse((res as any).authorization);
        }),
      );
  }

  completeAuthFromMfa(res: AuthResponse): void {
    this.tokens.setAuthenticated();
    this._user$.next(res.user ?? null);
    this.profile.setFromAuthResponse(res);
    this.permissions.setFromAuthResponse((res as any).authorization);
  }

  logout(): Observable<void> {
    console.info('[auth] logout: user initiated');

    return this.http
      .post<void>(this.url('/api/auth/logout/'), {})
      .pipe(
        catchError(err => {
          console.warn('[auth] logout API call failed', err?.status ?? err?.message);
          return of(void 0);
        }),
        finalize(() => {
          this.tokens.clear();
          this._user$.next(null);
          this.profile.clear();
          this.permissions.clear();
        }),
      );
  }

  setUser(user: any | null): void {
    this._user$.next(user);
  }
}
