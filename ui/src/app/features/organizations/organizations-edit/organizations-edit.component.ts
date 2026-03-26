import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { OrganizationsService } from '../services/organizations.service';
import { OrganizationFormComponent, OrganizationFormValue } from '../organization-form/organization-form.component';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { Organization } from '../models/organization.model';

@Component({
  selector: 'app-organizations-edit',
  standalone: true,
  imports: [CommonModule, OrganizationFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organizations-edit.component.html',
})
export class OrganizationsEditComponent implements OnInit {
  private readonly orgService = inject(OrganizationsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  readonly saving$ = new BehaviorSubject(false);
  readonly loading$ = new BehaviorSubject(true);
  readonly organization$ = new BehaviorSubject<Organization | null>(null);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  private orgId = '';

  ngOnInit(): void {
    this.orgId = this.route.snapshot.paramMap.get('id') ?? '';

    this.orgService.getById(this.orgId).subscribe({
      next: (org) => {
        this.organization$.next(org);
        this.loading$.next(false);
      },
      error: () => {
        this.notify.error('Failed to load client details.');
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

  onSubmit(value: OrganizationFormValue): void {
    this.saving$.next(true);
    this.serverError$.next(null);

    this.orgService.update(this.orgId, value).subscribe({
      next: () => {
        this.saving$.next(false);
        this.router.navigate(['/organizations', this.orgId]);
      },
      error: (err) => {
        this.saving$.next(false);
        const detail = err?.error?.message || err?.error?.detail || 'Failed to update client.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }

  onCancel(): void {
    this.router.navigate(['/organizations', this.orgId]);
  }
}
