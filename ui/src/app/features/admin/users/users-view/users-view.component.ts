import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import { MembersService } from '../services/members.service';
import { EngagementAssignment, TenantMember } from '../models/member.model';
import { EngagementsService } from '../../../engagements/services/engagements.service';
import { Engagement } from '../../../engagements/models/engagement.model';
import { HasPermissionDirective } from '../../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { PermissionService } from '../../../../services/core/auth/permission.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { PasswordPolicy, PasswordPolicyService } from '../../../profile/services/password-policy.service';
import { BcDatePipe } from '../../../../components/pipes/bc-date.pipe';

type ViewState = 'init' | 'ready' | 'error' | 'missing';

interface ViewModel {
  state: ViewState;
  member: TenantMember | null;
  assignments: EngagementAssignment[];
  allEngagements: Engagement[];
}

@Component({
  selector: 'app-users-view',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, HasPermissionDirective, BcDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-view.component.html',
  styleUrl: './users-view.component.css',
})
export class UsersViewComponent implements OnInit {
  private readonly membersService = inject(MembersService);
  private readonly engagementsService = inject(EngagementsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly notify = inject(NotificationService);
  private readonly permissionService = inject(PermissionService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly policyService = inject(PasswordPolicyService);

  showHelp = false;
  isCurrentUserOwner = false;
  currentUserId: string | number | null = null;

  // Engagement assignments
  showAddEngagement = false;
  selectedEngagementId = '';
  selectedRole = 'observer';
  adding = false;
  removingId: string | null = null;

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  readonly confirmingDelete$ = new BehaviorSubject(false);
  readonly deleting$ = new BehaviorSubject(false);
  readonly resettingMfa$ = new BehaviorSubject(false);
  readonly confirmingMfaReset$ = new BehaviorSubject(false);
  readonly confirmingPromote$ = new BehaviorSubject(false);
  readonly promoting$ = new BehaviorSubject(false);
  readonly confirmingDemote$ = new BehaviorSubject(false);
  readonly demoting$ = new BehaviorSubject(false);
  promoteMfaCode = '';

  // Password reset
  showPasswordReset = false;
  resetNewPassword = '';
  resetConfirmPassword = '';
  resettingPassword = false;
  passwordPolicy: PasswordPolicy | null = null;

  private memberId = '';

  vm$ = of<ViewModel>({ state: 'init', member: null, assignments: [], allEngagements: [] });

  private static readonly ADMIN_POSITIONS = [
    'account_manager', 'project_manager', 'security_engineer', 'lead_tester',
    'qa_reviewer', 'client_poc', 'technical_lead', 'observer',
  ];
  private static readonly ANALYST_POSITIONS = [
    'security_engineer', 'lead_tester', 'qa_reviewer', 'technical_lead',
  ];
  private static readonly COLLABORATOR_POSITIONS = [
    'account_manager', 'project_manager', 'client_poc', 'observer',
  ];

  private static readonly ALL_POSITION_LABELS: Record<string, string> = {
    account_manager: 'Account Manager',
    project_manager: 'Project Manager',
    security_engineer: 'Security Engineer',
    lead_tester: 'Lead Tester',
    qa_reviewer: 'QA Reviewer',
    client_poc: 'Client Point of Contact',
    technical_lead: 'Technical Lead',
    observer: 'Observer',
  };

  getPositionOptions(member: TenantMember): { value: string; label: string }[] {
    if (member.role === 'owner') {
      return UsersViewComponent.ADMIN_POSITIONS.map(v => ({ value: v, label: UsersViewComponent.ALL_POSITION_LABELS[v] }));
    }
    const groupNames = new Set(member.groups.map(g => g.name));
    const allowed = new Set<string>();
    if (groupNames.has('Administrators')) {
      UsersViewComponent.ADMIN_POSITIONS.forEach(p => allowed.add(p));
    }
    if (groupNames.has('Analysts')) {
      UsersViewComponent.ANALYST_POSITIONS.forEach(p => allowed.add(p));
    }
    if (groupNames.has('Collaborators')) {
      UsersViewComponent.COLLABORATOR_POSITIONS.forEach(p => allowed.add(p));
    }
    // Fallback: if no default groups matched, show all
    if (allowed.size === 0) {
      UsersViewComponent.ADMIN_POSITIONS.forEach(p => allowed.add(p));
    }
    return [...allowed].map(v => ({ value: v, label: UsersViewComponent.ALL_POSITION_LABELS[v] }));
  }

  ngOnInit(): void {
    this.memberId = this.route.snapshot.paramMap.get('id') ?? '';

    this.permissionService.isRoot$.subscribe(isRoot => {
      this.isCurrentUserOwner = isRoot;
      this.cdr.markForCheck();
    });

    this.userProfileService.profile$.subscribe(profile => {
      this.currentUserId = profile?.user?.id ?? null;
      this.cdr.markForCheck();
    });

    this.vm$ = this.refresh$.pipe(
      switchMap(() =>
        forkJoin({
          member: this.membersService.getById(this.memberId),
          assignments: this.membersService.getEngagements(this.memberId).pipe(catchError(err => {
            console.warn('[users-view] failed to load assignments', err?.status);
            return of([]);
          })),
          allEngagements: this.engagementsService.list().pipe(catchError(err => {
            console.warn('[users-view] failed to load engagements', err?.status);
            return of([]);
          })),
        }).pipe(
          map(({ member, assignments, allEngagements }) => ({
            state: 'ready' as ViewState,
            member,
            assignments,
            allEngagements,
          })),
          catchError(err => {
            if (err?.status === 404) {
              return of({ state: 'missing' as ViewState, member: null, assignments: [] as EngagementAssignment[], allEngagements: [] as Engagement[] });
            }
            return of({ state: 'error' as ViewState, member: null, assignments: [] as EngagementAssignment[], allEngagements: [] as Engagement[] });
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

  prettyRole(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  confirmDelete(): void {
    this.confirmingDelete$.next(true);
  }

  cancelDelete(): void {
    this.confirmingDelete$.next(false);
  }

  deleteUser(member: TenantMember): void {
    this.deleting$.next(true);
    this.membersService.delete(member.id).subscribe({
      next: () => {
        this.deleting$.next(false);
        this.router.navigate(['/admin/users']);
      },
      error: (err) => {
        this.deleting$.next(false);
        this.confirmingDelete$.next(false);
        this.notify.error(err?.error?.detail || 'Failed to remove user.');
      },
    });
  }

  confirmMfaReset(): void {
    this.confirmingMfaReset$.next(true);
  }

  cancelMfaReset(): void {
    this.confirmingMfaReset$.next(false);
  }

  resetMfa(member: TenantMember): void {
    this.resettingMfa$.next(true);
    this.membersService.resetMfa(member.id).pipe(
      finalize(() => {
        this.resettingMfa$.next(false);
        this.confirmingMfaReset$.next(false);
      }),
    ).subscribe({
      next: () => {
        this.refresh();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to reset MFA.');
      },
    });
  }

  isSelf(member: TenantMember): boolean {
    return this.currentUserId != null && String(member.user.id) === String(this.currentUserId);
  }

  confirmPromote(): void {
    this.confirmingPromote$.next(true);
  }

  cancelPromote(): void {
    this.confirmingPromote$.next(false);
    this.promoteMfaCode = '';
  }

  promote(member: TenantMember): void {
    this.promoting$.next(true);
    this.membersService.promote(member.id, this.promoteMfaCode).pipe(
      finalize(() => {
        this.promoting$.next(false);
        this.confirmingPromote$.next(false);
        this.promoteMfaCode = '';
      }),
    ).subscribe({
      next: () => {
        this.refresh();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to promote user.');
      },
    });
  }

  confirmDemote(): void {
    this.confirmingDemote$.next(true);
  }

  cancelDemote(): void {
    this.confirmingDemote$.next(false);
  }

  demote(member: TenantMember): void {
    this.demoting$.next(true);
    this.membersService.demote(member.id).pipe(
      finalize(() => {
        this.demoting$.next(false);
        this.confirmingDemote$.next(false);
      }),
    ).subscribe({
      next: () => {
        this.refresh();
      },
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to demote user.');
      },
    });
  }

  // -- Engagement assignments --

  availableEngagements(vm: ViewModel): Engagement[] {
    const assignedIds = new Set(vm.assignments.map(a => a.engagement_id));
    return vm.allEngagements.filter(e => !assignedIds.has(e.id));
  }

  prettyStakeholderRole(role: string): string {
    return UsersViewComponent.ALL_POSITION_LABELS[role] ?? role;
  }

  addEngagement(): void {
    if (!this.selectedEngagementId) return;
    this.adding = true;
    this.membersService.addEngagement(this.memberId, this.selectedEngagementId, this.selectedRole).pipe(
      finalize(() => {
        this.adding = false;
        this.showAddEngagement = false;
        this.selectedEngagementId = '';
        this.selectedRole = 'observer';
      }),
    ).subscribe({
      next: () => this.refresh(),
      error: (err) => this.notify.error(err?.error?.detail || 'Failed to add engagement.'),
    });
  }

  removeEngagement(assignment: EngagementAssignment): void {
    this.removingId = assignment.id;
    this.membersService.removeEngagement(this.memberId, assignment.id).pipe(
      finalize(() => this.removingId = null),
    ).subscribe({
      next: () => this.refresh(),
      error: (err) => this.notify.error(err?.error?.detail || 'Failed to remove engagement.'),
    });
  }

  // -- Password reset --

  togglePasswordReset(): void {
    this.showPasswordReset = !this.showPasswordReset;
    if (this.showPasswordReset && !this.passwordPolicy) {
      this.policyService.getPolicy().subscribe({
        next: (p) => {
          this.passwordPolicy = p;
          this.cdr.markForCheck();
        },
      });
    }
    this.resetNewPassword = '';
    this.resetConfirmPassword = '';
  }

  get resetPasswordMismatch(): boolean {
    return !!this.resetNewPassword && !!this.resetConfirmPassword
      && this.resetNewPassword !== this.resetConfirmPassword;
  }

  get resetMeetsMinLength(): boolean {
    return this.resetNewPassword.length >= (this.passwordPolicy?.min_length ?? 8);
  }

  get resetHasUppercase(): boolean {
    return /[A-Z]/.test(this.resetNewPassword);
  }

  get resetHasNumber(): boolean {
    return /\d/.test(this.resetNewPassword);
  }

  get resetHasSpecial(): boolean {
    return /[!@#$%^&*()\-_=+\[\]{}|;:'",.<>?/`~]/.test(this.resetNewPassword);
  }

  get canResetPassword(): boolean {
    return !!this.resetNewPassword && !!this.resetConfirmPassword
      && !this.resetPasswordMismatch && !this.resettingPassword;
  }

  submitPasswordReset(member: TenantMember): void {
    if (!this.canResetPassword) return;
    this.resettingPassword = true;
    this.cdr.markForCheck();

    this.membersService.resetPassword(member.id, this.resetNewPassword, this.resetConfirmPassword).subscribe({
      next: () => {
        this.resettingPassword = false;
        this.notify.success(`Password reset for ${member.user.email}.`);
        this.showPasswordReset = false;
        this.resetNewPassword = '';
        this.resetConfirmPassword = '';
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.resettingPassword = false;
        this.notify.error(err?.error?.detail || 'Failed to reset password.');
        this.cdr.markForCheck();
      },
    });
  }

}
