import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export type SetupProbeStatus = 'loading' | 'ok' | 'unreachable';

export interface SetupProbe {
  status: SetupProbeStatus;
  setupRequired: boolean | null;
}

@Injectable({ providedIn: 'root' })
export class SetupStateService {
  private readonly http = inject(HttpClient);

  private readonly _probe$ = new BehaviorSubject<SetupProbe>({
    status: 'loading',
    setupRequired: null,
  });
  readonly probe$ = this._probe$.asObservable();

  get probeSnapshot(): SetupProbe {
    return this._probe$.value;
  }

  async refresh(): Promise<void> {
    const base = (environment.apiUrl || '').replace(/\/+$/, '');

    try {
      const res = await firstValueFrom(
        this.http.get<{ setup_required: boolean }>(`${base}/api/setup/status/`).pipe(
          catchError(err => {
            console.warn('[setup] status probe failed', err?.status ?? err?.message ?? 'unknown');
            return of(null);
          }),
        ),
      );

      if (res === null) {
        this._probe$.next({ status: 'unreachable', setupRequired: null });
      } else {
        this._probe$.next({ status: 'ok', setupRequired: res.setup_required });
      }
    } catch (err) {
      console.error('[setup] unexpected error during refresh', err);
      this._probe$.next({ status: 'unreachable', setupRequired: null });
    }
  }

  markSetupComplete(): void {
    this._probe$.next({ status: 'ok', setupRequired: false });
  }
}
