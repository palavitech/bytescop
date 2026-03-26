import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Asset } from '../models/asset.model';

@Injectable({ providedIn: 'root' })
export class AssetsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/assets`;

  list(clientId?: string): Observable<Asset[]> {
    const url = clientId ? `${this.baseUrl}/?client=${clientId}` : `${this.baseUrl}/`;
    return this.http.get<Asset[]>(url);
  }

  getById(id: string): Observable<Asset> {
    return this.http.get<Asset>(`${this.baseUrl}/${id}/`);
  }

  create(data: Partial<Asset>): Observable<Asset> {
    return this.http.post<Asset>(`${this.baseUrl}/`, data);
  }

  update(id: string, data: Partial<Asset>): Observable<Asset> {
    return this.http.patch<Asset>(`${this.baseUrl}/${id}/`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/`);
  }

  scopeUsage(id: string): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.baseUrl}/${id}/scope-usage/`);
  }
}
