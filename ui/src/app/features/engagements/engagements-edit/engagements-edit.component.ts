import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { EngagementsService } from '../services/engagements.service';
import { EngagementFormComponent, EngagementFormValue } from '../engagement-form/engagement-form.component';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { Engagement } from '../models/engagement.model';

@Component({
  selector: 'app-engagements-edit',
  standalone: true,
  imports: [CommonModule, RouterLink, EngagementFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagements-edit.component.html',
})
export class EngagementsEditComponent implements OnInit {
  private readonly engService = inject(EngagementsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  readonly saving$ = new BehaviorSubject(false);
  readonly loading$ = new BehaviorSubject(true);
  readonly engagement$ = new BehaviorSubject<Engagement | null>(null);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  private engagementId = '';

  ngOnInit(): void {
    this.engagementId = this.route.snapshot.paramMap.get('id') ?? '';

    this.engService.getById(this.engagementId).subscribe({
      next: (eng) => {
        this.engagement$.next(eng);
        this.loading$.next(false);
      },
      error: () => {
        this.notify.error('Failed to load engagement details.');
        this.loading$.next(false);
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  onSubmit(value: EngagementFormValue): void {
    this.saving$.next(true);
    this.serverError$.next(null);

    this.engService.update(this.engagementId, value).subscribe({
      next: (eng) => {
        this.saving$.next(false);
        this.router.navigate(['/engagements', this.engagementId]);
      },
      error: (err) => {
        this.saving$.next(false);
        const detail = err?.error?.message || err?.error?.detail || err?.error?.name?.[0] || 'Failed to update engagement.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }

  onCancel(): void {
    this.router.navigate(['/engagements', this.engagementId]);
  }
}
