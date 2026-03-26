import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { UserProfileService } from '../profile/user-profile.service';

export const PasswordResetGuard: CanActivateFn = () => {
  const profileService = inject(UserProfileService);
  const router = inject(Router);

  return profileService.passwordResetRequired$.pipe(
    take(1),
    map(required => required ? router.createUrlTree(['/profile']) : true),
  );
};
