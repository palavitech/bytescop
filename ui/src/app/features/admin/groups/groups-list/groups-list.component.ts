import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, finalize, map, of, switchMap } from 'rxjs';
import { GroupsService } from '../services/groups.service';
import { TenantGroupListItem } from '../models/group.model';
import { HasPermissionDirective } from '../../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../../services/core/notify/notification.service';

type ViewState = 'init' | 'ready' | 'error';

interface ViewModel {
  state: ViewState;
  groups: TenantGroupListItem[];
  total: number;
  deletingId: string | null;
}

@Component({
  selector: 'app-groups-list',
  standalone: true,
  imports: [CommonModule, RouterLink, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './groups-list.component.html',
  styleUrl: './groups-list.component.css',
})
export class GroupsListComponent {
  private readonly groupsService = inject(GroupsService);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);

  showHelp = false;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private readonly deletingId$ = new BehaviorSubject<string | null>(null);

  readonly vm$ = combineLatest([
    this.refresh$.pipe(
      switchMap(() =>
        this.groupsService.list().pipe(
          map(groups => ({ state: 'ready' as ViewState, groups })),
          catchError(() => of({ state: 'error' as ViewState, groups: [] as TenantGroupListItem[] })),
        ),
      ),
    ),
    this.deletingId$,
  ]).pipe(
    map(([data, deletingId]) => ({
      ...data,
      total: data.groups.length,
      deletingId,
    } as ViewModel)),
  );

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

  exportCsv(groups: TenantGroupListItem[]): void {
    const header = 'Name,Description,Type,Members';
    const rows = groups.map(g =>
      `"${g.name}","${g.description || ''}","${g.is_default ? 'Default' : 'Custom'}","${g.member_count}"`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'groups.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  deleteGroup(group: TenantGroupListItem): void {
    this.groupsService.delete(group.id).pipe(
      finalize(() => this.deletingId$.next(null)),
    ).subscribe({
      next: () => {
        this.refresh();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to delete group.');
      },
    });
  }
}
