import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule, Location } from '@angular/common';
import { finalize, map, shareReplay, switchMap, take } from 'rxjs/operators';
import { BehaviorSubject, Observable, of } from 'rxjs';

import { EngagementsService } from '../services/engagements.service';
import { Engagement } from '../models/engagement.model';
import { SowService } from '../services/sow.service';
import { Asset } from '../../assets/models/asset.model';
import { FindingsService } from '../services/findings.service';
import { Finding } from '../models/finding.model';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { DirtyFormComponent, beforeUnloadGuard } from '../../../services/core/guards/dirty-form.guard';
import { FindingSectionMalwareComponent, MalwareFindingPayload } from '../types/malware-analysis';
import { FindingSectionStandardComponent, StandardFindingPayload } from '../types/default';
import { FindingSectionForensicsComponent, ForensicsFindingPayload } from '../types/digital-forensics';

@Component({
  selector: 'app-engagement-findings-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, RouterLink, FindingSectionMalwareComponent, FindingSectionStandardComponent, FindingSectionForensicsComponent],
  templateUrl: './engagement-findings-edit.component.html',
  styleUrl: './engagement-findings-edit.component.css',
})
export class EngagementFindingsEditComponent implements OnInit, DirtyFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly engagementsService = inject(EngagementsService);
  private readonly sowService = inject(SowService);
  private readonly findingsService = inject(FindingsService);
  private readonly notify = inject(NotificationService);
  private readonly location = inject(Location);
  private readonly cdr = inject(ChangeDetectorRef);

  busy = false;
  showHelp = false;
  private saved = false;
  private childDirty = false;
  readonly isDraft$ = new BehaviorSubject<boolean>(false);

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

  readonly finding$: Observable<Finding | null> = this.route.paramMap.pipe(
    map(p => ({ engId: p.get('id') || '', fId: p.get('findingId') || '' })),
    switchMap(({ engId, fId }) =>
      engId && fId ? this.findingsService.getById(engId, fId) : of(null),
    ),
    shareReplay(1),
  );

  readonly scopeAssets$: Observable<Asset[]> = this.engagementId$.pipe(
    switchMap(id => id ? this.sowService.listScope(id) : of([] as Asset[])),
    shareReplay(1),
  );

  // -- Engagement type branching --
  isMalwareFlow = false;
  isForensicsFlow = false;
  standardInitialData: Partial<StandardFindingPayload> | null = null;
  malwareInitialData: Partial<MalwareFindingPayload> | null = null;
  forensicsInitialData: Partial<ForensicsFindingPayload> | null = null;

  ngOnInit(): void {
    this.finding$.pipe(take(1)).subscribe(f => {
      if (!f) return;
      this.isDraft$.next(f.is_draft);

      this.standardInitialData = {
        title: f.title,
        assessment_area: f.assessment_area,
        owasp_category: f.owasp_category,
        cwe_id: f.cwe_id,
        severity: f.severity,
        status: f.status,
        asset_id: f.asset_id || '',
        description_md: f.description_md || '',
        recommendation_md: f.recommendation_md || '',
      };

      if (f.sample_id) {
        this.malwareInitialData = {
          title: f.title,
          sample_id: f.sample_id,
          analysis_type: f.analysis_type || 'static',
          description_md: f.description_md,
        };
      }

      if (f.evidence_source_id) {
        this.forensicsInitialData = {
          title: f.title,
          evidence_source_id: f.evidence_source_id,
          mitre_tactic: f.mitre_tactic || '',
          mitre_technique: f.mitre_technique || '',
          ioc_type: f.ioc_type || '',
          ioc_value: f.ioc_value || '',
          occurrence_date: f.occurrence_date || '',
          description_md: f.description_md,
        };
      }

      this.cdr.markForCheck();
    });

    // Determine engagement type
    this.engagement$.pipe(take(1)).subscribe(eng => {
      this.isMalwareFlow = eng?.engagement_type === 'malware_analysis';
      this.isForensicsFlow = eng?.engagement_type === 'digital_forensics';
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

  onStandardFindingSubmitted(payload: StandardFindingPayload): void {
    const engagementId = this.route.snapshot.paramMap.get('id');
    const findingId = this.route.snapshot.paramMap.get('findingId');
    if (!engagementId || !findingId) return;

    this.busy = true;
    this.cdr.markForCheck();

    const apiPayload: Partial<Finding> = {
      title: payload.title,
      assessment_area: payload.assessment_area,
      owasp_category: payload.owasp_category,
      cwe_id: payload.cwe_id,
      severity: payload.severity,
      status: payload.status,
      asset_id: payload.asset_id,
      description_md: payload.description_md,
      recommendation_md: payload.recommendation_md,
    };

    if (payload.is_draft === false && this.isDraft$.value) {
      apiPayload.is_draft = false; // publishing
    } else if (payload.is_draft) {
      apiPayload.is_draft = true; // saving as draft
    }

    this.findingsService
      .update(engagementId, findingId, apiPayload)
      .pipe(
        finalize(() => { this.busy = false; this.cdr.markForCheck(); }),
        take(1),
      )
      .subscribe({
        next: () => {
          this.saved = true;
          if (apiPayload.is_draft === false) {
            this.isDraft$.next(false);
          }
          this.router.navigate(['/engagements', engagementId, 'findings', findingId]);
        },
        error: (e) => {
          if (e?.status !== 402) {
            this.notify.error(e?.error?.message || e?.error?.detail || 'Update failed.');
          }
        },
      });
  }

  onMalwareFindingSubmitted(payload: MalwareFindingPayload): void {
    const engagementId = this.route.snapshot.paramMap.get('id');
    const findingId = this.route.snapshot.paramMap.get('findingId');
    if (!engagementId || !findingId) return;

    this.busy = true;
    this.cdr.markForCheck();

    this.findingsService
      .update(engagementId, findingId, {
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
          this.router.navigate(['/engagements', engagementId, 'findings', findingId]);
        },
        error: (e) => {
          this.busy = false;
          this.cdr.markForCheck();
          if (e?.status !== 402) {
            this.notify.error(e?.error?.message || e?.error?.detail || 'Update failed.');
          }
        },
      });
  }

  onForensicsFindingSubmitted(payload: ForensicsFindingPayload): void {
    const engagementId = this.route.snapshot.paramMap.get('id');
    const findingId = this.route.snapshot.paramMap.get('findingId');
    if (!engagementId || !findingId) return;

    this.busy = true;
    this.cdr.markForCheck();

    this.findingsService
      .update(engagementId, findingId, {
        title: payload.title,
        evidence_source_id: payload.evidence_source_id,
        mitre_tactic: payload.mitre_tactic,
        mitre_technique: payload.mitre_technique,
        ioc_type: payload.ioc_type,
        ioc_value: payload.ioc_value,
        occurrence_date: payload.occurrence_date,
        description_md: payload.description_md,
        is_draft: payload.is_draft,
      })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.saved = true;
          this.router.navigate(['/engagements', engagementId, 'findings', findingId]);
        },
        error: (e) => {
          this.busy = false;
          this.cdr.markForCheck();
          if (e?.status !== 402) {
            this.notify.error(e?.error?.message || e?.error?.detail || 'Update failed.');
          }
        },
      });
  }

  cancel(): void {
    const engagementId = this.route.snapshot.paramMap.get('id');
    const findingId = this.route.snapshot.paramMap.get('findingId');
    if (engagementId && findingId) {
      this.router.navigate(['/engagements', engagementId, 'findings', findingId]);
    } else if (engagementId) {
      this.router.navigate(['/engagements', engagementId, 'findings']);
    } else {
      this.router.navigate(['/engagements']);
    }
  }
}
