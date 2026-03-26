import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenService } from './token.service';

export const AuthDefaultRedirectGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);
  return tokens.isAuthenticated() ? router.createUrlTree(['/dashboard']) : router.createUrlTree(['/login']);
};
