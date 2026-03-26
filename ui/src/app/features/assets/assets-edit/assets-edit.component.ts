import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, forkJoin } from 'rxjs';
import { AssetsService } from '../services/assets.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { AssetFormComponent, AssetFormValue } from '../asset-form/asset-form.component';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { Asset } from '../models/asset.model';
import { OrganizationRef } from '../../organizations/models/organization.model';

@Component({
  selector: 'app-assets-edit',
  standalone: true,
  imports: [CommonModule, AssetFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assets-edit.component.html',
})
export class AssetsEditComponent implements OnInit {
  private readonly assetsService = inject(AssetsService);
  private readonly orgService = inject(OrganizationsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  readonly saving$ = new BehaviorSubject(false);
  readonly loading$ = new BehaviorSubject(true);
  readonly asset$ = new BehaviorSubject<Asset | null>(null);
  readonly organizations$ = new BehaviorSubject<OrganizationRef[]>([]);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  private assetId = '';

  ngOnInit(): void {
    this.assetId = this.route.snapshot.paramMap.get('id') ?? '';

    forkJoin([
      this.assetsService.getById(this.assetId),
      this.orgService.ref(),
    ]).subscribe({
      next: ([asset, orgs]) => {
        this.asset$.next(asset);
        this.organizations$.next(orgs);
        this.loading$.next(false);
      },
      error: () => {
        this.notify.error('Failed to load asset details.');
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

  onSubmit(value: AssetFormValue): void {
    this.saving$.next(true);
    this.serverError$.next(null);

    this.assetsService.update(this.assetId, value).subscribe({
      next: () => {
        this.saving$.next(false);
        this.navigateBack();
      },
      error: (err) => {
        this.saving$.next(false);
        const detail = err?.error?.message || err?.error?.detail || 'Failed to update asset.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }

  onCancel(): void {
    this.navigateBack();
  }

  private navigateBack(): void {
    const clientId = this.asset$.value?.client_id;
    if (clientId) {
      this.router.navigate(['/organizations', clientId]);
    } else {
      this.router.navigate(['/assets']);
    }
  }
}
