import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { UsersCreateComponent } from './users-create.component';
import { MembersService } from '../services/members.service';
import { GroupsService } from '../../groups/services/groups.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { TenantMember } from '../models/member.model';
import { TenantGroupListItem } from '../../groups/models/group.model';

const MOCK_GROUPS: TenantGroupListItem[] = [
  { id: 'grp-1', name: 'Analysts', description: '', is_default: false, member_count: 3, created_at: '' },
  { id: 'grp-2', name: 'Admins', description: '', is_default: true, member_count: 1, created_at: '' },
];

const MOCK_CREATED_MEMBER: TenantMember = {
  id: 'mem-new',
  user: {
    id: 'u-new',
    email: 'new@example.com',
    first_name: 'New',
    last_name: 'User',
    avatar_url: null,
    mfa_enabled: false,
    phone: '',
    timezone: '',
  },
  role: 'member',
  is_active: true,
  invite_status: 'none' as const,
  groups: [],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('UsersCreateComponent', () => {
  let component: UsersCreateComponent;
  let fixture: ComponentFixture<UsersCreateComponent>;

  let membersServiceSpy: jasmine.SpyObj<MembersService>;
  let groupsServiceSpy: jasmine.SpyObj<GroupsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let routerSpy: jasmine.SpyObj<Router>;
  let profileSpy: jasmine.SpyObj<UserProfileService>;

  beforeEach(async () => {
    membersServiceSpy = jasmine.createSpyObj('MembersService', ['create']);
    groupsServiceSpy = jasmine.createSpyObj('GroupsService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    profileSpy = jasmine.createSpyObj('UserProfileService', ['currentSubscription', 'refreshProfile']);
    profileSpy.currentSubscription.and.returnValue(null);
    profileSpy.refreshProfile.and.returnValue(of({}));

    groupsServiceSpy.list.and.returnValue(of(MOCK_GROUPS as any));

    await TestBed.configureTestingModule({
      imports: [UsersCreateComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MembersService, useValue: membersServiceSpy },
        { provide: GroupsService, useValue: groupsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: Router, useValue: routerSpy },
        { provide: UserProfileService, useValue: profileSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersCreateComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- constructor ---

  it('loads groups on construction', fakeAsync(() => {
    tick();

    expect(groupsServiceSpy.list).toHaveBeenCalled();
    const groups = component.groups$.value;
    expect(groups.length).toBe(2);
    expect(groups[0]).toEqual({ id: 'grp-1', name: 'Analysts', is_default: false });
    expect(groups[1]).toEqual({ id: 'grp-2', name: 'Admins', is_default: true });
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

  it('onSubmit() calls membersService.create and navigates on success', fakeAsync(() => {
    membersServiceSpy.create.and.returnValue(of(MOCK_CREATED_MEMBER));

    component.onSubmit({
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
      password: 'Str0ngP@ss!99',
      password_confirm: 'Str0ngP@ss!99',
      group_ids: ['grp-1'],
    });
    tick();

    expect(membersServiceSpy.create).toHaveBeenCalledWith({
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
      password: 'Str0ngP@ss!99',
      password_confirm: 'Str0ngP@ss!99',
      group_ids: ['grp-1'],
    });
    expect(component.saving$.value).toBe(false);
    expect(notifySpy.success).toHaveBeenCalledWith('User new@example.com created.');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/users']);
  }));

  it('onSubmit() sets saving$ to true while in progress', fakeAsync(() => {
    membersServiceSpy.create.and.returnValue(of(MOCK_CREATED_MEMBER));

    component.onSubmit({
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
      group_ids: [],

    });
    tick();
    expect(component.saving$.value).toBe(false);
  }));

  it('onSubmit() shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { detail: 'Email already exists' } })),
    );

    component.onSubmit({
      email: 'dup@example.com',
      first_name: 'A',
      last_name: 'B',
      group_ids: [],

    });
    tick();

    expect(component.saving$.value).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Email already exists');
  }));

  it('onSubmit() shows error from email field', fakeAsync(() => {
    membersServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { message: 'Validation error.', errors: { email: ['Invalid email'] } } })),
    );

    component.onSubmit({
      email: 'invalid',
      first_name: 'A',
      last_name: 'B',
      group_ids: [],

    });
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Invalid email');
  }));

  it('onSubmit() shows generic error when no specific field', fakeAsync(() => {
    membersServiceSpy.create.and.returnValue(throwError(() => ({})));

    component.onSubmit({
      email: 'a@b.com',
      first_name: 'A',
      last_name: 'B',
      group_ids: [],

    });
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to create user.');
  }));

  // --- onCancel ---

  it('onCancel() navigates to users list', () => {
    component.onCancel();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/users']);
  });

  // --- Subscription limit pre-checks ---

  it('blocks create when member limit is reached', () => {
    profileSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_members: 3, max_clients: 5, max_assets: 10, max_engagements: 5, max_findings_per_engagement: 20, max_images_per_finding: 5 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 3, clients: 2, assets: 0, engagements: 0 },
    });

    component.onSubmit({
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
      group_ids: [],

    });

    expect(notifySpy.error).toHaveBeenCalledWith('Team member limit reached (3/3). Upgrade your plan to add more.');
    expect(membersServiceSpy.create).not.toHaveBeenCalled();
  });

});
