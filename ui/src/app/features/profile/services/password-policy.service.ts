import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface PasswordPolicy {
  min_length: number;
  require_uppercase: boolean;
  require_special: boolean;
  require_number: boolean;
  expiry_days: number;
}

@Injectable({ providedIn: 'root' })
export class PasswordPolicyService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/api/me`;

  getPolicy(): Observable<PasswordPolicy> {
    return this.http.get<PasswordPolicy>(`${this.base}/password-policy/`);
  }

  changePassword(currentPassword: string, newPassword: string, mfaCode?: string): Observable<{ detail: string }> {
    const body: Record<string, string> = {
      current_password: currentPassword,
      new_password: newPassword,
    };
    if (mfaCode) {
      body['mfa_code'] = mfaCode;
    }
    return this.http.post<{ detail: string }>(`${this.base}/profile/password/`, body);
  }
}
