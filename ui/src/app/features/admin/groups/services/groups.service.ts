import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import {
  TenantGroupCreate,
  TenantGroupDetail,
  TenantGroupListItem,
  TenantGroupUpdate,
} from '../models/group.model';

@Injectable({ providedIn: 'root' })
export class GroupsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/authorization/groups`;

  list(): Observable<TenantGroupListItem[]> {
    return this.http.get<TenantGroupListItem[]>(`${this.baseUrl}/`);
  }

  getById(id: string): Observable<TenantGroupDetail> {
    return this.http.get<TenantGroupDetail>(`${this.baseUrl}/${id}/`);
  }

  create(data: TenantGroupCreate): Observable<TenantGroupDetail> {
    return this.http.post<TenantGroupDetail>(`${this.baseUrl}/`, data);
  }

  update(id: string, data: TenantGroupUpdate): Observable<TenantGroupDetail> {
    return this.http.patch<TenantGroupDetail>(`${this.baseUrl}/${id}/`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/`);
  }

  addMember(groupId: string, memberId: string): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.baseUrl}/${groupId}/members/`, { member_id: memberId });
  }

  removeMember(groupId: string, memberId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${groupId}/members/${memberId}/`);
  }
}
