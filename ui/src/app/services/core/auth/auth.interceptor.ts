import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { PermissionService } from './permission.service';
import { TokenService } from './token.service';
import { UserProfileService } from '../profile/user-profile.service';
import { NotificationService } from '../notify/notification.service';
import { environment } from '../../../../environments/environment';

function normalizeBase(url: string): string {
  return (url || '').replace(/\/+$/, '');
}

function isApiRequest(reqUrl: string): boolean {
  const apiBase = normalizeBase(environment.apiUrl || '');
  if (apiBase.length > 0) {
    return reqUrl.startsWith(apiBase);
  }
  try {
    const u = new URL(reqUrl, document.baseURI);
    return u.pathname.startsWith('/api/');
  } catch {
    return reqUrl.startsWith('/api/');
  }
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)bc_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn,
): Observable<HttpEvent<any>> => {
  const auth = inject(AuthService);
  const tokens = inject(TokenService);
  const profileService = inject(UserProfileService);
  const permissionService = inject(PermissionService);
  const router = inject(Router);
  const notify = inject(NotificationService);

  const apiCall = isApiRequest(req.url);

  let patched = req;

  if (apiCall) {
    const headers: Record<string, string> = {};

    // Attach CSRF token on unsafe methods
    if (!SAFE_METHODS.has(req.method)) {
      const csrf = getCsrfToken();
      if (csrf) {
        headers['X-CSRFToken'] = csrf;
      }
    }

    patched = patched.clone({
      withCredentials: true,
      setHeaders: headers,
    });
  }

  return next(patched).pipe(
    timeout(30_000),
    catchError((err: unknown) => {
      if (err instanceof TimeoutError) {
        return throwError(() => new Error('Request timed out. Please check your connection.'));
      }

      if (err instanceof HttpErrorResponse && err.status === 401) {
        // Only redirect if user was previously authenticated (session expired).
        // During bootstrap, tokens.isAuthenticated() is false — skip redirect.
        if (tokens.isAuthenticated()) {
          console.warn('[auth] session expired', { url: req.url });
          auth.setUser(null);
          tokens.clear();
          profileService.clear();
          permissionService.clear();
          router.navigateByUrl('/login');
        }
        return throwError(() => err);
      }

      if (err instanceof HttpErrorResponse && err.status === 402) {
        const detail = err.error?.message || err.error?.detail || 'You have reached a limit on your current plan.';
        const planName = profileService.currentPlanName();
        notify.warning(detail, {
          title: `Plan Limit (${planName})`,
          durationMs: 8000,
        });
        return throwError(() => err);
      }

      if (err instanceof HttpErrorResponse && err.status === 403) {
        if (err.error?.code === 'mfa_setup_required') {
          profileService.setMfaSetupRequired();
          router.navigateByUrl('/mfa/setup');
          return throwError(() => err);
        }
        if (err.error?.code === 'tenant_closing') {
          console.warn('[auth] logout: tenant closing', { url: req.url });
          auth.setUser(null);
          tokens.clear();
          profileService.clear();
          permissionService.clear();
          router.navigateByUrl('/login?reason=tenant_closed');
          return throwError(() => err);
        }
        if (err.error?.setup_required) {
          notify.warning(err.error?.detail || 'Please complete the setup wizard to get started.');
        } else {
          const detail = err.error?.detail || 'You do not have permission to perform this action.';
          notify.error(detail);
        }
      }

      return throwError(() => err);
    }),
  );
};
