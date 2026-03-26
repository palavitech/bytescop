import { Routes } from '@angular/router';
import { requirePermission } from '../../services/core/auth/require-permission.guard';

export const ASSET_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./assets-list/assets-list.component').then(m => m.AssetsListComponent),
    data: { breadcrumb: 'List' },
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./assets-create/assets-create.component').then(m => m.AssetsCreateComponent),
    canActivate: [requirePermission('asset.create')],
    data: { breadcrumb: 'Create Asset' },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./assets-view/assets-view.component').then(m => m.AssetsViewComponent),
    data: { breadcrumb: 'View Asset' },
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./assets-edit/assets-edit.component').then(m => m.AssetsEditComponent),
    canActivate: [requirePermission('asset.update')],
    data: { breadcrumb: 'Edit Asset' },
  },
];
