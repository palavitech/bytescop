import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, finalize, map, of, switchMap } from 'rxjs';
import { OrganizationsService } from '../services/organizations.service';
import { Organization } from '../models/organization.model';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';

type ViewState = 'init' | 'ready' | 'error';

interface ViewModel {
  state: ViewState;
  organizations: Organization[];
  total: number;
  deletingId: string | null;
}

@Component({
  selector: 'app-organizations-list',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective, BcDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organizations-list.component.html',
  styleUrl: './organizations-list.component.css',
})
export class OrganizationsListComponent implements OnInit {
  private readonly orgService = inject(OrganizationsService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly profileService = inject(UserProfileService);

  showHelp = false;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly deletingId$ = new BehaviorSubject<string | null>(null);

  readonly vm$ = combineLatest([
    this.refresh$.pipe(
      switchMap(() =>
        this.orgService.list().pipe(
          map(organizations => ({ state: 'ready' as ViewState, organizations })),
          catchError(err => {
            console.error('[orgs-list] failed to load organizations', err?.status);
            return of({ state: 'error' as ViewState, organizations: [] as Organization[] });
          }),
        ),
      ),
    ),
    this.deletingId$,
  ]).pipe(
    map(([data, deletingId]) => ({
      ...data,
      total: data.organizations.length,
      deletingId,
    } as ViewModel)),
  );

  ngOnInit(): void {
    // Initial load happens via refresh$ BehaviorSubject
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

  confirmDelete(id: string): void {
    this.deletingId$.next(id);
  }

  cancelDelete(): void {
    this.deletingId$.next(null);
  }

  deleteOrganization(org: Organization): void {
    this.orgService.delete(org.id).pipe(
      finalize(() => this.deletingId$.next(null)),
    ).subscribe({
      next: () => {
        this.refresh();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to delete client.');
      },
    });
  }

  createOrganization(): void {
    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_clients ?? 0;
    if (limit > 0) {
      const current = sub?.usage?.clients ?? 0;
      if (current >= limit) {
        this.notify.error(`Client limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        return;
      }
    }
    this.router.navigate(['/organizations/create']);
  }

  exportCsv(organizations: Organization[]): void {
    const header = 'Name,Website,Status,Created';
    const rows = organizations.map(o =>
      `"${o.name}","${o.website}","${o.status}","${o.created_at}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'organizations.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

}
