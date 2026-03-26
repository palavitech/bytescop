import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { TokenService } from './token.service';
import { PermissionService } from './permission.service';
import { UserProfileService } from '../profile/user-profile.service';

/**
 * Bootstraps the app by checking if the user has a valid session.
 *
 * On app start, calls GET /api/me/profile/ with credentials. If the
 * session cookie is valid, the backend returns the full profile +
 * authorization payload and we populate all in-memory services.
 * If 401, the user is not authenticated — services stay empty.
 */
@Injectable({ providedIn: 'root' })
export class BootstrapService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
  private readonly profile = inject(UserProfileService);
  private readonly permissions = inject(PermissionService);

  private readonly _ready$ = new BehaviorSubject<boolean>(false);
  readonly ready$ = this._ready$.asObservable();

  /**
   * Called once during APP_INITIALIZER. Returns a promise that resolves
   * when the bootstrap check is complete (regardless of auth state).
   */
  async init(): Promise<void> {
    const base = (environment.apiUrl || '').replace(/\/+$/, '');

    try {
      await firstValueFrom(
        this.http.get<any>(`${base}/api/me/profile/`, { withCredentials: true }).pipe(
          tap(data => {
            this.tokens.setAuthenticated();
            this.profile.setFromAuthResponse(data);
            this.permissions.setFromAuthResponse(data.authorization);
          }),
          catchError(() => {
            // 401 or network error — user is not authenticated
            return of(null);
          }),
        ),
      );
    } catch {
      // Safety net — should not reach here due to catchError above
    }

    this._ready$.next(true);
  }
}
