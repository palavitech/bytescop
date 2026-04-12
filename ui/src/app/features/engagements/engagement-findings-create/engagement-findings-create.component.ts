import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, inject, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { catchError, map, shareReplay, switchMap, take } from 'rxjs/operators';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { EngagementsService } from '../services/engagements.service';
import { Engagement, FindingsSummary } from '../models/engagement.model';
import { SowService } from '../services/sow.service';
import { Asset } from '../../assets/models/asset.model';
import { FindingsService } from '../services/findings.service';
import { SowStatus } from '../models/sow.model';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { DirtyFormComponent, beforeUnloadGuard } from '../../../services/core/guards/dirty-form.guard';
import { FindingSectionMalwareComponent, MalwareFindingPayload } from '../types/malware-analysis';
import { FindingSectionStandardComponent, StandardFindingPayload } from '../types/default';

@Component({
  selector: 'app-engagement-findings-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, RouterLink, FindingSectionMalwareComponent, FindingSectionStandardComponent],
  templateUrl: './engagement-findings-create.component.html',
  styleUrl: './engagement-findings-create.component.css',
})
export class EngagementFindingsCreateComponent implements DirtyFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly engagementsService = inject(EngagementsService);
  private readonly sowService = inject(SowService);
  private readonly findingsService = inject(FindingsService);
  private readonly notify = inject(NotificationService);
  private readonly location = inject(Location);
  private readonly permissionService = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly profileService = inject(UserProfileService);

  busy = false;
  showHelp = false;
  private saved = false;
  private childDirty = false;

  isDirty(): boolean { return !this.saved && this.childDirty; }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void { beforeUnloadGuard(this, e); }

  private readonly engagementId$ = this.route.paramMap.pipe(
    map(p => p.get('id') || ''),
    shareReplay(1),
  );

  readonly engagement$: Observable<Engagement | null> = this.engagementId$.pipe(
    switchMap(id => id ? this.engagementsService.getById(id) : of(null)),
    shareReplay(1),
  );

  readonly scopeAssets$: Observable<Asset[]> = this.engagementId$.pipe(
    switchMap(id => id ? this.sowService.listScope(id) : of([] as Asset[])),
    shareReplay(1),
  );

  readonly sowStatus$ = new BehaviorSubject<SowStatus | null>(null);
  sowLoaded = false;
  canApproveSow = false;

  // -- Engagement type branching --
  isMalwareFlow = false;

  constructor() {
    // Load SoW status
    this.engagementId$.pipe(
      take(1),
      switchMap(id => id ? this.sowService.get(id).pipe(catchError(err => {
        console.warn('[findings-create] failed to load SoW', err?.status);
        return of(null);
      })) : of(null)),
    ).subscribe(sow => {
      this.sowStatus$.next(sow?.status ?? null);
      this.sowLoaded = true;
      this.canApproveSow = this.permissionService.has('sow.update');
    });

    // Determine engagement type
    this.engagement$.pipe(take(1)).subscribe(eng => {
      this.isMalwareFlow = eng?.engagement_type === 'malware_analysis';
      this.cdr.markForCheck();
    });
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  onDirtyChange(dirty: boolean): void {
    this.childDirty = dirty;
  }

  private sumFindings(s: FindingsSummary | null): number {
    if (!s) return 0;
    return (s.critical ?? 0) + (s.high ?? 0) + (s.medium ?? 0) + (s.low ?? 0) + (s.info ?? 0);
  }

  onStandardFindingSubmitted(payload: StandardFindingPayload): void {
    const engagementId = this.route.snapshot.paramMap.get('id');
    if (!engagementId) return;

    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_findings_per_engagement ?? 0;
    if (limit > 0) {
      this.engagement$.pipe(take(1)).subscribe(eng => {
        const current = this.sumFindings(eng?.findings_summary ?? null);
        if (current >= limit) {
          this.notify.error(`Findings limit reached (${current}/${limit}). Upgrade your plan to add more.`);
          return;
        }
        this.doCreateStandard(engagementId, payload);
      });
      return;
    }

    this.doCreateStandard(engagementId, payload);
  }

  private doCreateStandard(engagementId: string, payload: StandardFindingPayload): void {
    this.busy = true;
    this.cdr.markForCheck();

    this.findingsService
      .create(engagementId, {
        title: payload.title,
        assessment_area: payload.assessment_area,
        owasp_category: payload.owasp_category,
        cwe_id: payload.cwe_id,
        severity: payload.severity,
        status: payload.status,
        asset_id: payload.asset_id,
        description_md: payload.description_md,
        recommendation_md: payload.recommendation_md,
        is_draft: payload.is_draft,
      })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.saved = true;
          this.router.navigate(['/engagements', engagementId, 'findings']);
        },
        error: (e) => {
          this.busy = false;
          this.cdr.markForCheck();
          if (e?.status !== 402) {
            this.notify.error(e?.error?.message || e?.error?.detail || 'Create failed.');
          }
        },
      });
  }

  onMalwareFindingSubmitted(payload: MalwareFindingPayload): void {
    const engagementId = this.route.snapshot.paramMap.get('id');
    if (!engagementId) return;

    this.busy = true;
    this.cdr.markForCheck();

    this.findingsService
      .create(engagementId, {
        title: payload.title,
        sample_id: payload.sample_id,
        analysis_type: payload.analysis_type,
        description_md: payload.description_md,
        is_draft: payload.is_draft,
      })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.saved = true;
          this.router.navigate(['/engagements', engagementId, 'findings']);
        },
        error: (e) => {
          this.busy = false;
          this.cdr.markForCheck();
          if (e?.status !== 402) {
            this.notify.error(e?.error?.message || e?.error?.detail || 'Create failed.');
          }
        },
      });
  }

  cancel(): void {
    const engagementId = this.route.snapshot.paramMap.get('id');
    if (engagementId) {
      this.router.navigate(['/engagements', engagementId, 'findings']);
    } else {
      this.router.navigate(['/engagements']);
    }
  }
}
