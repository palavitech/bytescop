import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

interface VersionInfo {
  version: string;
}

@Injectable({ providedIn: 'root' })
export class VersionService {
  private readonly http = inject(HttpClient);

  /** UI version from assets/version.json (baked at build time). */
  readonly uiVersion$: Observable<string> = this.http
    .get<VersionInfo>('assets/version.json')
    .pipe(
      map(v => v.version),
      catchError(() => of('unknown')),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

  /** API version from GET /api/health/ response. */
  readonly apiVersion$: Observable<string> = this.http
    .get<{ status: string; version: string }>(`${environment.apiUrl}/api/health/`)
    .pipe(
      map(r => r.version),
      catchError(() => of('unknown')),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
}
