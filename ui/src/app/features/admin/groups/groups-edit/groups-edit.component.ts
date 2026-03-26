import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, forkJoin } from 'rxjs';
import { GroupsService } from '../services/groups.service';
import { PermissionsApiService } from '../services/permissions-api.service';
import { MembersService } from '../../users/services/members.service';
import { GroupFormComponent, GroupFormValue } from '../group-form/group-form.component';
import { PermissionItem, TenantGroupDetail } from '../models/group.model';
import { TenantMember } from '../../users/models/member.model';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { HasPermissionDirective } from '../../../../components/directives/has-permission.directive';

@Component({
  selector: 'app-groups-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, GroupFormComponent, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './groups-edit.component.html',
  styleUrl: './groups-edit.component.css',
})
export class GroupsEditComponent implements OnInit {
  private readonly groupsService = inject(GroupsService);
  private readonly permissionsApi = inject(PermissionsApiService);
  private readonly membersService = inject(MembersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  showHelp = false;

  readonly loading$ = new BehaviorSubject(true);
  readonly saving$ = new BehaviorSubject(false);
  readonly group$ = new BehaviorSubject<TenantGroupDetail | null>(null);
  readonly allPermissions$ = new BehaviorSubject<PermissionItem[]>([]);
  readonly members$ = new BehaviorSubject<TenantMember[]>([]);
  readonly allTenantMembers$ = new BehaviorSubject<TenantMember[]>([]);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  selectedMemberId = '';
  private groupId = '';

  ngOnInit(): void {
    this.groupId = this.route.snapshot.paramMap.get('id') ?? '';

    forkJoin([
      this.groupsService.getById(this.groupId),
      this.permissionsApi.list(),
      this.membersService.list(),
    ]).subscribe({
      next: ([group, perms, members]) => {
        this.group$.next(group);
        this.allPermissions$.next(perms);
        this.allTenantMembers$.next(members);
        // Filter members who belong to this group
        this.members$.next(
          members.filter(m => m.groups.some(g => g.id === this.groupId)),
        );
        this.loading$.next(false);
      },
      error: () => {
        this.notify.error('Failed to load group details.');
        this.loading$.next(false);
      },
    });
  }

  get isDefault(): boolean {
    return this.group$.value?.is_default ?? false;
  }

  get availableMembers(): TenantMember[] {
    const currentIds = new Set(this.members$.value.map(m => m.id));
    return this.allTenantMembers$.value.filter(m => !currentIds.has(m.id) && m.is_active);
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  onSubmit(value: GroupFormValue): void {
    this.saving$.next(true);
    this.serverError$.next(null);

    this.groupsService.update(this.groupId, {
      name: value.name,
      description: value.description,
      permission_ids: value.permission_ids,
    }).subscribe({
      next: (group) => {
        this.saving$.next(false);
        this.group$.next(group);
        this.router.navigate(['/admin/groups', this.groupId]);
      },
      error: (err) => {
        this.saving$.next(false);
        const detail = err?.error?.message || err?.error?.name?.[0] || err?.error?.detail || 'Failed to update group.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }

  addMember(): void {
    if (!this.selectedMemberId) return;

    this.groupsService.addMember(this.groupId, this.selectedMemberId).subscribe({
      next: () => {
        const member = this.allTenantMembers$.value.find(m => m.id === this.selectedMemberId);
        if (member) {
          this.members$.next([...this.members$.value, member]);
        }
        this.selectedMemberId = '';
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to add member.');
      },
    });
  }

  removeMember(member: TenantMember): void {
    this.groupsService.removeMember(this.groupId, member.id).subscribe({
      next: () => {
        this.members$.next(this.members$.value.filter(m => m.id !== member.id));
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to remove member.');
      },
    });
  }

  onCancel(): void {
    this.router.navigate(['/admin/groups', this.groupId]);
  }
}
