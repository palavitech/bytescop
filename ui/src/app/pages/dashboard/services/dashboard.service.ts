import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { DashboardAlert, DashboardWidget } from '../models/dashboard.model';

export interface DashboardResponse {
  widgets: DashboardWidget[];
  alerts: DashboardAlert[];
  layout?: { customized: boolean };
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/dashboard`;

  getDashboard(view?: string): Observable<DashboardResponse> {
    const params: Record<string, string> = {};
    if (view) params['view'] = view;
    return this.http
      .get<DashboardResponse>(`${this.baseUrl}/`, { params })
      .pipe(map(r => ({
        widgets: r.widgets ?? [],
        alerts: r.alerts ?? [],
        layout: r.layout,
      })));
  }
}
