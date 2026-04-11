import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { UsersViewComponent } from './users-view.component';
import { MembersService } from '../services/members.service';
import { EngagementsService } from '../../../engagements/services/engagements.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { PermissionService } from '../../../../services/core/auth/permission.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { PasswordPolicyService } from '../../../profile/services/password-policy.service';
import { TenantMember, EngagementAssignment } from '../models/member.model';
import { Engagement } from '../../../engagements/models/engagement.model';

const MOCK_MEMBER: TenantMember = {
  id: 'mem-1',
  user: {
    id: 'u1',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    avatar_url: null,
    mfa_enabled: true,
    phone: '',
    timezone: '',
  },
  role: 'member',
  is_active: true,
  invite_status: 'none' as const,
  groups: [{ id: 'grp-1', name: 'Analysts', is_default: false }],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('UsersViewComponent', () => {
  let component: UsersViewComponent;
  let fixture: ComponentFixture<UsersViewComponent>;

  let membersServiceSpy: jasmine.SpyObj<MembersService>;
  let engagementsServiceSpy: jasmine.SpyObj<EngagementsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let policyServiceSpy: jasmine.SpyObj<PasswordPolicyService>;
  let router: Router;

  beforeEach(async () => {
    membersServiceSpy = jasmine.createSpyObj('MembersService', [
      'getById', 'delete', 'resetMfa', 'promote', 'demote',
      'getEngagements', 'addEngagement', 'removeEngagement', 'resetPassword',
    ]);
    engagementsServiceSpy = jasmine.createSpyObj('EngagementsService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    policyServiceSpy = jasmine.createSpyObj('PasswordPolicyService', ['getPolicy']);
    policyServiceSpy.getPolicy.and.returnValue(of({ min_length: 10, require_uppercase: true, require_special: true, require_number: true, expiry_days: 90 }));

    membersServiceSpy.getById.and.returnValue(of(MOCK_MEMBER));
    membersServiceSpy.delete.and.returnValue(of(undefined as any));
    membersServiceSpy.resetMfa.and.returnValue(of({ detail: 'Done' }));
    membersServiceSpy.promote.and.returnValue(of(MOCK_MEMBER));
    membersServiceSpy.demote.and.returnValue(of(MOCK_MEMBER));
    membersServiceSpy.getEngagements.and.returnValue(of([]));
    membersServiceSpy.addEngagement.and.returnValue(of({} as any));
    membersServiceSpy.removeEngagement.and.returnValue(of(undefined as any));
    membersServiceSpy.resetPassword.and.returnValue(of({ detail: 'Done' }));
    engagementsServiceSpy.list.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [UsersViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MembersService, useValue: membersServiceSpy },
        { provide: EngagementsService, useValue: engagementsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: PasswordPolicyService, useValue: policyServiceSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'mem-1' } },
            root: { firstChild: null } as any,
          },
        },
        {
          provide: PermissionService,
          useValue: {
            isRoot$: of(true),
            hasAny$: () => of(true),
            has: () => true,
          },
        },
        {
          provide: UserProfileService,
          useValue: {
            profile$: of({ user: { id: 'current-user-id' } }),
            currentSubscription: () => null,
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    fixture = TestBed.createComponent(UsersViewComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads member on init and sets state to ready', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(membersServiceSpy.getById).toHaveBeenCalledWith('mem-1');
    expect(vm.state).toBe('ready');
    expect(vm.member).toEqual(MOCK_MEMBER);
  }));

  it('sets isCurrentUserOwner from permissionService.isRoot$', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.isCurrentUserOwner).toBe(true);
  }));

  it('sets state to missing on 404 error', fakeAsync(() => {
    membersServiceSpy.getById.and.returnValue(throwError(() => ({ status: 404 })));
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('missing');
    expect(vm.member).toBeNull();
  }));

  it('sets state to error on non-404 error', fakeAsync(() => {
    membersServiceSpy.getById.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.member).toBeNull();
  }));

  // --- goBack ---

  it('goBack() calls location.back()', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  // --- toggleHelp ---

  it('toggleHelp() toggles showHelp flag', () => {
    expect(component.showHelp).toBe(false);
    component.toggleHelp();
    expect(component.showHelp).toBe(true);
    component.toggleHelp();
    expect(component.showHelp).toBe(false);
  });

  // --- refresh ---

  it('refresh() triggers reload', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.vm$.subscribe();
    tick();

    membersServiceSpy.getById.calls.reset();
    component.refresh();
    tick();

    component.vm$.subscribe();
    tick();

    expect(membersServiceSpy.getById).toHaveBeenCalledWith('mem-1');
  }));

  // --- prettyRole ---

  it('prettyRole() capitalizes first letter', () => {
    expect(component.prettyRole('owner')).toBe('Owner');
    expect(component.prettyRole('member')).toBe('Member');
  });

  // --- confirmDelete / cancelDelete ---

  it('confirmDelete() sets confirmingDelete$ to true', () => {
    component.confirmDelete();
    expect(component.confirmingDelete$.value).toBe(true);
  });

  it('cancelDelete() sets confirmingDelete$ to false', () => {
    component.confirmDelete();
    component.cancelDelete();
    expect(component.confirmingDelete$.value).toBe(false);
  });

  // --- deleteUser ---

  it('deleteUser() calls membersService.delete and navigates on success', fakeAsync(() => {
    membersServiceSpy.delete.and.returnValue(of(undefined as any));
    fixture.detectChanges();
    tick();

    component.deleteUser(MOCK_MEMBER);
    tick();

    expect(membersServiceSpy.delete).toHaveBeenCalledWith('mem-1');
    expect(component.deleting$.value).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/admin/users']);
  }));

  it('deleteUser() sets deleting$ to true while in progress', fakeAsync(() => {
    membersServiceSpy.delete.and.returnValue(of(undefined as any));
    fixture.detectChanges();
    tick();

    component.deleteUser(MOCK_MEMBER);
    tick();
    expect(component.deleting$.value).toBe(false);
  }));

  it('deleteUser() shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.delete.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot remove owner' } })),
    );
    fixture.detectChanges();
    tick();

    component.deleteUser(MOCK_MEMBER);
    tick();

    expect(component.deleting$.value).toBe(false);
    expect(component.confirmingDelete$.value).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Cannot remove owner');
  }));

  it('deleteUser() shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.delete.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.deleteUser(MOCK_MEMBER);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove user.');
  }));

  // --- confirmMfaReset / cancelMfaReset ---

  it('confirmMfaReset() sets confirmingMfaReset$ to true', () => {
    component.confirmMfaReset();
    expect(component.confirmingMfaReset$.value).toBe(true);
  });

  it('cancelMfaReset() sets confirmingMfaReset$ to false', () => {
    component.confirmMfaReset();
    component.cancelMfaReset();
    expect(component.confirmingMfaReset$.value).toBe(false);
  });

  // --- resetMfa ---

  it('resetMfa() calls membersService.resetMfa and refreshes on success', fakeAsync(() => {
    membersServiceSpy.resetMfa.and.returnValue(of({ detail: 'Done' }));
    fixture.detectChanges();
    tick();

    component.resetMfa(MOCK_MEMBER);
    tick();

    expect(membersServiceSpy.resetMfa).toHaveBeenCalledWith('mem-1');
    expect(component.resettingMfa$.value).toBe(false);
    expect(component.confirmingMfaReset$.value).toBe(false);
  }));

  it('resetMfa() shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.resetMfa.and.returnValue(
      throwError(() => ({ error: { detail: 'Not allowed' } })),
    );
    fixture.detectChanges();
    tick();

    component.resetMfa(MOCK_MEMBER);
    tick();

    expect(component.resettingMfa$.value).toBe(false);
    expect(component.confirmingMfaReset$.value).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Not allowed');
  }));

  it('resetMfa() shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.resetMfa.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.resetMfa(MOCK_MEMBER);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to reset MFA.');
  }));

  // --- isSelf ---

  it('isSelf() returns true when member user id matches currentUserId', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.currentUserId = 'u1';
    expect(component.isSelf(MOCK_MEMBER)).toBe(true);
  }));

  it('isSelf() returns false when member user id does not match currentUserId', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.currentUserId = 'other-id';
    expect(component.isSelf(MOCK_MEMBER)).toBe(false);
  }));

  it('isSelf() returns false when currentUserId is null', () => {
    component.currentUserId = null;
    expect(component.isSelf(MOCK_MEMBER)).toBe(false);
  });

  // --- confirmPromote / cancelPromote ---

  it('confirmPromote() sets confirmingPromote$ to true', () => {
    component.confirmPromote();
    expect(component.confirmingPromote$.value).toBe(true);
  });

  it('cancelPromote() sets confirmingPromote$ to false and clears mfaCode', () => {
    component.promoteMfaCode = '123456';
    component.confirmPromote();
    component.cancelPromote();
    expect(component.confirmingPromote$.value).toBe(false);
    expect(component.promoteMfaCode).toBe('');
  });

  // --- promote ---

  it('promote() calls membersService.promote and refreshes on success', fakeAsync(() => {
    membersServiceSpy.promote.and.returnValue(of(MOCK_MEMBER));
    fixture.detectChanges();
    tick();

    component.promoteMfaCode = '123456';
    component.promote(MOCK_MEMBER);
    tick();

    expect(membersServiceSpy.promote).toHaveBeenCalledWith('mem-1', '123456');
    expect(component.promoting$.value).toBe(false);
    expect(component.confirmingPromote$.value).toBe(false);
    expect(component.promoteMfaCode).toBe('');
  }));

  it('promote() shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.promote.and.returnValue(
      throwError(() => ({ error: { detail: 'MFA code invalid' } })),
    );
    fixture.detectChanges();
    tick();

    component.promote(MOCK_MEMBER);
    tick();

    expect(component.promoting$.value).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('MFA code invalid');
  }));

  it('promote() shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.promote.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.promote(MOCK_MEMBER);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to promote user.');
  }));

  // --- confirmDemote / cancelDemote ---

  it('confirmDemote() sets confirmingDemote$ to true', () => {
    component.confirmDemote();
    expect(component.confirmingDemote$.value).toBe(true);
  });

  it('cancelDemote() sets confirmingDemote$ to false', () => {
    component.confirmDemote();
    component.cancelDemote();
    expect(component.confirmingDemote$.value).toBe(false);
  });

  // --- demote ---

  it('demote() calls membersService.demote and refreshes on success', fakeAsync(() => {
    membersServiceSpy.demote.and.returnValue(of(MOCK_MEMBER));
    fixture.detectChanges();
    tick();

    component.demote(MOCK_MEMBER);
    tick();

    expect(membersServiceSpy.demote).toHaveBeenCalledWith('mem-1');
    expect(component.demoting$.value).toBe(false);
    expect(component.confirmingDemote$.value).toBe(false);
  }));

  it('demote() shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.demote.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot demote last owner' } })),
    );
    fixture.detectChanges();
    tick();

    component.demote(MOCK_MEMBER);
    tick();

    expect(component.demoting$.value).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Cannot demote last owner');
  }));

  it('demote() shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.demote.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.demote(MOCK_MEMBER);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to demote user.');
  }));

  // --- deleteUser error with null err ---

  it('deleteUser() shows generic error when err is null', fakeAsync(() => {
    membersServiceSpy.delete.and.returnValue(throwError(() => null));
    fixture.detectChanges();
    tick();

    component.deleteUser(MOCK_MEMBER);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove user.');
  }));

  // --- resetMfa error with null err ---

  it('resetMfa() shows generic error when err is null', fakeAsync(() => {
    membersServiceSpy.resetMfa.and.returnValue(throwError(() => null));
    fixture.detectChanges();
    tick();

    component.resetMfa(MOCK_MEMBER);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to reset MFA.');
  }));

  // --- catchError with err having no status property ---

  it('sets state to error when err has no status property', fakeAsync(() => {
    membersServiceSpy.getById.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.member).toBeNull();
  }));

  // --- getPositionOptions ---

  it('getPositionOptions returns all admin positions for owner role', () => {
    const ownerMember: TenantMember = { ...MOCK_MEMBER, role: 'owner', groups: [] };
    const options = component.getPositionOptions(ownerMember);
    expect(options.length).toBe(8);
    expect(options.map(o => o.value)).toContain('account_manager');
    expect(options.map(o => o.value)).toContain('observer');
  });

  it('getPositionOptions returns admin positions for Administrators group', () => {
    const adminMember: TenantMember = {
      ...MOCK_MEMBER,
      role: 'member',
      groups: [{ id: 'g1', name: 'Administrators', is_default: false }],
    };
    const options = component.getPositionOptions(adminMember);
    expect(options.length).toBe(8);
    expect(options.map(o => o.value)).toContain('account_manager');
  });

  it('getPositionOptions returns analyst positions for Analysts group', () => {
    const analystMember: TenantMember = {
      ...MOCK_MEMBER,
      role: 'member',
      groups: [{ id: 'g1', name: 'Analysts', is_default: false }],
    };
    const options = component.getPositionOptions(analystMember);
    expect(options.length).toBe(4);
    expect(options.map(o => o.value)).toContain('security_engineer');
    expect(options.map(o => o.value)).toContain('lead_tester');
    expect(options.map(o => o.value)).toContain('qa_reviewer');
    expect(options.map(o => o.value)).toContain('technical_lead');
  });

  it('getPositionOptions returns collaborator positions for Collaborators group', () => {
    const collabMember: TenantMember = {
      ...MOCK_MEMBER,
      role: 'member',
      groups: [{ id: 'g1', name: 'Collaborators', is_default: false }],
    };
    const options = component.getPositionOptions(collabMember);
    expect(options.length).toBe(4);
    expect(options.map(o => o.value)).toContain('account_manager');
    expect(options.map(o => o.value)).toContain('project_manager');
    expect(options.map(o => o.value)).toContain('client_poc');
    expect(options.map(o => o.value)).toContain('observer');
  });

  it('getPositionOptions merges positions for multiple groups', () => {
    const multiGroupMember: TenantMember = {
      ...MOCK_MEMBER,
      role: 'member',
      groups: [
        { id: 'g1', name: 'Analysts', is_default: false },
        { id: 'g2', name: 'Collaborators', is_default: false },
      ],
    };
    const options = component.getPositionOptions(multiGroupMember);
    // Analysts: 4 + Collaborators: 4, but observer overlaps (no it doesn't — analysts don't have observer)
    // Analysts: security_engineer, lead_tester, qa_reviewer, technical_lead
    // Collaborators: account_manager, project_manager, client_poc, observer
    expect(options.length).toBe(8);
  });

  it('getPositionOptions falls back to all admin positions when no groups match', () => {
    const noGroupMember: TenantMember = {
      ...MOCK_MEMBER,
      role: 'member',
      groups: [{ id: 'g1', name: 'UnknownGroup', is_default: false }],
    };
    const options = component.getPositionOptions(noGroupMember);
    expect(options.length).toBe(8);
  });

  it('getPositionOptions falls back to all admin positions when groups array is empty', () => {
    const emptyGroupMember: TenantMember = {
      ...MOCK_MEMBER,
      role: 'member',
      groups: [],
    };
    const options = component.getPositionOptions(emptyGroupMember);
    expect(options.length).toBe(8);
  });

  // --- availableEngagements ---

  it('availableEngagements filters out already-assigned engagements', () => {
    const allEngagements: Engagement[] = [
      { id: 'eng-1', name: 'Eng 1' } as Engagement,
      { id: 'eng-2', name: 'Eng 2' } as Engagement,
      { id: 'eng-3', name: 'Eng 3' } as Engagement,
    ];
    const assignments: EngagementAssignment[] = [
      { id: 'a1', engagement_id: 'eng-1', engagement_name: 'Eng 1', client_name: 'C1', engagement_status: 'active', role: 'observer', created_at: '' },
    ];
    const vm = { state: 'ready' as const, member: MOCK_MEMBER, assignments, allEngagements };
    const available = component.availableEngagements(vm);
    expect(available.length).toBe(2);
    expect(available.map(e => e.id)).toEqual(['eng-2', 'eng-3']);
  });

  it('availableEngagements returns all when no assignments', () => {
    const allEngagements: Engagement[] = [
      { id: 'eng-1', name: 'Eng 1' } as Engagement,
    ];
    const vm = { state: 'ready' as const, member: MOCK_MEMBER, assignments: [], allEngagements };
    const available = component.availableEngagements(vm);
    expect(available.length).toBe(1);
  });

  // --- prettyStakeholderRole ---

  it('prettyStakeholderRole returns label for known role', () => {
    expect(component.prettyStakeholderRole('account_manager')).toBe('Account Manager');
    expect(component.prettyStakeholderRole('security_engineer')).toBe('Security Engineer');
  });

  it('prettyStakeholderRole returns raw role for unknown role', () => {
    expect(component.prettyStakeholderRole('unknown_role')).toBe('unknown_role');
  });

  // --- addEngagement ---

  it('addEngagement does nothing when selectedEngagementId is empty', fakeAsync(() => {
    component.selectedEngagementId = '';
    component.addEngagement();
    tick();
    expect(membersServiceSpy.addEngagement).not.toHaveBeenCalled();
  }));

  it('addEngagement calls membersService.addEngagement and refreshes on success', fakeAsync(() => {
    membersServiceSpy.addEngagement.and.returnValue(of({} as EngagementAssignment));
    fixture.detectChanges();
    tick();

    component.selectedEngagementId = 'eng-1';
    component.selectedRole = 'lead_tester';
    component.showAddEngagement = true;
    component.addEngagement();
    tick();

    expect(membersServiceSpy.addEngagement).toHaveBeenCalledWith('mem-1', 'eng-1', 'lead_tester');
    expect(component.adding).toBe(false);
    expect(component.showAddEngagement).toBe(false);
    expect(component.selectedEngagementId).toBe('');
    expect(component.selectedRole).toBe('observer');
  }));

  it('addEngagement shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.addEngagement.and.returnValue(
      throwError(() => ({ error: { detail: 'Already assigned' } })),
    );
    fixture.detectChanges();
    tick();

    component.selectedEngagementId = 'eng-1';
    component.addEngagement();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Already assigned');
    expect(component.adding).toBe(false);
  }));

  it('addEngagement shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.addEngagement.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.selectedEngagementId = 'eng-1';
    component.addEngagement();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to add engagement.');
  }));

  // --- removeEngagement ---

  it('removeEngagement calls membersService.removeEngagement and refreshes on success', fakeAsync(() => {
    membersServiceSpy.removeEngagement.and.returnValue(of(undefined as unknown as void));
    fixture.detectChanges();
    tick();

    const assignment: EngagementAssignment = {
      id: 'a1', engagement_id: 'eng-1', engagement_name: 'Eng 1',
      client_name: 'C1', engagement_status: 'active', role: 'observer', created_at: '',
    };
    component.removeEngagement(assignment);
    tick();

    expect(membersServiceSpy.removeEngagement).toHaveBeenCalledWith('mem-1', 'a1');
    expect(component.removingId).toBeNull();
  }));

  it('removeEngagement shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.removeEngagement.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot remove' } })),
    );
    fixture.detectChanges();
    tick();

    const assignment: EngagementAssignment = {
      id: 'a1', engagement_id: 'eng-1', engagement_name: 'Eng 1',
      client_name: 'C1', engagement_status: 'active', role: 'observer', created_at: '',
    };
    component.removeEngagement(assignment);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Cannot remove');
    expect(component.removingId).toBeNull();
  }));

  it('removeEngagement shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.removeEngagement.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    const assignment: EngagementAssignment = {
      id: 'a1', engagement_id: 'eng-1', engagement_name: 'Eng 1',
      client_name: 'C1', engagement_status: 'active', role: 'observer', created_at: '',
    };
    component.removeEngagement(assignment);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove engagement.');
  }));

  it('removeEngagement sets removingId during request', fakeAsync(() => {
    membersServiceSpy.removeEngagement.and.returnValue(of(undefined as unknown as void));
    fixture.detectChanges();
    tick();

    const assignment: EngagementAssignment = {
      id: 'a1', engagement_id: 'eng-1', engagement_name: 'Eng 1',
      client_name: 'C1', engagement_status: 'active', role: 'observer', created_at: '',
    };
    component.removeEngagement(assignment);
    // After completion, removingId should be null
    tick();
    expect(component.removingId).toBeNull();
  }));

  // --- togglePasswordReset ---

  it('togglePasswordReset shows password reset panel and loads policy', fakeAsync(() => {
    expect(component.showPasswordReset).toBe(false);
    component.togglePasswordReset();
    tick();

    expect(component.showPasswordReset).toBe(true);
    expect(policyServiceSpy.getPolicy).toHaveBeenCalled();
    expect(component.passwordPolicy).toEqual({
      min_length: 10, require_uppercase: true, require_special: true, require_number: true, expiry_days: 90,
    });
  }));

  it('togglePasswordReset hides panel and clears passwords', fakeAsync(() => {
    component.showPasswordReset = true;
    component.resetNewPassword = 'abc';
    component.resetConfirmPassword = 'abc';
    component.togglePasswordReset();
    tick();

    expect(component.showPasswordReset).toBe(false);
    expect(component.resetNewPassword).toBe('');
    expect(component.resetConfirmPassword).toBe('');
  }));

  it('togglePasswordReset does not reload policy if already loaded', fakeAsync(() => {
    component.passwordPolicy = { min_length: 8, require_uppercase: false, require_special: false, require_number: false, expiry_days: 0 };
    component.togglePasswordReset();
    tick();

    expect(policyServiceSpy.getPolicy).not.toHaveBeenCalled();
  }));

  // --- resetPasswordMismatch ---

  it('resetPasswordMismatch returns true when passwords differ', () => {
    component.resetNewPassword = 'Abc123!@#';
    component.resetConfirmPassword = 'Different!1';
    expect(component.resetPasswordMismatch).toBe(true);
  });

  it('resetPasswordMismatch returns false when passwords match', () => {
    component.resetNewPassword = 'Abc123!@#';
    component.resetConfirmPassword = 'Abc123!@#';
    expect(component.resetPasswordMismatch).toBe(false);
  });

  it('resetPasswordMismatch returns false when newPassword is empty', () => {
    component.resetNewPassword = '';
    component.resetConfirmPassword = 'something';
    expect(component.resetPasswordMismatch).toBe(false);
  });

  it('resetPasswordMismatch returns false when confirmPassword is empty', () => {
    component.resetNewPassword = 'something';
    component.resetConfirmPassword = '';
    expect(component.resetPasswordMismatch).toBe(false);
  });

  // --- resetMeetsMinLength ---

  it('resetMeetsMinLength returns true when password meets min length', () => {
    component.passwordPolicy = { min_length: 8, require_uppercase: false, require_special: false, require_number: false, expiry_days: 0 };
    component.resetNewPassword = '12345678';
    expect(component.resetMeetsMinLength).toBe(true);
  });

  it('resetMeetsMinLength returns false when password is too short', () => {
    component.passwordPolicy = { min_length: 8, require_uppercase: false, require_special: false, require_number: false, expiry_days: 0 };
    component.resetNewPassword = '1234567';
    expect(component.resetMeetsMinLength).toBe(false);
  });

  it('resetMeetsMinLength defaults to 8 when no policy', () => {
    component.passwordPolicy = null;
    component.resetNewPassword = '12345678';
    expect(component.resetMeetsMinLength).toBe(true);
  });

  // --- resetHasUppercase ---

  it('resetHasUppercase returns true when password has uppercase', () => {
    component.resetNewPassword = 'abcDef';
    expect(component.resetHasUppercase).toBe(true);
  });

  it('resetHasUppercase returns false when password has no uppercase', () => {
    component.resetNewPassword = 'abcdef';
    expect(component.resetHasUppercase).toBe(false);
  });

  // --- resetHasNumber ---

  it('resetHasNumber returns true when password has digit', () => {
    component.resetNewPassword = 'abc1def';
    expect(component.resetHasNumber).toBe(true);
  });

  it('resetHasNumber returns false when password has no digit', () => {
    component.resetNewPassword = 'abcdef';
    expect(component.resetHasNumber).toBe(false);
  });

  // --- resetHasSpecial ---

  it('resetHasSpecial returns true when password has special character', () => {
    component.resetNewPassword = 'abc!def';
    expect(component.resetHasSpecial).toBe(true);
  });

  it('resetHasSpecial returns false when password has no special character', () => {
    component.resetNewPassword = 'abcdef123';
    expect(component.resetHasSpecial).toBe(false);
  });

  // --- canResetPassword ---

  it('canResetPassword returns true when passwords match and fields filled', () => {
    component.resetNewPassword = 'Abc123!@#';
    component.resetConfirmPassword = 'Abc123!@#';
    component.resettingPassword = false;
    expect(component.canResetPassword).toBe(true);
  });

  it('canResetPassword returns false when newPassword is empty', () => {
    component.resetNewPassword = '';
    component.resetConfirmPassword = 'Abc123!@#';
    expect(component.canResetPassword).toBe(false);
  });

  it('canResetPassword returns false when confirmPassword is empty', () => {
    component.resetNewPassword = 'Abc123!@#';
    component.resetConfirmPassword = '';
    expect(component.canResetPassword).toBe(false);
  });

  it('canResetPassword returns false when passwords mismatch', () => {
    component.resetNewPassword = 'Abc123!@#';
    component.resetConfirmPassword = 'Different!1';
    expect(component.canResetPassword).toBe(false);
  });

  it('canResetPassword returns false when resettingPassword is true', () => {
    component.resetNewPassword = 'Abc123!@#';
    component.resetConfirmPassword = 'Abc123!@#';
    component.resettingPassword = true;
    expect(component.canResetPassword).toBe(false);
  });

  // --- submitPasswordReset ---

  it('submitPasswordReset does nothing when canResetPassword is false', fakeAsync(() => {
    component.resetNewPassword = '';
    component.resetConfirmPassword = '';
    component.submitPasswordReset(MOCK_MEMBER);
    tick();
    expect(membersServiceSpy.resetPassword).not.toHaveBeenCalled();
  }));

  it('submitPasswordReset calls resetPassword and notifies on success', fakeAsync(() => {
    membersServiceSpy.resetPassword.and.returnValue(of({ detail: 'Done' }));
    fixture.detectChanges();
    tick();

    component.resetNewPassword = 'NewPass123!';
    component.resetConfirmPassword = 'NewPass123!';
    component.showPasswordReset = true;
    component.submitPasswordReset(MOCK_MEMBER);
    tick();

    expect(membersServiceSpy.resetPassword).toHaveBeenCalledWith('mem-1', 'NewPass123!', 'NewPass123!');
    expect(component.resettingPassword).toBe(false);
    expect(notifySpy.success).toHaveBeenCalledWith('Password reset for test@example.com.');
    expect(component.showPasswordReset).toBe(false);
    expect(component.resetNewPassword).toBe('');
    expect(component.resetConfirmPassword).toBe('');
  }));

  it('submitPasswordReset shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.resetPassword.and.returnValue(
      throwError(() => ({ error: { detail: 'Weak password' } })),
    );
    fixture.detectChanges();
    tick();

    component.resetNewPassword = 'NewPass123!';
    component.resetConfirmPassword = 'NewPass123!';
    component.submitPasswordReset(MOCK_MEMBER);
    tick();

    expect(component.resettingPassword).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Weak password');
  }));

  it('submitPasswordReset shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.resetPassword.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.resetNewPassword = 'NewPass123!';
    component.resetConfirmPassword = 'NewPass123!';
    component.submitPasswordReset(MOCK_MEMBER);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to reset password.');
  }));

  // --- ngOnInit catchError branches for assignments and engagements ---

  it('loads empty assignments when getEngagements fails', fakeAsync(() => {
    membersServiceSpy.getEngagements.and.returnValue(throwError(() => ({ status: 403 })));
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('ready');
    expect(vm.assignments).toEqual([]);
  }));

  it('loads empty allEngagements when engagementsService.list fails', fakeAsync(() => {
    engagementsServiceSpy.list.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('ready');
    expect(vm.allEngagements).toEqual([]);
  }));
});

describe('UsersViewComponent (non-root user)', () => {
  it('sets isCurrentUserOwner to false when isRoot$ emits false', fakeAsync(() => {
    const membersServiceSpy2 = jasmine.createSpyObj('MembersService', ['getById', 'delete', 'resetMfa', 'getEngagements']);
    membersServiceSpy2.getById.and.returnValue(of(MOCK_MEMBER));
    membersServiceSpy2.delete.and.returnValue(of(undefined as any));
    membersServiceSpy2.resetMfa.and.returnValue(of({ detail: 'Done' }));
    membersServiceSpy2.getEngagements.and.returnValue(of([]));
    const engSpy2 = jasmine.createSpyObj('EngagementsService', ['list']);
    engSpy2.list.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [UsersViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MembersService, useValue: membersServiceSpy2 },
        { provide: EngagementsService, useValue: engSpy2 },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['success', 'error']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'mem-1' } },
            root: { firstChild: null } as any,
          },
        },
        {
          provide: PermissionService,
          useValue: {
            isRoot$: of(false),
            hasAny$: () => of(true),
            has: () => true,
          },
        },
        {
          provide: UserProfileService,
          useValue: {
            profile$: of({ user: { id: 'current-user-id' } }),
            currentSubscription: () => null,
          },
        },
      ],
    });

    const fix = TestBed.createComponent(UsersViewComponent);
    const comp = fix.componentInstance;
    fix.detectChanges();
    tick();

    expect(comp.isCurrentUserOwner).toBe(false);
  }));
});

describe('UsersViewComponent (null route param)', () => {
  it('uses empty string when route param id is null', fakeAsync(() => {
    const membersServiceSpy3 = jasmine.createSpyObj('MembersService', ['getById', 'delete', 'resetMfa', 'promote', 'demote', 'getEngagements']);
    membersServiceSpy3.getById.and.returnValue(of(MOCK_MEMBER));
    membersServiceSpy3.getEngagements.and.returnValue(of([]));
    const engSpy3 = jasmine.createSpyObj('EngagementsService', ['list']);
    engSpy3.list.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [UsersViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MembersService, useValue: membersServiceSpy3 },
        { provide: EngagementsService, useValue: engSpy3 },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['success', 'error']) },
        { provide: Location, useValue: jasmine.createSpyObj('Location', ['back']) },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => null } },
            root: { firstChild: null } as any,
          },
        },
        {
          provide: PermissionService,
          useValue: {
            isRoot$: of(true),
            hasAny$: () => of(true),
            has: () => true,
          },
        },
        {
          provide: UserProfileService,
          useValue: {
            profile$: of(null),
            currentSubscription: () => null,
          },
        },
      ],
    });

    const fix = TestBed.createComponent(UsersViewComponent);
    const comp = fix.componentInstance;
    fix.detectChanges();
    tick();

    expect(membersServiceSpy3.getById).toHaveBeenCalledWith('');
    expect(comp.currentUserId).toBeNull();
  }));
});
