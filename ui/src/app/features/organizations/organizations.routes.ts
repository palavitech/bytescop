import { Routes } from '@angular/router';
import { requirePermission } from '../../services/core/auth/require-permission.guard';

export const ORGANIZATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./organizations-list/organizations-list.component').then(m => m.OrganizationsListComponent),
    data: { breadcrumb: 'List' },
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./organizations-create/organizations-create.component').then(m => m.OrganizationsCreateComponent),
    canActivate: [requirePermission('client.create')],
    data: { breadcrumb: 'Create Client' },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./organizations-view/organizations-view.component').then(m => m.OrganizationsViewComponent),
    data: { breadcrumb: 'View Client' },
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./organizations-edit/organizations-edit.component').then(m => m.OrganizationsEditComponent),
    canActivate: [requirePermission('client.update')],
    data: { breadcrumb: 'Edit Client' },
  },
];
