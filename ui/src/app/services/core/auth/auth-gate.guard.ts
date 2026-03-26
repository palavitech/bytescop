import { inject } from '@angular/core';
import { CanActivateFn, CanActivateChildFn, Router } from '@angular/router';
import { TokenService } from './token.service';

export const RequireAuthChildGuard: CanActivateChildFn = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);
  if (tokens.isAuthenticated()) return true;
  console.warn('[auth] guard redirect: not authenticated (child guard)');
  return router.createUrlTree(['/login']);
};

export const RequireAuthGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);
  if (tokens.isAuthenticated()) return true;
  console.warn('[auth] guard redirect: not authenticated');
  return router.createUrlTree(['/login']);
};

export const RedirectIfAuthGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);
  return tokens.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};
