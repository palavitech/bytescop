import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Engagement } from '../../engagements/models/engagement.model';
import { Project, ProjectCreate, ProjectDetail, ProjectRef } from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/projects`;

  list(filters?: { client?: string; status?: string }): Observable<Project[]> {
    let params = new HttpParams();
    if (filters?.client) {
      params = params.set('client', filters.client);
    }
    if (filters?.status) {
      params = params.set('status', filters.status);
    }
    return this.http.get<Project[]>(`${this.baseUrl}/`, { params });
  }

  getById(id: string): Observable<ProjectDetail> {
    return this.http.get<ProjectDetail>(`${this.baseUrl}/${id}/`);
  }

  create(data: ProjectCreate): Observable<ProjectDetail> {
    return this.http.post<ProjectDetail>(`${this.baseUrl}/`, data);
  }

  update(id: string, data: Partial<Project>): Observable<Project> {
    return this.http.patch<Project>(`${this.baseUrl}/${id}/`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/`);
  }

  ref(): Observable<ProjectRef[]> {
    return this.http.get<ProjectRef[]>(`${this.baseUrl}/ref/`);
  }

  addEngagement(projectId: string, engagementType: string): Observable<Engagement> {
    return this.http.post<Engagement>(`${this.baseUrl}/${projectId}/add-engagement/`, {
      engagement_type: engagementType,
    });
  }
}
