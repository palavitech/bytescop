import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MembersService } from '../services/members.service';
import { GroupsService } from '../../groups/services/groups.service';
import { UserFormComponent, UserFormValue } from '../user-form/user-form.component';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { MemberGroup } from '../models/member.model';

@Component({
  selector: 'app-users-create',
  standalone: true,
  imports: [CommonModule, UserFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-create.component.html',
})
export class UsersCreateComponent {
  private readonly membersService = inject(MembersService);
  private readonly groupsService = inject(GroupsService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly profileService = inject(UserProfileService);

  showHelp = false;

  readonly saving$ = new BehaviorSubject(false);
  readonly groups$ = new BehaviorSubject<MemberGroup[]>([]);


  constructor() {
    this.groupsService.list().subscribe({
      next: (groups) => {
        this.groups$.next(groups.map(g => ({ id: g.id, name: g.name, is_default: g.is_default })));
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  onSubmit(value: UserFormValue): void {
    const sub = this.profileService.currentSubscription();
    const limit = sub?.limits?.max_members ?? 0;
    if (limit > 0) {
      const current = sub?.usage?.members ?? 0;
      if (current >= limit) {
        this.notify.error(`Team member limit reached (${current}/${limit}). Upgrade your plan to add more.`);
        return;
      }
    }

    this.saving$.next(true);


    this.membersService.create({
      email: value.email,
      first_name: value.first_name,
      last_name: value.last_name,
      password: value.password,
      password_confirm: value.password_confirm,
      group_ids: value.group_ids,
    }).subscribe({
      next: (member) => {
        this.saving$.next(false);
        this.notify.success(`User ${member.user.email} created.`);
        this.router.navigate(['/admin/users']);
      },
      error: (err) => {
        this.saving$.next(false);
        if (err?.status !== 402) {
          const detail = this.extractErrorMessage(err);
          this.notify.error(detail);
        }
      },
    });
  }

  onCancel(): void {
    this.router.navigate(['/admin/users']);
  }

  private extractErrorMessage(err: any): string {
    const body = err?.error;
    if (!body) return 'Failed to create user.';

    // If the API returned a specific (non-generic) message, use it
    if (body.message && body.message !== 'Validation error.') {
      return body.message;
    }

    // Fall through to field-level errors
    if (body.errors && typeof body.errors === 'object') {
      for (const field of Object.keys(body.errors)) {
        const msgs = body.errors[field];
        if (Array.isArray(msgs) && msgs.length) return msgs[0];
        if (typeof msgs === 'string') return msgs;
      }
    }

    return body.detail || 'Failed to create user.';
  }
}
