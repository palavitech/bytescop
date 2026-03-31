import { Routes } from '@angular/router';
import { requirePermission } from '../../services/core/auth/require-permission.guard';
import { canDeactivateDirty } from '../../services/core/guards/dirty-form.guard';

export const ENGAGEMENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./engagements-list/engagements-list.component').then(m => m.EngagementsListComponent),
    data: { breadcrumb: 'List' },
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./engagement-type-select/engagement-type-select.component').then(m => m.EngagementTypeSelectComponent),
    canActivate: [requirePermission('engagement.create')],
    data: { breadcrumb: 'New Engagement' },
  },
  {
    path: 'create/wizard',
    loadComponent: () =>
      import('./engagement-wizard/engagement-wizard.component').then(m => m.EngagementWizardComponent),
    canActivate: [requirePermission('engagement.create')],
    data: { breadcrumb: 'New Engagement' },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./engagements-view/engagements-view.component').then(m => m.EngagementsViewComponent),
    data: { breadcrumb: 'View Engagement' },
  },
  {
    path: ':id/settings',
    loadComponent: () =>
      import('./engagement-settings/engagement-settings.component').then(m => m.EngagementSettingsComponent),
    canActivate: [requirePermission('engagement_settings.view')],
    data: { breadcrumb: 'Engagement Settings' },
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./engagements-edit/engagements-edit.component').then(m => m.EngagementsEditComponent),
    canActivate: [requirePermission('engagement.update')],
    data: { breadcrumb: 'Edit Engagement' },
  },
  {
    path: ':id/sow/edit',
    loadComponent: () =>
      import('./sow-edit/sow-edit.component').then(m => m.SowEditComponent),
    canActivate: [requirePermission('sow.update')],
    data: { breadcrumb: 'Edit SoW' },
  },
  {
    path: ':id/findings',
    loadComponent: () =>
      import('./engagement-findings-list/engagement-findings-list.component').then(m => m.EngagementFindingsListComponent),
    canActivate: [requirePermission('finding.view')],
    data: { breadcrumb: 'Findings', hideBreadcrumb: true },
  },
  {
    path: ':id/findings/create',
    loadComponent: () =>
      import('./engagement-findings-create/engagement-findings-create.component').then(m => m.EngagementFindingsCreateComponent),
    canActivate: [requirePermission('finding.create')],
    canDeactivate: [canDeactivateDirty],
    data: { breadcrumb: 'New Finding', hideBreadcrumb: true },
  },
  {
    path: ':id/findings/:findingId/edit',
    loadComponent: () =>
      import('./engagement-findings-edit/engagement-findings-edit.component').then(m => m.EngagementFindingsEditComponent),
    canActivate: [requirePermission('finding.update')],
    canDeactivate: [canDeactivateDirty],
    data: { breadcrumb: 'Edit Finding', hideBreadcrumb: true },
  },
  {
    path: ':id/findings/:findingId',
    loadComponent: () =>
      import('./engagement-findings-view/engagement-findings-view.component').then(m => m.EngagementFindingsViewComponent),
    canActivate: [requirePermission('finding.view')],
    data: { breadcrumb: 'View Finding', hideBreadcrumb: true },
  },
];
