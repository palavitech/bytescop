import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { OrganizationsService } from '../services/organizations.service';
import { OrganizationFormComponent, OrganizationFormValue } from '../organization-form/organization-form.component';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';

@Component({
  selector: 'app-organizations-create',
  standalone: true,
  imports: [CommonModule, OrganizationFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organizations-create.component.html',
})
export class OrganizationsCreateComponent {
  private readonly orgService = inject(OrganizationsService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly profileService = inject(UserProfileService);

  showHelp = false;

  readonly saving$ = new BehaviorSubject(false);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  onSubmit(value: OrganizationFormValue): void {
    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_clients ?? 0;
    if (limit > 0) {
      const current = sub?.usage?.clients ?? 0;
      if (current >= limit) {
        this.notify.error(`Client limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        return;
      }
    }

    this.saving$.next(true);
    this.serverError$.next(null);

    this.orgService.create(value).subscribe({
      next: (org) => {
        this.saving$.next(false);
        this.router.navigate(['/organizations']);
      },
      error: (err) => {
        this.saving$.next(false);
        if (err?.status !== 402) {
          const detail = err?.error?.message || err?.error?.detail || err?.error?.name?.[0] || 'Failed to create client.';
          this.serverError$.next(detail);
          this.notify.error(detail);
        }
      },
    });
  }

  onCancel(): void {
    this.router.navigate(['/organizations']);
  }
}
