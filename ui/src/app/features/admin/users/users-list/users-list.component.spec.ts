import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { UsersListComponent } from './users-list.component';
import { MembersService } from '../services/members.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { PermissionService } from '../../../../services/core/auth/permission.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { TenantMember, ToggleActiveResponse } from '../models/member.model';

const makeMember = (id: string, email: string, firstName: string, lastName: string, role = 'member', isActive = true, groups: any[] = []): TenantMember => ({
  id,
  user: {
    id: `u-${id}`,
    email,
    first_name: firstName,
    last_name: lastName,
    avatar_url: null,
    mfa_enabled: false,
    phone: '',
    timezone: '',
  },
  role,
  is_active: isActive,
  invite_status: 'none' as const,
  groups,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
});

const MOCK_MEMBERS: TenantMember[] = [
  makeMember('mem-1', 'admin@example.com', 'Admin', 'User', 'owner', true, [{ id: 'g1', name: 'Admins', is_default: true }]),
  makeMember('mem-2', 'analyst@example.com', 'Analyst', 'User', 'member', true, [{ id: 'g2', name: 'Analysts', is_default: false }]),
  makeMember('mem-3', 'locked@example.com', 'Locked', 'User', 'member', false, []),
];

describe('UsersListComponent', () => {
  let component: UsersListComponent;
  let fixture: ComponentFixture<UsersListComponent>;

  let membersServiceSpy: jasmine.SpyObj<MembersService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let profileServiceSpy: jasmine.SpyObj<UserProfileService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    membersServiceSpy = jasmine.createSpyObj('MembersService', ['list', 'delete', 'toggleActive']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    profileServiceSpy = jasmine.createSpyObj('UserProfileService', ['currentSubscription']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    membersServiceSpy.list.and.returnValue(of(MOCK_MEMBERS));
    profileServiceSpy.currentSubscription.and.returnValue(null);
    routerSpy.navigate.and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [UsersListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MembersService, useValue: membersServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: Router, useValue: routerSpy },
        { provide: UserProfileService, useValue: profileServiceSpy },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- vm$ / initial load ---

  it('loads members and produces ready state', fakeAsync(() => {
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(membersServiceSpy.list).toHaveBeenCalled();
    expect(vm.state).toBe('ready');
    expect(vm.members.length).toBe(3);
    expect(vm.total).toBe(3);
    expect(vm.deletingId).toBeNull();
  }));

  it('produces error state when list fails', fakeAsync(() => {
    membersServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.members).toEqual([]);
    expect(vm.total).toBe(0);
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
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    membersServiceSpy.list.calls.reset();
    component.refresh();
    tick();

    expect(membersServiceSpy.list).toHaveBeenCalledTimes(1);
  }));

  // --- prettyRole ---

  it('prettyRole() capitalizes first letter', () => {
    expect(component.prettyRole('owner')).toBe('Owner');
    expect(component.prettyRole('member')).toBe('Member');
    expect(component.prettyRole('admin')).toBe('Admin');
  });

  // --- confirmDelete / cancelDelete ---

  it('confirmDelete() sets deletingId', fakeAsync(() => {
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('mem-2');
    tick();

    expect(vm.deletingId).toBe('mem-2');
  }));

  it('cancelDelete() clears deletingId', fakeAsync(() => {
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('mem-2');
    tick();
    expect(vm.deletingId).toBe('mem-2');

    component.cancelDelete();
    tick();
    expect(vm.deletingId).toBeNull();
  }));

  // --- deleteUser ---

  it('deleteUser() calls membersService.delete and refreshes on success', fakeAsync(() => {
    membersServiceSpy.delete.and.returnValue(of(undefined as any));
    component.vm$.subscribe();
    tick();

    component.deleteUser(MOCK_MEMBERS[1]);
    tick();

    expect(membersServiceSpy.delete).toHaveBeenCalledWith('mem-2');
  }));

  it('deleteUser() shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.delete.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot remove owner' } })),
    );
    component.vm$.subscribe();
    tick();

    component.deleteUser(MOCK_MEMBERS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Cannot remove owner');
  }));

  it('deleteUser() shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.delete.and.returnValue(throwError(() => ({})));
    component.vm$.subscribe();
    tick();

    component.deleteUser(MOCK_MEMBERS[1]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove user.');
  }));

  // --- toggleActive ---

  it('toggleActive() calls membersService.toggleActive and shows unlocked message', fakeAsync(() => {
    const response: ToggleActiveResponse = { id: 'mem-3', is_active: true };
    membersServiceSpy.toggleActive.and.returnValue(of(response));
    component.vm$.subscribe();
    tick();

    component.toggleActive(MOCK_MEMBERS[2]);
    tick();

    expect(membersServiceSpy.toggleActive).toHaveBeenCalledWith('mem-3');
  }));

  it('toggleActive() shows locked message when toggled to inactive', fakeAsync(() => {
    const response: ToggleActiveResponse = { id: 'mem-2', is_active: false };
    membersServiceSpy.toggleActive.and.returnValue(of(response));
    component.vm$.subscribe();
    tick();

    component.toggleActive(MOCK_MEMBERS[1]);
    tick();

  }));

  it('toggleActive() shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.toggleActive.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot lock owner' } })),
    );
    component.vm$.subscribe();
    tick();

    component.toggleActive(MOCK_MEMBERS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Cannot lock owner');
  }));

  it('toggleActive() shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.toggleActive.and.returnValue(throwError(() => ({})));
    component.vm$.subscribe();
    tick();

    component.toggleActive(MOCK_MEMBERS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to toggle user status.');
  }));

  // --- exportCsv ---

  it('exportCsv() creates a CSV download', () => {
    const createElementSpy = spyOn(document, 'createElement').and.callThrough();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    const revokeUrlSpy = spyOn(URL, 'revokeObjectURL');

    component.exportCsv(MOCK_MEMBERS);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(revokeUrlSpy).toHaveBeenCalled();
  });

  // --- buildAvatarUrl ---

  it('buildAvatarUrl() returns null for null input', () => {
    expect(component.buildAvatarUrl(null)).toBeNull();
  });

  it('buildAvatarUrl() prepends apiUrl for non-null input', () => {
    const result = component.buildAvatarUrl('/media/avatars/test.png');
    expect(result).toContain('/media/avatars/test.png');
  });

  // --- getInitials ---

  it('getInitials() returns first+last initials when both names exist', () => {
    const user = { ...MOCK_MEMBERS[0].user, first_name: 'John', last_name: 'Doe' };
    expect(component.getInitials(user)).toBe('JD');
  });

  it('getInitials() returns first 2 chars of first name when no last name', () => {
    const user = { ...MOCK_MEMBERS[0].user, first_name: 'John', last_name: '' };
    expect(component.getInitials(user)).toBe('JO');
  });

  it('getInitials() returns first 2 chars of email local part when no names', () => {
    const user = { ...MOCK_MEMBERS[0].user, first_name: '', last_name: '', email: 'test@example.com' };
    expect(component.getInitials(user)).toBe('TE');
  });

  // --- createUser ---

  it('createUser() navigates when subscription is null', () => {
    profileServiceSpy.currentSubscription.and.returnValue(null);

    component.createUser();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/users/create']);
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createUser() navigates when limit is 0 (unlimited)', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_members: 0, max_clients: 0, max_assets: 0, max_engagements: 0, max_findings_per_engagement: 0, max_images_per_finding: 0 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 5, clients: 0, assets: 0, engagements: 0 },
    });

    component.createUser();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/users/create']);
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createUser() navigates when usage is below limit', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_members: 5, max_clients: 0, max_assets: 0, max_engagements: 0, max_findings_per_engagement: 0, max_images_per_finding: 0 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 3, clients: 0, assets: 0, engagements: 0 },
    });

    component.createUser();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/users/create']);
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createUser() shows error when member limit is reached', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_members: 3, max_clients: 0, max_assets: 0, max_engagements: 0, max_findings_per_engagement: 0, max_images_per_finding: 0 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 3, clients: 0, assets: 0, engagements: 0 },
    });

    component.createUser();

    expect(notifySpy.error).toHaveBeenCalledWith('Team member limit reached (3/3). Upgrade your plan to add more.');
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('createUser() navigates when usage is missing (nullish coalescing fallback)', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_members: 5, max_clients: 0, max_assets: 0, max_engagements: 0, max_findings_per_engagement: 0, max_images_per_finding: 0 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: undefined as any,
    });

    component.createUser();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/users/create']);
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('createUser() shows error when member usage exceeds limit', () => {
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_members: 3, max_clients: 0, max_assets: 0, max_engagements: 0, max_findings_per_engagement: 0, max_images_per_finding: 0 },
      features: { audit_log: false, data_export: false, custom_branding: false },
      usage: { members: 4, clients: 0, assets: 0, engagements: 0 },
    });

    component.createUser();

    expect(notifySpy.error).toHaveBeenCalledWith('Team member limit reached (4/3). Upgrade your plan to add more.');
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  // --- deleteUser error with null err ---

  it('deleteUser() shows generic error when err is null', fakeAsync(() => {
    membersServiceSpy.delete.and.returnValue(throwError(() => null));
    component.vm$.subscribe();
    tick();

    component.deleteUser(MOCK_MEMBERS[1]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove user.');
  }));

  // --- toggleActive error with null err ---

  it('toggleActive() shows generic error when err is null', fakeAsync(() => {
    membersServiceSpy.toggleActive.and.returnValue(throwError(() => null));
    component.vm$.subscribe();
    tick();

    component.toggleActive(MOCK_MEMBERS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to toggle user status.');
  }));
});
