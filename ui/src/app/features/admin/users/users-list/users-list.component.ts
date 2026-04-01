import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, finalize, map, of, switchMap } from 'rxjs';
import { MembersService } from '../services/members.service';
import { TenantMember } from '../models/member.model';
import { HasPermissionDirective } from '../../../../components/directives/has-permission.directive';
import { SecureImagePipe } from '../../../../components/pipes/secure-image.pipe';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { UserNested } from '../models/member.model';
import { environment } from '../../../../../environments/environment';

type ViewState = 'init' | 'ready' | 'error';

interface ViewModel {
  state: ViewState;
  members: TenantMember[];
  total: number;
  deletingId: string | null;
}

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective, SecureImagePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-list.component.html',
  styleUrl: './users-list.component.css',
})
export class UsersListComponent implements OnInit {
  private readonly membersService = inject(MembersService);
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
        this.membersService.list().pipe(
          map(members => ({ state: 'ready' as ViewState, members })),
          catchError(err => {
            console.error('[users-list] failed to load members', err?.status);
            return of({ state: 'error' as ViewState, members: [] as TenantMember[] });
          }),
        ),
      ),
    ),
    this.deletingId$,
  ]).pipe(
    map(([data, deletingId]) => ({
      ...data,
      total: data.members.length,
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

  prettyRole(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  confirmDelete(id: string): void {
    this.deletingId$.next(id);
  }

  cancelDelete(): void {
    this.deletingId$.next(null);
  }

  deleteUser(member: TenantMember): void {
    this.membersService.delete(member.id).pipe(
      finalize(() => this.deletingId$.next(null)),
    ).subscribe({
      next: () => {
        this.refresh();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to remove user.');
      },
    });
  }

  createUser(): void {
    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_members ?? 0;
    if (limit > 0) {
      const current = sub?.usage?.members ?? 0;
      if (current >= limit) {
        this.notify.error(`Team member limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        return;
      }
    }
    this.router.navigate(['/admin/users/create']);
  }

  exportCsv(members: TenantMember[]): void {
    const header = 'Name,Email,Role,Status,Groups';
    const rows = members.map(m =>
      `"${m.user.first_name} ${m.user.last_name}","${m.user.email}","${m.role}","${m.is_active ? 'Active' : 'Locked'}","${m.groups.map(g => g.name).join('; ')}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  toggleActive(member: TenantMember): void {
    this.membersService.toggleActive(member.id).subscribe({
      next: (res) => {
        const action = res.is_active ? 'unlocked' : 'locked';
        this.refresh();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to toggle user status.');
      },
    });
  }

  buildAvatarUrl(rawUrl: string | null): string | null {
    if (!rawUrl) return null;
    return `${environment.apiUrl}${rawUrl}`;
  }

  getInitials(user: UserNested): string {
    if (user.first_name && user.last_name) {
      return (user.first_name[0] + user.last_name[0]).toUpperCase();
    }
    if (user.first_name) {
      return user.first_name.substring(0, 2).toUpperCase();
    }
    const local = user.email.split('@')[0];
    return local.substring(0, 2).toUpperCase();
  }
}
