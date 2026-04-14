import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { ForensicsEvidence } from './forensics.model';

@Injectable({ providedIn: 'root' })
export class ForensicsEvidenceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/engagements`;

  listEvidence(engId: string): Observable<ForensicsEvidence[]> {
    return this.http.get<ForensicsEvidence[]>(`${this.baseUrl}/${engId}/evidence-sources/`);
  }

  addEvidence(engId: string, data: Partial<ForensicsEvidence>): Observable<ForensicsEvidence> {
    return this.http.post<ForensicsEvidence>(`${this.baseUrl}/${engId}/evidence-sources/`, data);
  }

  deleteEvidence(engId: string, evidenceId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${engId}/evidence-sources/${evidenceId}/`);
  }
}
