import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Finding } from '../models/finding.model';

@Injectable({ providedIn: 'root' })
export class FindingsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/engagements`;

  list(
    engagementId: string,
    filters?: {
      asset_id?: string;
      sample_id?: string;
      evidence_source_id?: string;
      severity?: string;
      status?: string;
      include_drafts?: boolean;
    },
  ): Observable<Finding[]> {
    let params = new HttpParams();
    if (filters?.asset_id) {
      params = params.set('asset_id', filters.asset_id);
    }
    if (filters?.sample_id) {
      params = params.set('sample_id', filters.sample_id);
    }
    if (filters?.evidence_source_id) {
      params = params.set('evidence_source_id', filters.evidence_source_id);
    }
    if (filters?.severity) {
      params = params.set('severity', filters.severity);
    }
    if (filters?.status) {
      params = params.set('status', filters.status);
    }
    if (filters?.include_drafts) {
      params = params.set('include_drafts', 'true');
    }
    return this.http.get<Finding[]>(`${this.baseUrl}/${engagementId}/findings/`, { params });
  }

  getById(engagementId: string, findingId: string): Observable<Finding> {
    return this.http.get<Finding>(`${this.baseUrl}/${engagementId}/findings/${findingId}/`);
  }

  create(engagementId: string, data: Partial<Finding>): Observable<Finding> {
    return this.http.post<Finding>(`${this.baseUrl}/${engagementId}/findings/`, data);
  }

  update(engagementId: string, findingId: string, data: Partial<Finding>): Observable<Finding> {
    return this.http.patch<Finding>(`${this.baseUrl}/${engagementId}/findings/${findingId}/`, data);
  }

  delete(engagementId: string, findingId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${engagementId}/findings/${findingId}/`);
  }

  /**
   * Upload finding image via multipart POST.
   */
  uploadImage(engagementId: string, file: File): Observable<UploadImageResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<UploadImageResponse>(
      `${this.baseUrl}/${engagementId}/attachments/images/`,
      form,
    );
  }
}

export interface UploadImageResponse {
  token: string;
  url: string;
}
