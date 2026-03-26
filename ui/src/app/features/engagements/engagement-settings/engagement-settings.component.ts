import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, switchMap, map, catchError, of } from 'rxjs';

import { EngagementsService } from '../services/engagements.service';
import { MembersService } from '../../admin/users/services/members.service';
import { TenantMember } from '../../admin/users/models/member.model';
import {
  EngagementStakeholder,
  EngagementSettingDef,
  STAKEHOLDER_ROLES,
  STAKEHOLDER_ROLE_LABELS,
} from '../models/stakeholder.model';
import { Engagement } from '../models/engagement.model';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';

type ViewState = 'init' | 'ready' | 'error';

interface SettingRow extends EngagementSettingDef {
  editValue: string;
  dirty: boolean;
  saving: boolean;
}

interface SettingGroup {
  name: string;
  settings: SettingRow[];
}

interface ViewModel {
  state: ViewState;
  engagement: Engagement | null;
  groups: SettingGroup[];
  totalCount: number;
}

@Component({
  selector: 'app-engagement-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, HasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engagement-settings.component.html',
  styleUrl: './engagement-settings.component.css',
})
export class EngagementSettingsComponent implements OnInit {
  private readonly engagementsService = inject(EngagementsService);
  private readonly membersService = inject(MembersService);
  private readonly notify = inject(NotificationService);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);

  showHelp = false;
  engagementId = '';

  // Stakeholder state
  stakeholders = signal<EngagementStakeholder[]>([]);
  stakeholdersLoading = signal(false);
  availableMembers = signal<TenantMember[]>([]);
  showAddStakeholder = signal(false);
  addStakeholderMemberId = '';
  addStakeholderRole = 'account_manager';
  addingStakeholder = signal(false);

  readonly allRoles = STAKEHOLDER_ROLES;
  readonly roleLabels = STAKEHOLDER_ROLE_LABELS;

  private static readonly ANALYST_POSITIONS = new Set([
    'security_engineer', 'lead_tester', 'qa_reviewer', 'technical_lead',
  ]);
  private static readonly COLLABORATOR_POSITIONS = new Set([
    'account_manager', 'project_manager', 'client_poc', 'observer',
  ]);

  getPositionsForMember(memberId: string): { value: string; label: string }[] {
    const member = this.availableMembers().find(m => m.id === memberId);
    if (!member) return this.allRoles;
    if (member.role === 'owner') return this.allRoles;

    const groupNames = new Set(member.groups.map(g => g.name));
    const allowed = new Set<string>();
    if (groupNames.has('Administrators')) {
      this.allRoles.forEach(r => allowed.add(r.value));
    }
    if (groupNames.has('Analysts')) {
      EngagementSettingsComponent.ANALYST_POSITIONS.forEach(p => allowed.add(p));
    }
    if (groupNames.has('Collaborators')) {
      EngagementSettingsComponent.COLLABORATOR_POSITIONS.forEach(p => allowed.add(p));
    }
    if (allowed.size === 0) return this.allRoles;
    return this.allRoles.filter(r => allowed.has(r.value));
  }

  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  vm$ = of<ViewModel>({ state: 'init', engagement: null, groups: [], totalCount: 0 });

  ngOnInit(): void {
    this.engagementId = this.route.snapshot.paramMap.get('id') ?? '';

    this.vm$ = this.refresh$.pipe(
      switchMap(() =>
        this.engagementsService.getById(this.engagementId).pipe(
          switchMap(engagement =>
            this.engagementsService.listSettings(this.engagementId).pipe(
              map(settings => this.buildViewModel(engagement, settings)),
              catchError(() => of<ViewModel>({
                state: 'ready',
                engagement,
                groups: [],
                totalCount: 0,
              })),
            ),
          ),
          catchError(() => of<ViewModel>({
            state: 'error',
            engagement: null,
            groups: [],
            totalCount: 0,
          })),
        ),
      ),
    );

    this.loadStakeholders();
  }

  private buildViewModel(engagement: Engagement, settings: EngagementSettingDef[]): ViewModel {
    const groupMap = new Map<string, SettingRow[]>();

    for (const s of settings) {
      const row: SettingRow = {
        ...s,
        editValue: s.value,
        dirty: false,
        saving: false,
      };
      const list = groupMap.get(s.group) ?? [];
      list.push(row);
      groupMap.set(s.group, list);
    }

    const groups: SettingGroup[] = [];
    for (const [name, rows] of groupMap) {
      rows.sort((a, b) => a.order - b.order);
      groups.push({ name, settings: rows });
    }
    groups.sort((a, b) => a.settings[0].order - b.settings[0].order);

    return {
      state: 'ready',
      engagement,
      groups,
      totalCount: settings.length,
    };
  }

  goBack(): void {
    this.location.back();
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  refresh(): void {
    this.refresh$.next();
    this.loadStakeholders();
  }

  // -- Settings --

  onEditValueChange(row: SettingRow): void {
    row.dirty = row.editValue !== row.value;
  }

  onToggleChange(row: SettingRow): void {
    row.dirty = row.editValue !== row.value;
    if (row.dirty) {
      this.saveSetting(row);
    }
  }

  resetSetting(row: SettingRow): void {
    row.editValue = row.default;
    row.dirty = row.editValue !== row.value;
    this.saveSetting(row);
  }

  saveSetting(row: SettingRow): void {
    row.saving = true;
    this.engagementsService.upsertSetting(this.engagementId, row.key, row.editValue).subscribe({
      next: (updated) => {
        row.value = updated.value;
        row.has_value = updated.has_value;
        row.updated_at = updated.updated_at;
        row.updated_by = updated.updated_by;
        row.dirty = false;
        row.saving = false;
        this.cdr.markForCheck();
      },
      error: () => {
        row.saving = false;
        this.notify.error(`Failed to save ${row.label}.`);
        this.cdr.markForCheck();
      },
    });
  }

  // -- Stakeholders --

  private loadStakeholders(): void {
    this.stakeholdersLoading.set(true);
    this.engagementsService.listStakeholders(this.engagementId).subscribe({
      next: list => {
        this.stakeholders.set(list);
        this.stakeholdersLoading.set(false);
      },
      error: () => this.stakeholdersLoading.set(false),
    });
  }

  openAddStakeholder(): void {
    this.showAddStakeholder.set(true);
    this.addStakeholderMemberId = '';
    this.addStakeholderRole = 'account_manager';
    this.membersService.list().subscribe({
      next: members => {
        const existing = new Set(this.stakeholders().map(s => s.member_id));
        this.availableMembers.set(
          members.filter(m => m.is_active && !existing.has(m.id))
        );
      },
      error: () => this.notify.error('Failed to load members.'),
    });
  }

  saveNewStakeholder(): void {
    if (!this.addStakeholderMemberId) {
      this.notify.error('Please select a member.');
      return;
    }
    if (!this.addStakeholderRole) {
      this.notify.error('Please select a position.');
      return;
    }
    this.addingStakeholder.set(true);
    this.engagementsService.createStakeholder(this.engagementId, {
      member_id: this.addStakeholderMemberId,
      role: this.addStakeholderRole,
    }).subscribe({
      next: sh => {
        this.stakeholders.update(list => [...list, sh]);
        this.showAddStakeholder.set(false);
        this.addingStakeholder.set(false);
      },
      error: err => {
        this.addingStakeholder.set(false);
        this.notify.error(err?.error?.detail || 'Failed to add member.');
      },
    });
  }

  updateStakeholderRole(sh: EngagementStakeholder, newRole: string): void {
    const oldRole = sh.role;
    sh.role = newRole;
    this.engagementsService.updateStakeholder(this.engagementId, sh.id, { role: newRole }).subscribe({
      next: updated => {
        sh.role = updated.role;
        this.cdr.markForCheck();
      },
      error: () => {
        sh.role = oldRole;
        this.notify.error('Failed to update position.');
        this.cdr.markForCheck();
      },
    });
  }

  removeStakeholder(sh: EngagementStakeholder): void {
    this.engagementsService.deleteStakeholder(this.engagementId, sh.id).subscribe({
      next: () => {
        this.stakeholders.update(list => list.filter(s => s.id !== sh.id));
      },
      error: () => this.notify.error('Failed to remove member.'),
    });
  }
}
