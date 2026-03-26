import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BehaviorSubject, combineLatest, of, switchMap, catchError, map } from 'rxjs';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import { EngagementsService } from '../services/engagements.service';
import { FindingsService } from '../services/findings.service';
import { Engagement } from '../models/engagement.model';
import {
  Finding,
  FindingSeverity,
  FindingStatus,
  FINDING_SEVERITY_LABELS,
  FINDING_STATUS_LABELS,
} from '../models/finding.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';
import { ClassificationCardComponent } from '../components/classification-card/classification-card.component';
import { BcCommentsComponent } from '../../comments/components/bc-comments.component';
import { wrapImageCaptions } from './markdown-utils';

type ViewState = 'init' | 'ready' | 'error' | 'missing';

interface ViewModel {
  state: ViewState;
  engagement: Engagement | null;
  finding: Finding | null;
  descriptionHtml: SafeHtml;
  recommendationHtml: SafeHtml;
}

@Component({
  selector: 'app-engagement-findings-view',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective, BcDatePipe, ClassificationCardComponent, BcCommentsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagement-findings-view.component.html',
  styleUrl: './engagement-findings-view.component.css',
})
export class EngagementFindingsViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly engagementsService = inject(EngagementsService);
  private readonly findingsService = inject(FindingsService);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  readonly confirmingDelete$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject(false);

  private engagementId = '';
  private findingId = '';

  vm$ = of<ViewModel>({
    state: 'init',
    engagement: null,
    finding: null,
    descriptionHtml: '',
    recommendationHtml: '',
  });

  ngOnInit(): void {
    this.engagementId = this.route.snapshot.paramMap.get('id') ?? '';
    this.findingId = this.route.snapshot.paramMap.get('findingId') ?? '';

    this.vm$ = this.refresh$.pipe(
      switchMap(() =>
        combineLatest([
          this.engagementsService.getById(this.engagementId).pipe(
            catchError(() => of(null)),
          ),
          this.findingsService.getById(this.engagementId, this.findingId).pipe(
            catchError(err => {
              if (err?.status === 404) return of('missing' as const);
              return of(null);
            }),
          ),
        ]).pipe(
          map(([eng, findingResult]): ViewModel => {
            if (findingResult === 'missing') {
              return { state: 'missing', engagement: eng, finding: null, descriptionHtml: '', recommendationHtml: '' };
            }
            if (!eng || !findingResult) {
              return { state: 'error', engagement: eng, finding: null, descriptionHtml: '', recommendationHtml: '' };
            }
            return {
              state: 'ready',
              engagement: eng,
              finding: findingResult,
              descriptionHtml: this.renderMarkdown(findingResult.description_md),
              recommendationHtml: this.renderMarkdown(findingResult.recommendation_md),
            };
          }),
        ),
      ),
    );
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  refresh(): void {
    this.refresh$.next();
  }

  // -- Delete --

  confirmDelete(): void {
    this.confirmingDelete$.next(true);
  }

  cancelDelete(): void {
    this.confirmingDelete$.next(false);
  }

  deleteFinding(finding: Finding): void {
    this.deleting$.next(true);
    this.findingsService.delete(this.engagementId, finding.id).subscribe({
      next: () => {
        this.deleting$.next(false);
        this.router.navigate(['/engagements', this.engagementId, 'findings']);
      },
      error: (err) => {
        this.deleting$.next(false);
        this.confirmingDelete$.next(false);
        this.notify.error(err?.error?.detail || 'Failed to delete finding.');
      },
    });
  }

  // -- Helpers --

  prettySeverity(s: string): string {
    return FINDING_SEVERITY_LABELS[s as FindingSeverity] ?? s;
  }

  prettyStatus(s: string): string {
    return FINDING_STATUS_LABELS[s as FindingStatus] ?? s;
  }

  private renderMarkdown(md: string | null | undefined): SafeHtml {
    if (!md?.trim()) return '';
    let html = marked.parse(md, { async: false }) as string;
    html = wrapImageCaptions(html);
    html = html.replace(/<img /g, '<img class="bc-mdImg" ');
    html = DOMPurify.sanitize(html, {
      ADD_ATTR: ['class', 'title', 'alt', 'src'],
      ADD_TAGS: ['figure', 'figcaption'],
    });
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
