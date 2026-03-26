import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { GroupsService } from '../services/groups.service';
import { PermissionsApiService } from '../services/permissions-api.service';
import { GroupFormComponent, GroupFormValue } from '../group-form/group-form.component';
import { PermissionItem } from '../models/group.model';
import { NotificationService } from '../../../../services/core/notify/notification.service';

@Component({
  selector: 'app-groups-create',
  standalone: true,
  imports: [CommonModule, GroupFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './groups-create.component.html',
})
export class GroupsCreateComponent {
  private readonly groupsService = inject(GroupsService);
  private readonly permissionsApi = inject(PermissionsApiService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  readonly saving$ = new BehaviorSubject(false);
  readonly allPermissions$ = new BehaviorSubject<PermissionItem[]>([]);
  readonly serverError$ = new BehaviorSubject<string | null>(null);

  constructor() {
    this.permissionsApi.list().subscribe({
      next: (perms) => this.allPermissions$.next(perms),
    });
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

    this.groupsService.create({
      name: value.name,
      description: value.description,
      permission_ids: value.permission_ids,
    }).subscribe({
      next: (group) => {
        this.saving$.next(false);
        this.router.navigate(['/admin/groups']);
      },
      error: (err) => {
        this.saving$.next(false);
        const detail = err?.error?.message || err?.error?.name?.[0] || err?.error?.detail || 'Failed to create group.';
        this.serverError$.next(detail);
        this.notify.error(detail);
      },
    });
  }

  onCancel(): void {
    this.router.navigate(['/admin/groups']);
  }
}
