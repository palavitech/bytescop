import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, switchMap, catchError, map, of } from 'rxjs';
import { ProjectsService } from '../services/projects.service';
import { ProjectDetail, PROJECT_STATUS_LABELS, ProjectStatus } from '../models/project.model';
import { ENGAGEMENT_TYPE_LABELS, ENGAGEMENT_STATUS_LABELS, EngagementType, EngagementStatus, ENGAGEMENT_TYPE_META } from '../../engagements/models/engagement.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';

type ViewState = 'init' | 'ready' | 'error' | 'missing';

interface ViewModel {
  state: ViewState;
  project: ProjectDetail | null;
}

@Component({
  selector: 'app-projects-view',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective, BcDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-view.component.html',
  styleUrl: './projects-view.component.css',
})
export class ProjectsViewComponent {
  private readonly projectsService = inject(ProjectsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  readonly confirmingDelete$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject(false);
  readonly addingEngagement$ = new BehaviorSubject(false);
  showAddEngagement = false;

  readonly engagementTypes = ENGAGEMENT_TYPE_META;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  readonly vm$ = this.refresh$.pipe(
    switchMap(() => {
      const id = this.route.snapshot.paramMap.get('id');
      if (!id) return of({ state: 'missing' as ViewState, project: null });
      return this.projectsService.getById(id).pipe(
        map(project => ({ state: 'ready' as ViewState, project } as ViewModel)),
        catchError(err => {
          if (err?.status === 404) {
            return of({ state: 'missing' as ViewState, project: null } as ViewModel);
          }
          return of({ state: 'error' as ViewState, project: null } as ViewModel);
        }),
      );
    }),
  );

  goBack(): void {
    this.location.back();
  }

  refresh(): void {
    this.refresh$.next();
  }

  prettyStatus(status: string): string {
    return PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status;
  }

  prettyEngStatus(status: string): string {
    return ENGAGEMENT_STATUS_LABELS[status as EngagementStatus] ?? status;
  }

  prettyType(type: string): string {
    return ENGAGEMENT_TYPE_LABELS[type as EngagementType] ?? type;
  }

  statusClass(status: string): string {
    return `bc-statusProject--${status}`;
  }

  engStatusClass(status: string): string {
    return `bc-statusEngagement--${status}`;
  }

  // ── Delete ─────────────────────────────────────────────────────────

  confirmDelete(): void {
    this.confirmingDelete$.next(true);
  }

  cancelDelete(): void {
    this.confirmingDelete$.next(false);
  }

  deleteProject(project: ProjectDetail): void {
    this.deleting$.next(true);
    this.projectsService.delete(project.id).subscribe({
      next: () => {
        this.deleting$.next(false);
        this.notify.success(`Project "${project.name}" deleted. Engagements are now standalone.`);
        this.router.navigate(['/projects']);
      },
      error: () => {
        this.deleting$.next(false);
        this.notify.error('Failed to delete project.');
      },
    });
  }

  // ── Add Engagement ─────────────────────────────────────────────────

  toggleAddEngagement(): void {
    this.showAddEngagement = !this.showAddEngagement;
  }

  addEngagement(project: ProjectDetail, engType: string): void {
    this.addingEngagement$.next(true);
    this.projectsService.addEngagement(project.id, engType).subscribe({
      next: eng => {
        this.addingEngagement$.next(false);
        this.showAddEngagement = false;
        this.notify.success(`Engagement "${eng.name}" added to project.`);
        this.refresh$.next();
      },
      error: () => {
        this.addingEngagement$.next(false);
        this.notify.error('Failed to add engagement.');
      },
    });
  }
}
