import { Routes } from '@angular/router';
import { requirePermission } from '../../services/core/auth/require-permission.guard';

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  {
    path: 'users',
    loadComponent: () =>
      import('./users/users-list/users-list.component').then(m => m.UsersListComponent),
    canActivate: [requirePermission('user.view')],
    data: { breadcrumb: 'Users' },
  },
  {
    path: 'users/create',
    loadComponent: () =>
      import('./users/users-create/users-create.component').then(m => m.UsersCreateComponent),
    canActivate: [requirePermission('user.create')],
    data: { breadcrumb: 'Create User' },
  },
  {
    path: 'users/:id',
    loadComponent: () =>
      import('./users/users-view/users-view.component').then(m => m.UsersViewComponent),
    canActivate: [requirePermission('user.view')],
    data: { breadcrumb: 'View User' },
  },
  {
    path: 'users/:id/edit',
    loadComponent: () =>
      import('./users/users-edit/users-edit.component').then(m => m.UsersEditComponent),
    canActivate: [requirePermission('user.update')],
    data: { breadcrumb: 'Edit User' },
  },
  {
    path: 'groups',
    loadComponent: () =>
      import('./groups/groups-list/groups-list.component').then(m => m.GroupsListComponent),
    canActivate: [requirePermission('group.view')],
    data: { breadcrumb: 'Groups' },
  },
  {
    path: 'groups/create',
    loadComponent: () =>
      import('./groups/groups-create/groups-create.component').then(m => m.GroupsCreateComponent),
    canActivate: [requirePermission('group.create')],
    data: { breadcrumb: 'Create Group' },
  },
  {
    path: 'groups/:id',
    loadComponent: () =>
      import('./groups/groups-view/groups-view.component').then(m => m.GroupsViewComponent),
    canActivate: [requirePermission('group.view')],
    data: { breadcrumb: 'View Group' },
  },
  {
    path: 'groups/:id/edit',
    loadComponent: () =>
      import('./groups/groups-edit/groups-edit.component').then(m => m.GroupsEditComponent),
    canActivate: [requirePermission('group.update')],
    data: { breadcrumb: 'Edit Group' },
  },
  {
    path: 'audit',
    loadComponent: () =>
      import('./audit/audit-list/audit-list.component').then(m => m.AuditListComponent),
    canActivate: [requirePermission('audit.view')],
    data: { breadcrumb: 'Audit Log' },
  },
  {
    path: 'audit/:id',
    loadComponent: () =>
      import('./audit/audit-view/audit-view.component').then(m => m.AuditViewComponent),
    canActivate: [requirePermission('audit.view')],
    data: { breadcrumb: 'Audit Entry' },
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings-list/settings-list.component').then(m => m.SettingsListComponent),
    canActivate: [requirePermission('tenant_settings.view')],
    data: { breadcrumb: 'Settings' },
  },
];
