import { Injectable, inject } from '@angular/core';
import { CanActivateChild, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { SetupStateService } from './setup-state.service';

@Injectable({ providedIn: 'root' })
export class SetupGateGuard implements CanActivateChild {
  private readonly setup = inject(SetupStateService);
  private readonly router = inject(Router);

  canActivateChild(): Observable<boolean | UrlTree> | boolean | UrlTree {
    const probe = this.setup.probeSnapshot;

    // Still loading — wait for probe to finish
    if (probe.status === 'loading') {
      return this.setup.probe$.pipe(
        filter(p => p.status !== 'loading'),
        take(1),
        map(p => this.decide(p.status, p.setupRequired)),
      );
    }

    return this.decide(probe.status, probe.setupRequired);
  }

  private decide(status: string, setupRequired: boolean | null): boolean | UrlTree {
    if (status === 'unreachable') {
      // API unreachable — allow through, let individual pages handle errors
      return true;
    }
    if (setupRequired) {
      return this.router.createUrlTree(['/setup']);
    }
    return true;
  }
}
