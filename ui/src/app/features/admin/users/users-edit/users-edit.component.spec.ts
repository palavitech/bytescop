import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { UsersEditComponent } from './users-edit.component';
import { MembersService } from '../services/members.service';
import { GroupsService } from '../../groups/services/groups.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { TenantMember } from '../models/member.model';

const MOCK_MEMBER: TenantMember = {
  id: 'mem-1',
  user: {
    id: 'u1',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    avatar_url: null,
    mfa_enabled: false,
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

const MOCK_GROUPS = [
  { id: 'grp-1', name: 'Analysts', description: '', is_default: false, member_count: 3, created_at: '' },
  { id: 'grp-2', name: 'Admins', description: '', is_default: true, member_count: 1, created_at: '' },
];

describe('UsersEditComponent', () => {
  let component: UsersEditComponent;
  let fixture: ComponentFixture<UsersEditComponent>;

  let membersServiceSpy: jasmine.SpyObj<MembersService>;
  let groupsServiceSpy: jasmine.SpyObj<GroupsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    membersServiceSpy = jasmine.createSpyObj('MembersService', ['getById', 'update']);
    groupsServiceSpy = jasmine.createSpyObj('GroupsService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    membersServiceSpy.getById.and.returnValue(of(MOCK_MEMBER));
    groupsServiceSpy.list.and.returnValue(of(MOCK_GROUPS as any));
    await TestBed.configureTestingModule({
      imports: [UsersEditComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MembersService, useValue: membersServiceSpy },
        { provide: GroupsService, useValue: groupsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'mem-1' } },
            root: { firstChild: null } as any,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersEditComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads member and groups on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(membersServiceSpy.getById).toHaveBeenCalledWith('mem-1');
    expect(groupsServiceSpy.list).toHaveBeenCalled();
    expect(component.member$.value).toEqual(MOCK_MEMBER);
    expect(component.groups$.value.length).toBe(2);
    expect(component.loading$.value).toBe(false);
  }));

  it('shows error when forkJoin fails', fakeAsync(() => {
    membersServiceSpy.getById.and.returnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to load user details.');
    expect(component.loading$.value).toBe(false);
  }));

  it('maps groups to MemberGroup shape', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    const groups = component.groups$.value;
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

  it('onSubmit() calls membersService.update and navigates on success', fakeAsync(() => {
    membersServiceSpy.update.and.returnValue(of(MOCK_MEMBER));
    fixture.detectChanges();
    tick();

    component.onSubmit({
      email: 'test@example.com',
      first_name: 'Updated',
      last_name: 'User',


      group_ids: ['grp-1'],
    });
    tick();

    expect(membersServiceSpy.update).toHaveBeenCalledWith('mem-1', {
      first_name: 'Updated',
      last_name: 'User',

      group_ids: ['grp-1'],
    });
    expect(component.saving$.value).toBe(false);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/users', 'mem-1']);
  }));

  it('onSubmit() shows error on failure with detail', fakeAsync(() => {
    membersServiceSpy.update.and.returnValue(
      throwError(() => ({ error: { detail: 'Email taken' } })),
    );
    fixture.detectChanges();
    tick();

    component.onSubmit({
      email: '',
      first_name: 'A',
      last_name: 'B',


      group_ids: [],
    });
    tick();

    expect(component.saving$.value).toBe(false);
    expect(component.serverError$.value).toBe('Email taken');
    expect(notifySpy.error).toHaveBeenCalledWith('Email taken');
  }));

  it('onSubmit() shows generic error when no detail', fakeAsync(() => {
    membersServiceSpy.update.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.onSubmit({
      email: '',
      first_name: 'A',
      last_name: 'B',


      group_ids: [],
    });
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to update user.');
  }));

  it('onSubmit() clears serverError$ before request', fakeAsync(() => {
    membersServiceSpy.update.and.returnValue(of(MOCK_MEMBER));
    fixture.detectChanges();
    tick();

    component.serverError$.next('old error');
    component.onSubmit({
      email: '',
      first_name: 'A',
      last_name: 'B',


      group_ids: [],
    });
    tick();

    // null means cleared
    expect(component.serverError$.value).toBeNull();
  }));

  // --- onCancel ---

  it('onCancel() navigates to user view page', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.onCancel();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/users', 'mem-1']);
  }));
});
