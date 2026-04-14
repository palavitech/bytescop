import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, signal, Type } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { EngagementsService } from '../services/engagements.service';
import { Engagement, EngagementStatus, EngagementType, ENGAGEMENT_STATUS_LABELS, ENGAGEMENT_TYPE_LABELS } from '../models/engagement.model';
import { SowService } from '../services/sow.service';
import { Sow, SowStatus, SOW_STATUS_LABELS } from '../models/sow.model';
import { Asset } from '../../assets/models/asset.model';
import { FindingsService } from '../services/findings.service';
import { ReportService } from '../services/report.service';
import { Finding } from '../models/finding.model';
import { ProjectRef } from '../../projects/models/project.model';
import { ProjectsService } from '../../projects/services/projects.service';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';
import { BcCommentsComponent } from '../../comments/components/bc-comments.component';
import { getTypeConfig } from '../types/registry';
import { VisualizeComponent } from './visualize/visualize.component';

type ViewState = 'init' | 'ready' | 'error' | 'missing';
type SowState = 'init' | 'ready' | 'empty' | 'error';
interface ViewModel {
  state: ViewState;
  engagement: Engagement | null;
}

interface SowViewModel {
  state: SowState;
  sow: Sow | null;
}

@Component({
  selector: 'app-engagements-view',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, HasPermissionDirective, BcDatePipe, BcCommentsComponent, VisualizeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagements-view.component.html',
  styleUrl: './engagements-view.component.css',
})
export class EngagementsViewComponent implements OnInit {
  private readonly engagementsService = inject(EngagementsService);
  private readonly sowService = inject(SowService);
  private readonly findingsService = inject(FindingsService);
  private readonly reportService = inject(ReportService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly projectsService = inject(ProjectsService);

  showHelp = false;
  showSummary = false;

  // -- Project assignment --
  readonly projectRefs = signal<ProjectRef[]>([]);
  readonly showProjectAssign = signal(false);
  readonly selectedProjectId = signal<string | null>(null);
  readonly savingProject = signal(false);

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly refreshSow$ = new BehaviorSubject<void>(undefined);
  readonly confirmingDelete$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject(false);

  engagementId = '';

  vm$ = of<ViewModel>({ state: 'init', engagement: null });
  sowVm$ = of<SowViewModel>({ state: 'init', sow: null });
  scopeSummaryComponent: Type<any> | null = null;
  readonly scopeRefreshTrigger = signal(0);


  ngOnInit(): void {
    this.engagementId = this.route.snapshot.paramMap.get('id') ?? '';

    this.vm$ = this.refresh$.pipe(
      switchMap(() =>
        this.engagementsService.getById(this.engagementId).pipe(
          map(engagement => ({ state: 'ready' as ViewState, engagement })),
          catchError(err => {
            if (err?.status === 404) {
              return of({ state: 'missing' as ViewState, engagement: null });
            }
            return of({ state: 'error' as ViewState, engagement: null });
          }),
        ),
      ),
    );

    this.sowVm$ = this.refreshSow$.pipe(
      switchMap(() =>
        this.sowService.get(this.engagementId).pipe(
          map(sow => ({ state: 'ready' as SowState, sow })),
          catchError(err => {
            if (err?.status === 404) {
              return of({ state: 'empty' as SowState, sow: null });
            }
            return of({ state: 'error' as SowState, sow: null });
          }),
        ),
      ),
    );

    // Resolve scope summary component from engagement type
    this.vm$.subscribe(vm => {
      if (vm.engagement) {
        const config = getTypeConfig(vm.engagement.engagement_type);
        this.scopeSummaryComponent = config.scopeSummaryComponent;
        this.cdr.markForCheck();
      }
    });
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
    if (this.showHelp) {
      this.showSummary = false;
    }
  }

  toggleSummary(): void {
    this.showSummary = !this.showSummary;
  }

  refresh(): void {
    this.refresh$.next();
    this.refreshSow$.next();
    this.scopeRefreshTrigger.update(n => n + 1);
  }

  refreshSow(): void {
    this.refreshSow$.next();
    this.scopeRefreshTrigger.update(n => n + 1);
  }

  // -- Engagement delete --

  confirmDelete(): void {
    this.confirmingDelete$.next(true);
  }

  cancelDelete(): void {
    this.confirmingDelete$.next(false);
  }

  deleteEngagement(eng: Engagement): void {
    this.deleting$.next(true);
    this.engagementsService.delete(eng.id).subscribe({
      next: () => {
        this.deleting$.next(false);
        this.router.navigate(['/engagements']);
      },
      error: (err) => {
        this.deleting$.next(false);
        this.confirmingDelete$.next(false);
        this.notify.error(err?.error?.detail || 'Failed to delete engagement.');
      },
    });
  }

  // -- Project assignment --

  toggleProjectAssign(): void {
    const show = !this.showProjectAssign();
    this.showProjectAssign.set(show);
    if (show && this.projectRefs().length === 0) {
      this.projectsService.ref().subscribe({
        next: refs => this.projectRefs.set(refs),
        error: () => this.projectRefs.set([]),
      });
    }
  }

  onProjectSelectChange(value: string): void {
    this.selectedProjectId.set(value || null);
  }

  assignProject(eng: Engagement): void {
    const projectId = this.selectedProjectId();
    if (!projectId) return;
    this.savingProject.set(true);
    this.engagementsService.update(eng.id, { project_id: projectId } as any).subscribe({
      next: () => {
        this.savingProject.set(false);
        this.showProjectAssign.set(false);
        this.notify.success('Engagement assigned to project.');
        this.refresh$.next();
      },
      error: () => {
        this.savingProject.set(false);
        this.notify.error('Failed to assign project.');
      },
    });
  }

  removeProject(eng: Engagement): void {
    this.savingProject.set(true);
    this.engagementsService.update(eng.id, { project_id: null } as any).subscribe({
      next: () => {
        this.savingProject.set(false);
        this.showProjectAssign.set(false);
        this.notify.success('Engagement removed from project.');
        this.refresh$.next();
      },
      error: () => {
        this.savingProject.set(false);
        this.notify.error('Failed to remove from project.');
      },
    });
  }

  // -- Report generation --

  generatingReport = false;

  generateReport(eng: Engagement): void {
    if (this.generatingReport) return;
    this.generatingReport = true;
    this.cdr.markForCheck();

    forkJoin({
      findings: this.findingsService.list(eng.id).pipe(catchError(err => {
        console.warn('[engagement-view] report: failed to load findings', err?.status);
        return of([] as Finding[]);
      })),
      scope: this.sowService.listScope(eng.id).pipe(catchError(err => {
        console.warn('[engagement-view] report: failed to load scope', err?.status);
        return of([] as Asset[]);
      })),
    }).subscribe({
      next: async ({ findings, scope }) => {
        try {
          await this.reportService.generate(eng, findings, scope);
        } catch (err) {
          console.error('[engagement-view] report generation failed', err);
          this.notify.error('Failed to generate report.');
        }
        this.generatingReport = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.notify.error('Failed to load data for report.');
        this.generatingReport = false;
        this.cdr.markForCheck();
      },
    });
  }

  // -- Helpers --

  prettyStatus(status: string): string {
    return ENGAGEMENT_STATUS_LABELS[status as EngagementStatus] ?? status;
  }

  prettyType(type: string): string {
    return ENGAGEMENT_TYPE_LABELS[type as EngagementType] ?? type;
  }

  statusClass(status: string): string {
    return `bc-statusEngagement--${status}`;
  }

  prettySowStatus(status: string): string {
    return SOW_STATUS_LABELS[status as SowStatus] ?? status;
  }

  sowStatusClass(status: string): string {
    return `bc-statusSow--${status}`;
  }

  daysRemaining(start: string | null, end: string | null): string {
    if (!end) return '—';
    const endD = new Date(`${end}T00:00:00`);
    if (Number.isNaN(endD.getTime())) return '—';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const ms = endD.getTime() - today.getTime();
    const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
    if (days < 0) return `${Math.abs(days)} day(s) past end`;
    return `${days} day(s) remaining`;
  }

}
