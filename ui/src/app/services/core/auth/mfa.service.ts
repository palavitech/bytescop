import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface MfaVerifyResponse {
  user: any;
  tenant: any;
  authorization: any;
  subscription: any;
  password_reset_required: boolean;
  password_reset_reason: string | null;
}

export interface MfaSetupResponse {
  secret: string;
  qr_code: string;
  backup_codes: string[];
  mfa_token: string;
}

export interface MfaStatusResponse {
  mfa_enabled: boolean;
  mfa_enrolled_at: string | null;
  mfa_required: boolean;
  backup_codes_remaining: number;
  policy: {
    required_all: boolean;
    required_for_owners: boolean;
    required_for_admins: boolean;
  };
}

export interface MfaEnrollResponse {
  secret: string;
  qr_code: string;
  backup_codes: string[];
}

export interface MfaReEnrollResponse {
  secret: string;
  qr_code: string;
  backup_codes: string[];
  re_enroll_token: string;
}

@Injectable({ providedIn: 'root' })
export class MfaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${(environment.apiUrl || '').replace(/\/$/, '')}/api`;

  // ── Login flow (pre-auth, AllowAny) ──

  verify(mfaToken: string, code: string, remember: boolean): Observable<MfaVerifyResponse> {
    return this.http.post<MfaVerifyResponse>(`${this.base}/auth/mfa/verify/`, {
      mfa_token: mfaToken,
      code,
      remember,
    });
  }

  setup(mfaToken: string): Observable<MfaSetupResponse> {
    return this.http.post<MfaSetupResponse>(`${this.base}/auth/mfa/setup/`, {
      mfa_token: mfaToken,
    });
  }

  setupConfirm(mfaToken: string, code: string, remember: boolean): Observable<MfaVerifyResponse> {
    return this.http.post<MfaVerifyResponse>(`${this.base}/auth/mfa/setup/confirm/`, {
      mfa_token: mfaToken,
      code,
      remember,
    });
  }

  // ── Self-service (authenticated) ──

  getStatus(): Observable<MfaStatusResponse> {
    return this.http.get<MfaStatusResponse>(`${this.base}/me/mfa/status/`);
  }

  enroll(): Observable<MfaEnrollResponse> {
    return this.http.post<MfaEnrollResponse>(`${this.base}/me/mfa/enroll/`, {});
  }

  enrollConfirm(code: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.base}/me/mfa/enroll/confirm/`, { code });
  }

  disable(code: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.base}/me/mfa/disable/`, { code });
  }

  regenerateBackupCodes(code: string): Observable<{ backup_codes: string[] }> {
    return this.http.post<{ backup_codes: string[] }>(`${this.base}/me/mfa/regenerate-backup-codes/`, { code });
  }

  reEnroll(code: string): Observable<MfaReEnrollResponse> {
    return this.http.post<MfaReEnrollResponse>(`${this.base}/me/mfa/re-enroll/`, { code });
  }

  reEnrollConfirm(code: string, reEnrollToken: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.base}/me/mfa/re-enroll/confirm/`, {
      code,
      re_enroll_token: reEnrollToken,
    });
  }

  // ── Admin ──

  resetMfa(memberId: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(
      `${(environment.apiUrl || '').replace(/\/$/, '')}/api/authorization/members/${memberId}/reset-mfa/`, {},
    );
  }
}
