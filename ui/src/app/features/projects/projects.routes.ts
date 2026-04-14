import { Routes } from '@angular/router';
import { requirePermission } from '../../services/core/auth/require-permission.guard';

export const PROJECT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./projects-list/projects-list.component').then(m => m.ProjectsListComponent),
    data: { breadcrumb: 'List' },
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./project-wizard/project-wizard.component').then(m => m.ProjectWizardComponent),
    canActivate: [requirePermission('project.create')],
    data: { breadcrumb: 'New Project' },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./projects-view/projects-view.component').then(m => m.ProjectsViewComponent),
    data: { breadcrumb: 'View Project' },
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./projects-edit/projects-edit.component').then(m => m.ProjectsEditComponent),
    canActivate: [requirePermission('project.update')],
    data: { breadcrumb: 'Edit Project' },
  },
];
