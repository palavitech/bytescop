import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { EngagementsService } from '../services/engagements.service';
import { EngagementFormComponent, EngagementFormValue } from '../engagement-form/engagement-form.component';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { Engagement } from '../models/engagement.model';

@Component({
  selector: 'app-engagements-create',
  standalone: true,
  imports: [CommonModule, EngagementFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagements-create.component.html',
})
export class EngagementsCreateComponent implements OnInit {
  private readonly engService = inject(EngagementsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly profileService = inject(UserProfileService);

  showHelp = false;
  prefill: Partial<Engagement> | null = null;

  readonly saving$ = new BehaviorSubject(false);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParams;
    const patch: Partial<Engagement> = {};

    if (params['client']) {
      patch.client_id = params['client'];
    }
    if (params['status']) {
      patch.status = params['status'];
    }

    if (Object.keys(patch).length > 0) {
      this.prefill = patch;
    }
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  onSubmit(value: EngagementFormValue): void {
    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_engagements ?? 0;
    if (limit > 0) {
      const current = sub?.usage?.engagements ?? 0;
      if (current >= limit) {
        this.notify.error(`Engagement limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        return;
      }
    }

    this.saving$.next(true);
    this.serverError$.next(null);

    this.engService.create(value).subscribe({
      next: (eng) => {
        this.saving$.next(false);
        this.router.navigate(['/engagements', eng.id]);
      },
      error: (err) => {
        this.saving$.next(false);
        if (err?.status !== 402) {
          const detail = err?.error?.message || err?.error?.detail || err?.error?.name?.[0] || 'Failed to create engagement.';
          this.serverError$.next(detail);
          this.notify.error(detail);
        }
      },
    });
  }

  onCancel(): void {
    this.location.back();
  }
}
