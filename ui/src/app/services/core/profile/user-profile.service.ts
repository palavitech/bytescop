import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { TokenService } from '../auth/token.service';
import { SubscriptionInfo, UserProfile, UserProfileState } from './user-profile.types';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly tokens = inject(TokenService);
  private readonly http = inject(HttpClient);

  private readonly _state$ = new BehaviorSubject<UserProfileState>({
    profile: null,
    loadedAt: null,
    loading: false,
    error: null,
  });

  readonly state$ = this._state$.asObservable();
  readonly profile$ = this.state$.pipe(map(s => s.profile), distinctUntilChanged());
  readonly displayName$ = this.profile$.pipe(map(p => p?.displayName ?? ''));
  readonly email$ = this.profile$.pipe(map(p => p?.user?.email ?? ''));
  readonly initials$ = this.profile$.pipe(map(p => p?.initials ?? ''));
  readonly avatarUrl$ = this.profile$.pipe(map(p => p?.avatarUrl ?? null), distinctUntilChanged());
  readonly subscription$ = this.profile$.pipe(map(p => p?.subscription ?? null), distinctUntilChanged());
  readonly planName$ = this.subscription$.pipe(map(s => s?.plan_name ?? 'Free'), distinctUntilChanged());
  readonly passwordResetRequired$ = this.profile$.pipe(map(p => p?.passwordResetRequired ?? false), distinctUntilChanged());
  readonly mfaSetupRequired$ = this.profile$.pipe(map(p => p?.mfaSetupRequired ?? false), distinctUntilChanged());

  constructor() {
    this.tokens.state$.subscribe(s => {
      if (!s.authenticated) {
        this.clear();
      }
    });
  }

  setFromAuthResponse(res: { user?: any; tenant?: any; subscription?: any; password_reset_required?: boolean; password_reset_reason?: string | null; mfa_setup_required?: boolean; date_format?: string | null }): void {
    const u = res.user;
    if (!u) return;

    const first = (u.first_name ?? '').trim();
    const last = (u.last_name ?? '').trim();
    const email = (u.email ?? '').trim();

    const fullName = [first, last].filter(Boolean).join(' ');
    const displayName = fullName || email || 'User';
    const initials = this.computeInitials(first, last, email);

    const avatarUrl = u.avatar_url
      ? `${environment.apiUrl}${u.avatar_url}`
      : null;

    const profile: UserProfile = {
      user: {
        id: u.id,
        email,
        first_name: first,
        last_name: last,
        avatar_url: u.avatar_url ?? null,
        password_changed_at: u.password_changed_at ?? null,
      },
      tenant: res.tenant ?? null,
      subscription: res.subscription ?? null,
      displayName,
      initials,
      avatarUrl,
      passwordResetRequired: res.password_reset_required ?? false,
      passwordResetReason: res.password_reset_reason ?? null,
      passwordChangedAt: u.password_changed_at ?? null,
      mfaSetupRequired: res.mfa_setup_required ?? false,
      dateFormat: res.date_format ?? null,
    };

    this._state$.next({ profile, loadedAt: Date.now(), loading: false, error: null });
  }

  updateAvatarUrl(rawUrl: string | null): void {
    const current = this._state$.value;
    if (!current.profile) return;

    const avatarUrl = rawUrl
      ? `${environment.apiUrl}${rawUrl}?t=${Date.now()}`
      : null;

    const profile: UserProfile = {
      ...current.profile,
      user: { ...current.profile.user, avatar_url: rawUrl },
      avatarUrl,
    };

    this._state$.next({ ...current, profile });
  }

  updateName(firstName: string, lastName: string): void {
    const current = this._state$.value;
    if (!current.profile) return;

    const first = firstName.trim();
    const last = lastName.trim();
    const email = current.profile.user.email;
    const fullName = [first, last].filter(Boolean).join(' ');
    const displayName = fullName || email || 'User';
    const initials = this.computeInitials(first, last, email);

    const profile: UserProfile = {
      ...current.profile,
      user: { ...current.profile.user, first_name: first, last_name: last },
      displayName,
      initials,
    };

    this._state$.next({ ...current, profile });
  }

  currentTenantId(): string | null {
    return this._state$.value.profile?.tenant?.id ?? null;
  }

  currentPlanName(): string {
    return this._state$.value.profile?.subscription?.plan_name ?? 'Free';
  }

  currentSubscription(): SubscriptionInfo | null {
    return this._state$.value.profile?.subscription ?? null;
  }

  /**
   * Fetch the latest profile from the API and update local state.
   * Used for bootstrap on page load and when cached profile may be stale.
   */
  refreshProfile() {
    const base = (environment.apiUrl || '').replace(/\/+$/, '');
    return this.http.get<any>(`${base}/api/me/profile/`).pipe(
      tap(res => this.setFromAuthResponse(res)),
    );
  }

  clearMfaSetupFlag(): void {
    const current = this._state$.value;
    if (!current.profile) return;

    const profile: UserProfile = {
      ...current.profile,
      mfaSetupRequired: false,
    };

    this._state$.next({ ...current, profile });
  }

  setMfaSetupRequired(): void {
    const current = this._state$.value;
    if (!current.profile) return;

    const profile: UserProfile = {
      ...current.profile,
      mfaSetupRequired: true,
    };

    this._state$.next({ ...current, profile });
  }

  clearPasswordResetFlag(): void {
    const current = this._state$.value;
    if (!current.profile) return;

    const profile: UserProfile = {
      ...current.profile,
      passwordResetRequired: false,
      passwordResetReason: null,
      passwordChangedAt: new Date().toISOString(),
    };

    this._state$.next({ ...current, profile });
  }

  clear(): void {
    this._state$.next({ profile: null, loadedAt: null, loading: false, error: null });
  }

  private computeInitials(first: string, last: string, email: string): string {
    if (first && last) {
      return (first[0] + last[0]).toUpperCase();
    }
    if (first) {
      return first.substring(0, 2).toUpperCase();
    }
    if (email) {
      const local = email.split('@')[0];
      return local.substring(0, 2).toUpperCase();
    }
    return 'BC';
  }
}
