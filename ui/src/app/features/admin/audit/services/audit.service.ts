import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { AuditFilters, AuditListResponse, AuditLogDetail, AuditSummary } from '../models/audit-log.model';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/audit`;

  list(filters?: AuditFilters, page = 1, pageSize = 50): Observable<AuditListResponse> {
    let params = new HttpParams();

    if (filters?.action) params = params.set('action', filters.action);
    if (filters?.resource_type) params = params.set('resource_type', filters.resource_type);
    if (filters?.actor) params = params.set('actor', filters.actor);
    if (filters?.resource_id) params = params.set('resource_id', filters.resource_id);
    if (filters?.date_from) params = params.set('date_from', filters.date_from);
    if (filters?.date_to) params = params.set('date_to', filters.date_to);
    if (filters?.engagement) params = params.set('engagement', filters.engagement);
    if (filters?.ip_address) params = params.set('ip_address', filters.ip_address);
    if (page > 1) params = params.set('page', page.toString());
    if (pageSize !== 50) params = params.set('page_size', pageSize.toString());

    return this.http.get<AuditListResponse>(`${this.baseUrl}/`, { params });
  }

  getById(id: number): Observable<AuditLogDetail> {
    return this.http.get<AuditLogDetail>(`${this.baseUrl}/${id}/`);
  }

  summary(filters?: AuditFilters): Observable<AuditSummary> {
    let params = new HttpParams();
    if (filters?.action) params = params.set('action', filters.action);
    if (filters?.resource_type) params = params.set('resource_type', filters.resource_type);
    if (filters?.actor) params = params.set('actor', filters.actor);
    if (filters?.resource_id) params = params.set('resource_id', filters.resource_id);
    if (filters?.date_from) params = params.set('date_from', filters.date_from);
    if (filters?.date_to) params = params.set('date_to', filters.date_to);
    if (filters?.engagement) params = params.set('engagement', filters.engagement);
    if (filters?.ip_address) params = params.set('ip_address', filters.ip_address);
    return this.http.get<AuditSummary>(`${this.baseUrl}/summary/`, { params });
  }
}
