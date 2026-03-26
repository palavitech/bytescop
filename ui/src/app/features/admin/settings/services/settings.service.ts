import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { SettingDefinition } from '../models/setting.model';

export interface ClosureExecuteResponse {
  detail: string;
  closure_id: string;
}

export interface LicenseStatus {
  plan: string;
  features: string[];
  max_users: number;
  max_workspaces: number;
  expired: boolean;
  expires_at: string | null;
  customer: string;
  has_key: boolean;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/settings`;

  list(): Observable<SettingDefinition[]> {
    return this.http.get<SettingDefinition[]>(`${this.baseUrl}/`);
  }

  upsert(key: string, value: string): Observable<SettingDefinition> {
    return this.http.put<SettingDefinition>(`${this.baseUrl}/${key}/`, { value });
  }

  reset(key: string): Observable<SettingDefinition> {
    return this.http.delete<SettingDefinition>(`${this.baseUrl}/${key}/`);
  }

  hasLogo(): Observable<{ has_logo: boolean }> {
    return this.http.get<{ has_logo: boolean }>(`${this.baseUrl}/logo/`);
  }

  /**
   * Upload logo via multipart POST.
   */
  uploadLogo(file: File): Observable<{ has_logo: boolean }> {
    const formData = new FormData();
    formData.append('logo', file);
    return this.http.post<{ has_logo: boolean }>(`${this.baseUrl}/logo/`, formData);
  }

  deleteLogo(): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/logo/`);
  }

  getLogoBlob(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/logo-content/`, { responseType: 'blob' });
  }

  // ── License ──────────────────────────────────────────────────────────
  private readonly licenseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/license`;

  getLicenseStatus(): Observable<LicenseStatus> {
    return this.http.get<LicenseStatus>(`${this.licenseUrl}/`);
  }

  activateLicense(key: string): Observable<LicenseStatus> {
    return this.http.post<LicenseStatus>(`${this.licenseUrl}/`, { key });
  }

  removeLicense(): Observable<LicenseStatus> {
    return this.http.delete<LicenseStatus>(`${this.licenseUrl}/`);
  }

  // ── Tenant Closure ────────────────────────────────────────────────────

  private readonly tenantUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/tenant`;

  verifyClosureMfa(mfaCode: string): Observable<{ verified: boolean }> {
    return this.http.post<{ verified: boolean }>(`${this.tenantUrl}/close/verify-mfa/`, {
      mfa_code: mfaCode,
    });
  }

  executeClosure(workspaceName: string): Observable<ClosureExecuteResponse> {
    return this.http.post<ClosureExecuteResponse>(`${this.tenantUrl}/close/execute/`, {
      workspace_name: workspaceName,
    });
  }
}
