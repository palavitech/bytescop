import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { GroupsService } from '../services/groups.service';
import { MembersService } from '../../users/services/members.service';
import { PermissionItem, TenantGroupDetail } from '../models/group.model';
import { TenantMember } from '../../users/models/member.model';
import { HasPermissionDirective } from '../../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { BcDatePipe } from '../../../../components/pipes/bc-date.pipe';

type ViewState = 'init' | 'ready' | 'error' | 'missing';

interface ViewModel {
  state: ViewState;
  group: TenantGroupDetail | null;
  members: TenantMember[];
}

interface PermissionsByResource {
  resource: string;
  permissions: PermissionItem[];
}

@Component({
  selector: 'app-groups-view',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective, BcDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './groups-view.component.html',
  styleUrl: './groups-view.component.css',
})
export class GroupsViewComponent implements OnInit {
  private readonly groupsService = inject(GroupsService);
  private readonly membersService = inject(MembersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  readonly confirmingDelete$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject(false);

  private groupId = '';

  vm$ = of<ViewModel>({ state: 'init', group: null, members: [] });

  ngOnInit(): void {
    this.groupId = this.route.snapshot.paramMap.get('id') ?? '';

    this.vm$ = this.refresh$.pipe(
      switchMap(() =>
        forkJoin([
          this.groupsService.getById(this.groupId),
          this.membersService.list(),
        ]).pipe(
          map(([group, allMembers]) => {
            const members = allMembers.filter(m =>
              m.groups.some(g => g.id === this.groupId),
            );
            return { state: 'ready' as ViewState, group, members };
          }),
          catchError(err => {
            if (err?.status === 404) {
              return of({ state: 'missing' as ViewState, group: null, members: [] });
            }
            return of({ state: 'error' as ViewState, group: null, members: [] });
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

  confirmDelete(): void {
    this.confirmingDelete$.next(true);
  }

  cancelDelete(): void {
    this.confirmingDelete$.next(false);
  }

  deleteGroup(group: TenantGroupDetail): void {
    this.deleting$.next(true);
    this.groupsService.delete(group.id).subscribe({
      next: () => {
        this.deleting$.next(false);
        this.router.navigate(['/admin/groups']);
      },
      error: (err) => {
        this.deleting$.next(false);
        this.confirmingDelete$.next(false);
        this.notify.error(err?.error?.detail || 'Failed to delete group.');
      },
    });
  }

  groupPermissionsByResource(permissions: PermissionItem[]): PermissionsByResource[] {
    const grouped = new Map<string, PermissionItem[]>();
    for (const p of permissions) {
      const existing = grouped.get(p.resource) ?? [];
      existing.push(p);
      grouped.set(p.resource, existing);
    }
    return Array.from(grouped.entries())
      .map(([resource, perms]) => ({ resource, permissions: perms }))
      .sort((a, b) => a.resource.localeCompare(b.resource));
  }

}
