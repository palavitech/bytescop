import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AssetsService } from '../services/assets.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { AssetFormComponent, AssetFormValue } from '../asset-form/asset-form.component';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { OrganizationRef } from '../../organizations/models/organization.model';

@Component({
  selector: 'app-assets-create',
  standalone: true,
  imports: [CommonModule, AssetFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assets-create.component.html',
})
export class AssetsCreateComponent {
  private readonly assetsService = inject(AssetsService);
  private readonly orgService = inject(OrganizationsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly profileService = inject(UserProfileService);

  showHelp = false;

  readonly saving$ = new BehaviorSubject(false);
  readonly organizations$ = new BehaviorSubject<OrganizationRef[]>([]);
  readonly serverError$ = new BehaviorSubject<string | null>(null);
  readonly preselectedClientId: string | null;

  constructor() {
    this.preselectedClientId = this.route.snapshot.queryParamMap.get('client');

    this.orgService.ref().subscribe({
      next: (orgs) => this.organizations$.next(orgs),
    });
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  onSubmit(value: AssetFormValue): void {
    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_assets ?? 0;
    if (limit > 0) {
      const current = sub?.usage?.assets ?? 0;
      if (current >= limit) {
        this.notify.error(`Asset limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        return;
      }
    }

    this.saving$.next(true);
    this.serverError$.next(null);

    this.assetsService.create(value).subscribe({
      next: (asset) => {
        this.saving$.next(false);
        if (this.preselectedClientId) {
          this.router.navigate(['/organizations', this.preselectedClientId]);
        } else {
          this.router.navigate(['/assets']);
        }
      },
      error: (err) => {
        this.saving$.next(false);
        if (err?.status !== 402) {
          const detail = err?.error?.message || err?.error?.detail || err?.error?.name?.[0] || 'Failed to create asset.';
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
