import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Organization, OrganizationRef } from '../models/organization.model';

@Injectable({ providedIn: 'root' })
export class OrganizationsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/clients`;

  list(): Observable<Organization[]> {
    return this.http.get<Organization[]>(`${this.baseUrl}/`);
  }

  getById(id: string): Observable<Organization> {
    return this.http.get<Organization>(`${this.baseUrl}/${id}/`);
  }

  create(data: Partial<Organization>): Observable<Organization> {
    return this.http.post<Organization>(`${this.baseUrl}/`, data);
  }

  update(id: string, data: Partial<Organization>): Observable<Organization> {
    return this.http.patch<Organization>(`${this.baseUrl}/${id}/`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/`);
  }

  ref(): Observable<OrganizationRef[]> {
    return this.http.get<OrganizationRef[]>(`${this.baseUrl}/ref/`);
  }
}
