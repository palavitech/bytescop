import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type TokenState = {
  authenticated: boolean;
};

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly _state$ = new BehaviorSubject<TokenState>({ authenticated: false });
  readonly state$ = this._state$.asObservable();

  isAuthenticated(): boolean {
    return this._state$.value.authenticated;
  }

  setAuthenticated(): void {
    this._state$.next({ authenticated: true });
  }

  clear(): void {
    this._state$.next({ authenticated: false });
  }
}
