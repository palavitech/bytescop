import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import {
  EngagementAssignment,
  TenantMember,
  TenantMemberCreate,
  TenantMemberUpdate,
  ToggleActiveResponse,
} from '../models/member.model';

@Injectable({ providedIn: 'root' })
export class MembersService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/authorization/members`;

  list(): Observable<TenantMember[]> {
    return this.http.get<TenantMember[]>(`${this.baseUrl}/`);
  }

  getById(id: string): Observable<TenantMember> {
    return this.http.get<TenantMember>(`${this.baseUrl}/${id}/`);
  }

  create(data: TenantMemberCreate): Observable<TenantMember> {
    return this.http.post<TenantMember>(`${this.baseUrl}/`, data);
  }

  update(id: string, data: TenantMemberUpdate): Observable<TenantMember> {
    return this.http.patch<TenantMember>(`${this.baseUrl}/${id}/`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/`);
  }

  toggleActive(id: string): Observable<ToggleActiveResponse> {
    return this.http.post<ToggleActiveResponse>(`${this.baseUrl}/${id}/toggle-active/`, {});
  }

  resetMfa(id: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.baseUrl}/${id}/reset-mfa/`, {});
  }

  resetPassword(id: string, password: string, passwordConfirm: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.baseUrl}/${id}/reset-password/`, {
      password, password_confirm: passwordConfirm,
    });
  }

  promote(id: string, mfaCode: string): Observable<TenantMember> {
    return this.http.post<TenantMember>(`${this.baseUrl}/${id}/promote/`, { mfa_code: mfaCode });
  }

  demote(id: string): Observable<TenantMember> {
    return this.http.post<TenantMember>(`${this.baseUrl}/${id}/demote/`, {});
  }

  getEngagements(id: string): Observable<EngagementAssignment[]> {
    return this.http.get<EngagementAssignment[]>(`${this.baseUrl}/${id}/engagements/`);
  }

  addEngagement(id: string, engagementId: string, role: string): Observable<EngagementAssignment> {
    return this.http.post<EngagementAssignment>(`${this.baseUrl}/${id}/engagements/`, {
      engagement_id: engagementId,
      role,
    });
  }

  removeEngagement(id: string, stakeholderId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/engagements/${stakeholderId}/`);
  }
}
