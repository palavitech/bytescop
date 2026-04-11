import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Engagement, MalwareSample } from '../models/engagement.model';
import { EngagementStakeholder, StakeholderCreate, EngagementSettingDef } from '../models/stakeholder.model';

@Injectable({ providedIn: 'root' })
export class EngagementsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/engagements`;

  list(filters?: { client?: string; status?: string }): Observable<Engagement[]> {
    let params = new HttpParams();
    if (filters?.client) {
      params = params.set('client', filters.client);
    }
    if (filters?.status) {
      params = params.set('status', filters.status);
    }
    return this.http.get<Engagement[]>(`${this.baseUrl}/`, { params });
  }

  getById(id: string): Observable<Engagement> {
    return this.http.get<Engagement>(`${this.baseUrl}/${id}/`);
  }

  create(data: Partial<Engagement>): Observable<Engagement> {
    return this.http.post<Engagement>(`${this.baseUrl}/`, data);
  }

  update(id: string, data: Partial<Engagement>): Observable<Engagement> {
    return this.http.patch<Engagement>(`${this.baseUrl}/${id}/`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/`);
  }

  // -- Malware Samples --

  listSamples(engId: string): Observable<MalwareSample[]> {
    return this.http.get<MalwareSample[]>(`${this.baseUrl}/${engId}/samples/`);
  }

  uploadSample(engId: string, file: File, notes: string = ''): Observable<MalwareSample> {
    const form = new FormData();
    form.append('file', file);
    if (notes) {
      form.append('notes', notes);
    }
    return this.http.post<MalwareSample>(`${this.baseUrl}/${engId}/samples/upload/`, form);
  }

  deleteSample(engId: string, sampleId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${engId}/samples/${sampleId}/`);
  }

  // -- Analysis Checks --

  initializeAnalysis(engId: string): Observable<{ created: number }> {
    return this.http.post<{ created: number }>(`${this.baseUrl}/${engId}/initialize-analysis/`, {});
  }

  executeFinding(engId: string, findingId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(`${this.baseUrl}/${engId}/findings/${findingId}/execute/`, {});
  }

  // -- Stakeholders --

  listStakeholders(engId: string): Observable<EngagementStakeholder[]> {
    return this.http.get<EngagementStakeholder[]>(`${this.baseUrl}/${engId}/stakeholders/`);
  }

  createStakeholder(engId: string, data: StakeholderCreate): Observable<EngagementStakeholder> {
    return this.http.post<EngagementStakeholder>(`${this.baseUrl}/${engId}/stakeholders/`, data);
  }

  updateStakeholder(engId: string, shId: string, data: { role: string }): Observable<EngagementStakeholder> {
    return this.http.patch<EngagementStakeholder>(`${this.baseUrl}/${engId}/stakeholders/${shId}/`, data);
  }

  deleteStakeholder(engId: string, shId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${engId}/stakeholders/${shId}/`);
  }

  // -- Engagement Settings --

  listSettings(engId: string): Observable<EngagementSettingDef[]> {
    return this.http.get<EngagementSettingDef[]>(`${this.baseUrl}/${engId}/settings/`);
  }

  upsertSetting(engId: string, key: string, value: string): Observable<EngagementSettingDef> {
    return this.http.put<EngagementSettingDef>(`${this.baseUrl}/${engId}/settings/`, { key, value });
  }
}
