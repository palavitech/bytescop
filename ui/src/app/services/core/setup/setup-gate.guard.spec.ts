import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { SetupGateGuard } from './setup-gate.guard';
import { SetupStateService, SetupProbe } from './setup-state.service';

describe('SetupGateGuard', () => {
  let guard: SetupGateGuard;
  let router: Router;
  let probe$: BehaviorSubject<SetupProbe>;
  let setupServiceMock: Partial<SetupStateService>;

  function createGuard(snapshot: SetupProbe): void {
    probe$ = new BehaviorSubject<SetupProbe>(snapshot);
    setupServiceMock = {
      get probeSnapshot() { return probe$.value; },
      probe$: probe$.asObservable(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'setup', component: class {} as any },
          { path: 'login', component: class {} as any },
        ]),
        SetupGateGuard,
        { provide: SetupStateService, useValue: setupServiceMock },
      ],
    });

    guard = TestBed.inject(SetupGateGuard);
    router = TestBed.inject(Router);
  }

  afterEach(() => TestBed.resetTestingModule());

  // --- Synchronous decisions ---

  it('returns true when API is unreachable', () => {
    createGuard({ status: 'unreachable', setupRequired: null });
    const result = guard.canActivateChild();
    expect(result).toBe(true);
  });

  it('returns true when setup is not required', () => {
    createGuard({ status: 'ok', setupRequired: false });
    const result = guard.canActivateChild();
    expect(result).toBe(true);
  });

  it('redirects to /setup when setup is required', () => {
    createGuard({ status: 'ok', setupRequired: true });
    const result = guard.canActivateChild();
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/setup');
  });

  // --- Async (loading) decisions ---

  it('waits for probe to finish loading then allows access', fakeAsync(() => {
    createGuard({ status: 'loading', setupRequired: null });
    const result = guard.canActivateChild() as Observable<boolean | UrlTree>;
    expect(result).toBeTruthy();

    let resolved: boolean | UrlTree | undefined;
    result.subscribe(v => (resolved = v));

    // Still loading - no emission yet
    expect(resolved).toBeUndefined();

    // Probe completes: setup NOT required
    probe$.next({ status: 'ok', setupRequired: false });
    tick();

    expect(resolved).toBe(true);
  }));

  it('waits for probe to finish loading then redirects to /setup', fakeAsync(() => {
    createGuard({ status: 'loading', setupRequired: null });
    const result = guard.canActivateChild() as Observable<boolean | UrlTree>;

    let resolved: boolean | UrlTree | undefined;
    result.subscribe(v => (resolved = v));

    // Probe completes: setup IS required
    probe$.next({ status: 'ok', setupRequired: true });
    tick();

    expect(resolved).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(resolved as UrlTree)).toBe('/setup');
  }));

  it('allows access when probe resolves to unreachable after loading', fakeAsync(() => {
    createGuard({ status: 'loading', setupRequired: null });
    const result = guard.canActivateChild() as Observable<boolean | UrlTree>;

    let resolved: boolean | UrlTree | undefined;
    result.subscribe(v => (resolved = v));

    probe$.next({ status: 'unreachable', setupRequired: null });
    tick();

    expect(resolved).toBe(true);
  }));
});
