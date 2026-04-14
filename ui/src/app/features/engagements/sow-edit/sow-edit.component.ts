import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, Type } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SowService } from '../services/sow.service';
import { EngagementsService } from '../services/engagements.service';
import { SowStatus, SOW_STATUS_LABELS } from '../models/sow.model';
import { Engagement } from '../models/engagement.model';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { getTypeConfig } from '../types/registry';

@Component({
  selector: 'app-sow-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sow-edit.component.html',
  styleUrls: ['./sow-edit.component.css'],
})
export class SowEditComponent implements OnInit {
  private readonly sowService = inject(SowService);
  private readonly engagementsService = inject(EngagementsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  showHelp = false;

  readonly loading$ = new BehaviorSubject(true);
  readonly saving$ = new BehaviorSubject(false);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  engagementId = '';
  clientId = '';
  readonly engagement$ = new BehaviorSubject<Engagement | null>(null);
  form!: FormGroup;

  // Status toggle
  readonly currentStatus$ = new BehaviorSubject<SowStatus>('draft');
  readonly toggling$ = new BehaviorSubject(false);

  // Scope edit component resolved from registry
  sowScopeEditComponent: Type<any> | null = null;

  readonly statusLabels = SOW_STATUS_LABELS;

  get isScopeLockedByApproval(): boolean {
    return this.currentStatus$.value === 'approved';
  }

  ngOnInit(): void {
    this.engagementId = this.route.snapshot.paramMap.get('id') ?? '';

    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(240)]],
    });

    // Load SoW data
    this.sowService.get(this.engagementId).subscribe({
      next: (sow) => {
        this.form.patchValue({ title: sow.title });
        this.currentStatus$.next(sow.status);
        this.loading$.next(false);
      },
      error: () => {
        this.notify.error('Failed to load statement of work.');
        this.loading$.next(false);
      },
    });

    // Load engagement context and resolve scope edit component
    this.engagementsService.getById(this.engagementId).subscribe({
      next: (eng) => {
        this.engagement$.next(eng);
        this.clientId = eng.client_id || '';
        this.sowScopeEditComponent = getTypeConfig(eng.engagement_type).sowScopeEditComponent;
        this.cdr.markForCheck();
      },
      error: () => {
        // Non-blocking — header links just won't show
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  save(): void {
    if (this.form.invalid) return;
    this.saving$.next(true);
    this.serverError$.next(null);

    this.sowService.update(this.engagementId, { title: this.form.value.title }).subscribe({
      next: () => {
        this.saving$.next(false);
        this.router.navigate(['/engagements', this.engagementId]);
      },
      error: (err) => {
        this.saving$.next(false);
        const detail = err?.error?.message || err?.error?.detail || 'Failed to update statement of work.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }

  toggleStatus(): void {
    const next: SowStatus = this.currentStatus$.value === 'draft' ? 'approved' : 'draft';
    this.toggling$.next(true);
    this.serverError$.next(null);

    this.sowService.update(this.engagementId, { status: next }).subscribe({
      next: () => {
        this.currentStatus$.next(next);
        this.toggling$.next(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toggling$.next(false);
        const detail = err?.error?.message || err?.error?.detail || 'Failed to update status.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }
}
