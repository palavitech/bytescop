import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { GroupsViewComponent } from './groups-view.component';
import { GroupsService } from '../services/groups.service';
import { MembersService } from '../../users/services/members.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { PermissionService } from '../../../../services/core/auth/permission.service';
import { TenantGroupDetail, PermissionItem } from '../models/group.model';
import { TenantMember } from '../../users/models/member.model';

const MOCK_PERMISSIONS: PermissionItem[] = [
  { id: 'p1', codename: 'view_engagement', name: 'View Engagement', category: 'engagements', resource: 'engagement' },
  { id: 'p2', codename: 'edit_engagement', name: 'Edit Engagement', category: 'engagements', resource: 'engagement' },
  { id: 'p3', codename: 'view_client', name: 'View Client', category: 'clients', resource: 'client' },
];

const MOCK_GROUP: TenantGroupDetail = {
  id: 'grp-1',
  name: 'Test Group',
  description: 'A test group',
  is_default: false,
  permissions: MOCK_PERMISSIONS,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const makeMember = (id: string, email: string, groups: { id: string; name: string; is_default: boolean }[]): TenantMember => ({
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
  is_active: true,
  invite_status: 'none' as const,
  groups,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
});

const MEMBER_IN_GROUP = makeMember('mem-1', 'member@example.com', [{ id: 'grp-1', name: 'Test Group', is_default: false }]);
const MEMBER_NOT_IN_GROUP = makeMember('mem-2', 'other@example.com', []);

describe('GroupsViewComponent', () => {
  let component: GroupsViewComponent;
  let fixture: ComponentFixture<GroupsViewComponent>;

  let groupsServiceSpy: jasmine.SpyObj<GroupsService>;
  let membersServiceSpy: jasmine.SpyObj<MembersService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let router: Router;

  beforeEach(async () => {
    groupsServiceSpy = jasmine.createSpyObj('GroupsService', ['getById', 'delete']);
    membersServiceSpy = jasmine.createSpyObj('MembersService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    groupsServiceSpy.getById.and.returnValue(of(MOCK_GROUP));
    groupsServiceSpy.delete.and.returnValue(of(undefined as any));
    membersServiceSpy.list.and.returnValue(of([MEMBER_IN_GROUP, MEMBER_NOT_IN_GROUP]));

    await TestBed.configureTestingModule({
      imports: [GroupsViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: GroupsService, useValue: groupsServiceSpy },
        { provide: MembersService, useValue: membersServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
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

    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

    fixture = TestBed.createComponent(GroupsViewComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads group and filters members on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(groupsServiceSpy.getById).toHaveBeenCalledWith('grp-1');
    expect(membersServiceSpy.list).toHaveBeenCalled();
    expect(vm.state).toBe('ready');
    expect(vm.group).toEqual(MOCK_GROUP);
    expect(vm.members.length).toBe(1);
    expect(vm.members[0].id).toBe('mem-1');
  }));

  it('sets state to missing on 404 error', fakeAsync(() => {
    groupsServiceSpy.getById.and.returnValue(throwError(() => ({ status: 404 })));
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('missing');
    expect(vm.group).toBeNull();
    expect(vm.members).toEqual([]);
  }));

  it('sets state to error on non-404 error', fakeAsync(() => {
    groupsServiceSpy.getById.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.group).toBeNull();
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

    groupsServiceSpy.getById.calls.reset();
    membersServiceSpy.list.calls.reset();

    component.refresh();

    component.vm$.subscribe();
    tick();

    expect(groupsServiceSpy.getById).toHaveBeenCalledWith('grp-1');
    expect(membersServiceSpy.list).toHaveBeenCalled();
  }));

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

  // --- deleteGroup ---

  it('deleteGroup() calls groupsService.delete and navigates on success', fakeAsync(() => {
    groupsServiceSpy.delete.and.returnValue(of(undefined as any));
    fixture.detectChanges();
    tick();

    component.deleteGroup(MOCK_GROUP);
    tick();

    expect(groupsServiceSpy.delete).toHaveBeenCalledWith('grp-1');
    expect(component.deleting$.value).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/admin/groups']);
  }));

  it('deleteGroup() shows error on failure with detail', fakeAsync(() => {
    groupsServiceSpy.delete.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot delete default group' } })),
    );
    fixture.detectChanges();
    tick();

    component.deleteGroup(MOCK_GROUP);
    tick();

    expect(component.deleting$.value).toBe(false);
    expect(component.confirmingDelete$.value).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Cannot delete default group');
  }));

  it('deleteGroup() shows generic error when no detail', fakeAsync(() => {
    groupsServiceSpy.delete.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.deleteGroup(MOCK_GROUP);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to delete group.');
  }));

  // --- groupPermissionsByResource ---

  it('groupPermissionsByResource() groups permissions by resource sorted alphabetically', () => {
    const result = component.groupPermissionsByResource(MOCK_PERMISSIONS);

    expect(result.length).toBe(2);
    expect(result[0].resource).toBe('client');
    expect(result[0].permissions.length).toBe(1);
    expect(result[1].resource).toBe('engagement');
    expect(result[1].permissions.length).toBe(2);
  });

  it('groupPermissionsByResource() returns empty array for empty permissions', () => {
    expect(component.groupPermissionsByResource([])).toEqual([]);
  });

  it('groupPermissionsByResource() handles single permission', () => {
    const result = component.groupPermissionsByResource([MOCK_PERMISSIONS[2]]);
    expect(result.length).toBe(1);
    expect(result[0].resource).toBe('client');
    expect(result[0].permissions.length).toBe(1);
  });
});
