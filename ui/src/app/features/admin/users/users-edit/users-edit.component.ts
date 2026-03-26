import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, forkJoin } from 'rxjs';
import { MembersService } from '../services/members.service';
import { GroupsService } from '../../groups/services/groups.service';
import { UserFormComponent, UserFormValue } from '../user-form/user-form.component';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { TenantMember, MemberGroup } from '../models/member.model';

@Component({
  selector: 'app-users-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, UserFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-edit.component.html',
  styleUrl: './users-edit.component.css',
})
export class UsersEditComponent implements OnInit {
  private readonly membersService = inject(MembersService);
  private readonly groupsService = inject(GroupsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  readonly saving$ = new BehaviorSubject(false);
  readonly loading$ = new BehaviorSubject(true);
  readonly member$ = new BehaviorSubject<TenantMember | null>(null);
  readonly groups$ = new BehaviorSubject<MemberGroup[]>([]);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  private memberId = '';

  ngOnInit(): void {
    this.memberId = this.route.snapshot.paramMap.get('id') ?? '';

    forkJoin([
      this.membersService.getById(this.memberId),
      this.groupsService.list(),
    ]).subscribe({
      next: ([member, groups]) => {
        this.member$.next(member);
        this.groups$.next(groups.map(g => ({ id: g.id, name: g.name, is_default: g.is_default })));
        this.loading$.next(false);
      },
      error: () => {
        this.notify.error('Failed to load user details.');
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

  onSubmit(value: UserFormValue): void {
    this.saving$.next(true);
    this.serverError$.next(null);

    this.membersService.update(this.memberId, {
      first_name: value.first_name,
      last_name: value.last_name,
      group_ids: value.group_ids,
    }).subscribe({
      next: () => {
        this.saving$.next(false);
        this.router.navigate(['/admin/users', this.memberId]);
      },
      error: (err) => {
        this.saving$.next(false);
        const detail = err?.error?.message || err?.error?.detail || 'Failed to update user.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }

  onCancel(): void {
    this.router.navigate(['/admin/users', this.memberId]);
  }
}
