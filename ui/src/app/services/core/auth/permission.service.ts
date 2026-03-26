import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

export type PermissionGroupInfo = {
  id: string;
  name: string;
  is_default: boolean;
};

export type AuthorizationPayload = {
  is_root: boolean;
  permissions: string[];
  groups: PermissionGroupInfo[];
};

type PermissionState = {
  isRoot: boolean;
  permissions: Set<string>;
  groups: PermissionGroupInfo[];
  loaded: boolean;
};

const EMPTY_STATE: PermissionState = {
  isRoot: false,
  permissions: new Set(),
  groups: [],
  loaded: false,
};

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly _state$ = new BehaviorSubject<PermissionState>(EMPTY_STATE);

  readonly state$ = this._state$.asObservable();

  readonly isRoot$ = this.state$.pipe(
    map(s => s.isRoot),
    distinctUntilChanged(),
  );

  readonly loaded$ = this.state$.pipe(
    map(s => s.loaded),
    distinctUntilChanged(),
  );

  readonly defaultGroupNames$ = this.state$.pipe(
    map(s => s.groups.filter(g => g.is_default).map(g => g.name)),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  );

  setFromAuthResponse(data: AuthorizationPayload | undefined | null): void {
    if (!data) return;

    this._state$.next({
      isRoot: data.is_root,
      permissions: new Set(data.permissions),
      groups: data.groups ?? [],
      loaded: true,
    });
  }

  has(codename: string): boolean {
    const state = this._state$.value;
    if (state.isRoot) return true;
    return state.permissions.has(codename);
  }

  hasAll(...codenames: string[]): boolean {
    const state = this._state$.value;
    if (state.isRoot) return true;
    return codenames.every(c => state.permissions.has(c));
  }

  hasAny(...codenames: string[]): boolean {
    const state = this._state$.value;
    if (state.isRoot) return true;
    return codenames.some(c => state.permissions.has(c));
  }

  has$(codename: string): Observable<boolean> {
    return this.state$.pipe(
      map(s => s.isRoot || s.permissions.has(codename)),
      distinctUntilChanged(),
    );
  }

  hasAny$(...codenames: string[]): Observable<boolean> {
    return this.state$.pipe(
      map(s => s.isRoot || codenames.some(c => s.permissions.has(c))),
      distinctUntilChanged(),
    );
  }

  clear(): void {
    this._state$.next(EMPTY_STATE);
  }
}
