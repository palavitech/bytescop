import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionService } from './permission.service';
import { NotificationService } from '../notify/notification.service';

/**
 * Route guard factory that checks if the current user has any of the
 * specified permissions. Root users always pass.
 *
 * Usage in routes:
 *   { path: 'admin', canActivate: [requirePermission('user.view', 'group.view')] }
 */
export function requirePermission(...codenames: string[]): CanActivateFn {
  return () => {
    const permissions = inject(PermissionService);
    const router = inject(Router);
    const notify = inject(NotificationService);

    if (permissions.hasAny(...codenames)) {
      return true;
    }

    notify.warning('You do not have permission to access this page.');
    return router.createUrlTree(['/dashboard']);
  };
}
