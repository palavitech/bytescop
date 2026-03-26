import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { UserProfileService } from '../profile/user-profile.service';

export const MfaSetupGuard: CanActivateFn = () => {
  const profileService = inject(UserProfileService);
  const router = inject(Router);

  return profileService.mfaSetupRequired$.pipe(
    take(1),
    map(required => required ? router.createUrlTree(['/mfa/setup']) : true),
  );
};
