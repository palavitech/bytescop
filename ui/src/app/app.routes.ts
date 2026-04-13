import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { RequireAuthGuard, RedirectIfAuthGuard } from './services/core/auth/auth-gate.guard';
import { MfaSetupGuard } from './services/core/auth/mfa-setup.guard';
import { PasswordResetGuard } from './services/core/auth/password-reset.guard';
import { requirePermission } from './services/core/auth/require-permission.guard';
import { SetupGateGuard } from './services/core/setup/setup-gate.guard';
import { TokenService } from './services/core/auth/token.service';

/**
 * Smart redirect for the root path.
 * If authenticated → /dashboard, else → /login.
 */
const AuthDefaultRedirectGuard: CanActivateFn = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);
  return tokens.isAuthenticated()
    ? router.createUrlTree(['/dashboard'])
    : router.createUrlTree(['/login']);
};

export const routes: Routes = [
  // --- Routes OUTSIDE the setup gate (always accessible) ---
  {
    path: 'setup',
    loadComponent: () => import('./pages/setup/setup.component').then(m => m.SetupComponent),
    data: { breadcrumb: 'Setup', hideBreadcrumb: true, hideSidebar: true, authPage: true },
  },
  {
    path: 'closing',
    loadComponent: () => import('./pages/closing/closing.component').then(m => m.ClosingComponent),
    data: { breadcrumb: 'Closing', hideBreadcrumb: true, hideSidebar: true, authPage: true },
  },

  // --- All other routes: guarded by SetupGateGuard ---
  {
    path: '',
    canActivateChild: [SetupGateGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [AuthDefaultRedirectGuard],
        // Needs a component to activate guards — use a trivial redirect
        loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
      },
      {
        path: 'login',
        loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
        canActivate: [RedirectIfAuthGuard],
        data: { breadcrumb: 'Login', hideBreadcrumb: true, authPage: true },
      },
      {
        path: 'verify-email',
        loadComponent: () => import('./pages/verify-email/verify-email.component').then(m => m.VerifyEmailComponent),
        data: { breadcrumb: 'Verify Email', hideBreadcrumb: true, authPage: true },
      },
      {
        path: 'forgot-password',
        loadComponent: () => import('./pages/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
        data: { breadcrumb: 'Forgot Password', hideBreadcrumb: true, authPage: true },
      },
      {
        path: 'reset-password',
        loadComponent: () => import('./pages/reset-password/reset-password.component').then(m => m.ResetPasswordComponent),
        data: { breadcrumb: 'Reset Password', hideBreadcrumb: true, authPage: true },
      },
      {
        path: 'accept-invite',
        loadComponent: () => import('./pages/accept-invite/accept-invite.component').then(m => m.AcceptInviteComponent),
        data: { breadcrumb: 'Accept Invite', hideBreadcrumb: true, hideSidebar: true, authPage: true },
      },
      {
        path: 'mfa/setup',
        loadComponent: () => import('./pages/mfa-setup/mfa-setup.component').then(m => m.MfaSetupComponent),
        canActivate: [RequireAuthGuard],
        data: { breadcrumb: 'MFA Setup', hideBreadcrumb: true, hideSidebar: true, authPage: true },
      },
      {
        path: 'privacy',
        loadComponent: () => import('./pages/privacy/privacy.component').then(m => m.PrivacyComponent),
        data: { breadcrumb: 'Privacy', hideBreadcrumb: true, hideSidebar: true },
      },
      {
        path: 'terms',
        loadComponent: () => import('./pages/terms/terms.component').then(m => m.TermsComponent),
        data: { breadcrumb: 'Terms', hideBreadcrumb: true, hideSidebar: true },
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
        canActivate: [RequireAuthGuard, MfaSetupGuard, PasswordResetGuard],
        data: { breadcrumb: 'Dashboard', hideBreadcrumb: true },
      },
      {
        path: 'organizations',
        canActivate: [RequireAuthGuard, MfaSetupGuard, PasswordResetGuard, requirePermission('client.view')],
        loadChildren: () => import('./features/organizations/organizations.routes').then(m => m.ORGANIZATION_ROUTES),
        data: { breadcrumb: 'Clients' },
      },
      {
        path: 'projects',
        canActivate: [RequireAuthGuard, MfaSetupGuard, PasswordResetGuard, requirePermission('project.view')],
        loadChildren: () => import('./features/projects/projects.routes').then(m => m.PROJECT_ROUTES),
        data: { breadcrumb: 'Projects' },
      },
      {
        path: 'engagements',
        canActivate: [RequireAuthGuard, MfaSetupGuard, PasswordResetGuard, requirePermission('engagement.view')],
        loadChildren: () => import('./features/engagements/engagements.routes').then(m => m.ENGAGEMENT_ROUTES),
        data: { breadcrumb: 'Engagements' },
      },
      {
        path: 'assets',
        canActivate: [RequireAuthGuard, MfaSetupGuard, PasswordResetGuard, requirePermission('asset.view')],
        loadChildren: () => import('./features/assets/assets.routes').then(m => m.ASSET_ROUTES),
        data: { breadcrumb: 'Assets' },
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile-page/profile-page.component').then(m => m.ProfilePageComponent),
        canActivate: [RequireAuthGuard],
        data: { breadcrumb: 'Profile' },
      },
      {
        path: 'admin',
        canActivate: [RequireAuthGuard, MfaSetupGuard, PasswordResetGuard, requirePermission('user.view', 'group.view', 'audit.view', 'tenant_settings.view')],
        loadChildren: () => import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
        data: { breadcrumb: 'Admin' },
      },
      { path: '**', redirectTo: 'login' },
    ],
  },
];
