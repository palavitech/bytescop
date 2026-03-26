import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { GroupsEditComponent } from './groups-edit.component';
import { GroupsService } from '../services/groups.service';
import { PermissionsApiService } from '../services/permissions-api.service';
import { MembersService } from '../../users/services/members.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { PermissionService } from '../../../../services/core/auth/permission.service';
import { TenantGroupDetail, PermissionItem } from '../models/group.model';
import { TenantMember } from '../../users/models/member.model';

const MOCK_GROUP: TenantGroupDetail = {
  id: 'grp-1',
  name: 'Test Group',
  description: 'A test group',
  is_default: false,
  permissions: [{ id: 'p1', codename: 'view_engagement', name: 'View Engagement', category: 'engagements', resource: 'engagement' }],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_DEFAULT_GROUP: TenantGroupDetail = {
  ...MOCK_GROUP,
  id: 'grp-default',
  name: 'Default Group',
  is_default: true,
};

const MOCK_PERMISSIONS: PermissionItem[] = [
  { id: 'p1', codename: 'view_engagement', name: 'View Engagement', category: 'engagements', resource: 'engagement' },
  { id: 'p2', codename: 'edit_engagement', name: 'Edit Engagement', category: 'engagements', resource: 'engagement' },
];

const makeMember = (id: string, email: string, groups: { id: string; name: string; is_default: boolean }[], isActive = true): TenantMember => ({
  id,
  user: {
    id: `u-${id}`,
    email,
    first_name: email.split('@')[0],
    last_name: 'User',
    avatar_url: null,
    mfa_enabled: false,
    phone: '',
    timezone: '',
  },
  role: 'member',
  is_active: isActive,
  invite_status: 'none' as const,
  groups,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
});

const MEMBER_IN_GROUP = makeMember('mem-1', 'member@example.com', [{ id: 'grp-1', name: 'Test Group', is_default: false }]);
const MEMBER_NOT_IN_GROUP = makeMember('mem-2', 'other@example.com', []);
const INACTIVE_MEMBER = makeMember('mem-3', 'inactive@example.com', [], false);

describe('GroupsEditComponent', () => {
  let component: GroupsEditComponent;
  let fixture: ComponentFixture<GroupsEditComponent>;

  let groupsServiceSpy: jasmine.SpyObj<GroupsService>;
  let permissionsApiSpy: jasmine.SpyObj<PermissionsApiService>;
  let membersServiceSpy: jasmine.SpyObj<MembersService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    groupsServiceSpy = jasmine.createSpyObj('GroupsService', ['getById', 'update', 'addMember', 'removeMember']);
    permissionsApiSpy = jasmine.createSpyObj('PermissionsApiService', ['list']);
    membersServiceSpy = jasmine.createSpyObj('MembersService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    groupsServiceSpy.getById.and.returnValue(of(MOCK_GROUP));
    permissionsApiSpy.list.and.returnValue(of(MOCK_PERMISSIONS));
    membersServiceSpy.list.and.returnValue(of([MEMBER_IN_GROUP, MEMBER_NOT_IN_GROUP, INACTIVE_MEMBER]));

    await TestBed.configureTestingModule({
      imports: [GroupsEditComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GroupsService, useValue: groupsServiceSpy },
        { provide: PermissionsApiService, useValue: permissionsApiSpy },
        { provide: MembersService, useValue: membersServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'grp-1' } },
            root: { firstChild: null } as any,
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupsEditComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads group, permissions, and members on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(groupsServiceSpy.getById).toHaveBeenCalledWith('grp-1');
    expect(permissionsApiSpy.list).toHaveBeenCalled();
    expect(membersServiceSpy.list).toHaveBeenCalled();
    expect(component.group$.value).toEqual(MOCK_GROUP);
    expect(component.allPermissions$.value).toEqual(MOCK_PERMISSIONS);
    expect(component.loading$.value).toBe(false);
  }));

  it('filters members who belong to this group', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    const members = component.members$.value;
    expect(members.length).toBe(1);
    expect(members[0].id).toBe('mem-1');
  }));

  it('stores all tenant members', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.allTenantMembers$.value.length).toBe(3);
  }));

  it('shows error when forkJoin fails', fakeAsync(() => {
    groupsServiceSpy.getById.and.returnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to load group details.');
    expect(component.loading$.value).toBe(false);
  }));

  // --- isDefault ---

  it('isDefault returns false for non-default group', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.isDefault).toBe(false);
  }));

  it('isDefault returns true for default group', fakeAsync(() => {
    groupsServiceSpy.getById.and.returnValue(of(MOCK_DEFAULT_GROUP));
    fixture.detectChanges();
    tick();

    expect(component.isDefault).toBe(true);
  }));

  // --- availableMembers ---

  it('availableMembers excludes current group members and inactive members', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    const available = component.availableMembers;
    // mem-1 is in group, mem-3 is inactive
    expect(available.length).toBe(1);
    expect(available[0].id).toBe('mem-2');
  }));

  it('availableMembers returns empty when all members are in group', fakeAsync(() => {
    membersServiceSpy.list.and.returnValue(of([MEMBER_IN_GROUP]));
    fixture.detectChanges();
    tick();

    const available = component.availableMembers;
    expect(available.length).toBe(0);
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

  // --- onSubmit ---

  it('onSubmit() calls groupsService.update and navigates on success', fakeAsync(() => {
    const updatedGroup = { ...MOCK_GROUP, name: 'Updated Group' };
    groupsServiceSpy.update.and.returnValue(of(updatedGroup));
    fixture.detectChanges();
    tick();

    component.onSubmit({
      name: 'Updated Group',
      description: 'Updated desc',
      permission_ids: ['p1', 'p2'],
    });
    tick();

    expect(groupsServiceSpy.update).toHaveBeenCalledWith('grp-1', {
      name: 'Updated Group',
      description: 'Updated desc',
      permission_ids: ['p1', 'p2'],
    });
    expect(component.saving$.value).toBe(false);
    expect(component.group$.value).toEqual(updatedGroup);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/groups', 'grp-1']);
  }));

  it('onSubmit() shows error on failure with name field', fakeAsync(() => {
    groupsServiceSpy.update.and.returnValue(
      throwError(() => ({ error: { name: ['Name already exists'] } })),
    );
    fixture.detectChanges();
    tick();

    component.onSubmit({ name: 'Duplicate', description: '', permission_ids: [] });
    tick();

    expect(component.saving$.value).toBe(false);
    expect(component.serverError$.value).toBe('Name already exists');
    expect(notifySpy.error).toHaveBeenCalledWith('Name already exists');
  }));

  it('onSubmit() shows error with detail fallback', fakeAsync(() => {
    groupsServiceSpy.update.and.returnValue(
      throwError(() => ({ error: { detail: 'Not authorized' } })),
    );
    fixture.detectChanges();
    tick();

    component.onSubmit({ name: 'X', description: '', permission_ids: [] });
    tick();

    expect(component.serverError$.value).toBe('Not authorized');
  }));

  it('onSubmit() shows generic error when no specific field', fakeAsync(() => {
    groupsServiceSpy.update.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.onSubmit({ name: 'X', description: '', permission_ids: [] });
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to update group.');
  }));

  it('onSubmit() clears serverError$ before request', fakeAsync(() => {
    groupsServiceSpy.update.and.returnValue(of(MOCK_GROUP));
    fixture.detectChanges();
    tick();

    component.serverError$.next('old error');
    component.onSubmit({ name: 'X', description: '', permission_ids: [] });
    tick();

    expect(component.serverError$.value).toBeNull();
  }));

  // --- addMember ---

  it('addMember() does nothing when selectedMemberId is empty', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.selectedMemberId = '';
    component.addMember();

    expect(groupsServiceSpy.addMember).not.toHaveBeenCalled();
  }));

  it('addMember() calls groupsService.addMember and updates members list', fakeAsync(() => {
    groupsServiceSpy.addMember.and.returnValue(of(undefined as any));
    fixture.detectChanges();
    tick();

    component.selectedMemberId = 'mem-2';
    component.addMember();
    tick();

    expect(groupsServiceSpy.addMember).toHaveBeenCalledWith('grp-1', 'mem-2');
    expect(component.selectedMemberId).toBe('');
    // mem-2 should now be in the members list
    expect(component.members$.value.some(m => m.id === 'mem-2')).toBe(true);
  }));

  it('addMember() handles member not found in allTenantMembers', fakeAsync(() => {
    groupsServiceSpy.addMember.and.returnValue(of(undefined as any));
    fixture.detectChanges();
    tick();

    component.selectedMemberId = 'non-existent';
    component.addMember();
    tick();

    expect(groupsServiceSpy.addMember).toHaveBeenCalledWith('grp-1', 'non-existent');
    // Should still succeed but not add to members list (member not found)
    expect(component.members$.value.length).toBe(1);
  }));

  it('addMember() shows error on failure', fakeAsync(() => {
    groupsServiceSpy.addMember.and.returnValue(
      throwError(() => ({ error: { detail: 'Already a member' } })),
    );
    fixture.detectChanges();
    tick();

    component.selectedMemberId = 'mem-2';
    component.addMember();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Already a member');
  }));

  it('addMember() shows generic error when no detail', fakeAsync(() => {
    groupsServiceSpy.addMember.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.selectedMemberId = 'mem-2';
    component.addMember();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to add member.');
  }));

  // --- removeMember ---

  it('removeMember() calls groupsService.removeMember and updates list', fakeAsync(() => {
    groupsServiceSpy.removeMember.and.returnValue(of(undefined as any));
    fixture.detectChanges();
    tick();

    expect(component.members$.value.length).toBe(1);

    component.removeMember(MEMBER_IN_GROUP);
    tick();

    expect(groupsServiceSpy.removeMember).toHaveBeenCalledWith('grp-1', 'mem-1');
    expect(component.members$.value.length).toBe(0);
  }));

  it('removeMember() shows error on failure', fakeAsync(() => {
    groupsServiceSpy.removeMember.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot remove last member' } })),
    );
    fixture.detectChanges();
    tick();

    component.removeMember(MEMBER_IN_GROUP);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Cannot remove last member');
  }));

  it('removeMember() shows generic error when no detail', fakeAsync(() => {
    groupsServiceSpy.removeMember.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.removeMember(MEMBER_IN_GROUP);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove member.');
  }));

  // --- onCancel ---

  it('onCancel() navigates to group view page', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.onCancel();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/groups', 'grp-1']);
  }));
});
