import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Asset } from '../../assets/models/asset.model';
import { Sow } from '../models/sow.model';

@Injectable({ providedIn: 'root' })
export class SowService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/engagements`;

  get(engagementId: string): Observable<Sow> {
    return this.http.get<Sow>(`${this.baseUrl}/${engagementId}/sow/`);
  }

  create(engagementId: string, data: Partial<Sow>): Observable<Sow> {
    return this.http.post<Sow>(`${this.baseUrl}/${engagementId}/sow/`, data);
  }

  update(engagementId: string, data: Partial<Sow>): Observable<Sow> {
    return this.http.patch<Sow>(`${this.baseUrl}/${engagementId}/sow/`, data);
  }

  delete(engagementId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${engagementId}/sow/`);
  }

  listScope(engagementId: string): Observable<Asset[]> {
    return this.http.get<Asset[]>(`${this.baseUrl}/${engagementId}/scope/`);
  }

  addScope(engagementId: string, assetId: string): Observable<Asset> {
    return this.http.post<Asset>(`${this.baseUrl}/${engagementId}/scope/`, { asset_id: assetId });
  }

  removeScope(engagementId: string, assetId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${engagementId}/scope/${assetId}/`);
  }
}
