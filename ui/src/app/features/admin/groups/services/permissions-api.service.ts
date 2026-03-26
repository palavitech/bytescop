import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { PermissionItem } from '../models/group.model';

@Injectable({ providedIn: 'root' })
export class PermissionsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${(environment.apiUrl || '').replace(/\/$/, '')}/api/authorization/permissions`;

  private cache$: Observable<PermissionItem[]> | null = null;

  list(): Observable<PermissionItem[]> {
    if (!this.cache$) {
      this.cache$ = this.http.get<PermissionItem[]>(`${this.baseUrl}/`).pipe(
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    }
    return this.cache$;
  }

  clearCache(): void {
    this.cache$ = null;
  }
}
