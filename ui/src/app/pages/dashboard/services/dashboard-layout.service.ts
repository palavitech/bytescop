import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CatalogResponse, DashboardLayoutResponse, WidgetPlacement } from '../models/dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardLayoutService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/dashboard`;

  getCatalog(view?: string): Observable<CatalogResponse> {
    const params: Record<string, string> = {};
    if (view) params['view'] = view;
    return this.http.get<CatalogResponse>(`${this.baseUrl}/catalog/`, { params });
  }

  getLayout(view?: string): Observable<DashboardLayoutResponse> {
    const params: Record<string, string> = {};
    if (view) params['view'] = view;
    return this.http.get<DashboardLayoutResponse>(`${this.baseUrl}/layout/`, { params });
  }

  saveLayout(widgets: WidgetPlacement[], view?: string): Observable<DashboardLayoutResponse> {
    const params: Record<string, string> = {};
    if (view) params['view'] = view;
    return this.http.put<DashboardLayoutResponse>(
      `${this.baseUrl}/layout/`, { widgets }, { params },
    );
  }

  resetLayout(view?: string): Observable<void> {
    const params: Record<string, string> = {};
    if (view) params['view'] = view;
    return this.http.delete<void>(`${this.baseUrl}/layout/`, { params });
  }
}
