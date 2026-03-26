import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { Subject, of } from 'rxjs';

import { GroupsEditComponent } from './groups-edit.component';
import { GroupsService } from '../services/groups.service';
import { PermissionsApiService } from '../services/permissions-api.service';
import { MembersService } from '../../users/services/members.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { PermissionService } from '../../../../services/core/auth/permission.service';

describe('GroupsEditComponent OnPush', () => {
  let fixture: ComponentFixture<GroupsEditComponent>;
  let component: GroupsEditComponent;
  let markSpy: jasmine.Spy;

  let groupsServiceSpy: jasmine.SpyObj<GroupsService>;
  let permissionsApiSpy: jasmine.SpyObj<PermissionsApiService>;
  let membersServiceSpy: jasmine.SpyObj<MembersService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockGroup = {
    id: 'grp-1',
    name: 'Test Group',
    description: 'A test group',
    is_default: false,
    permissions: [],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  const mockMember = {
    id: 'mem-1',
    user: {
      id: 'u1',
      email: 'member@example.com',
      first_name: 'Test',
      last_name: 'Member',
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

  beforeEach(async () => {
    groupsServiceSpy = jasmine.createSpyObj('GroupsService', [
      'getById', 'update', 'addMember', 'removeMember',
    ]);
    permissionsApiSpy = jasmine.createSpyObj('PermissionsApiService', ['list']);
    membersServiceSpy = jasmine.createSpyObj('MembersService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    // Default stubs for forkJoin in ngOnInit
    groupsServiceSpy.getById.and.returnValue(of(mockGroup));
    permissionsApiSpy.list.and.returnValue(of([]));
    membersServiceSpy.list.and.returnValue(of([mockMember]));

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
    fixture.detectChanges(); // triggers ngOnInit
  });

  function getMarkSpy(): jasmine.Spy {
    return spyOn((component as any).cdr, 'markForCheck');
  }

  it('addMember should call markForCheck after success', () => {
    markSpy = getMarkSpy();

    const addSubject = new Subject<any>();
    groupsServiceSpy.addMember.and.returnValue(addSubject.asObservable());

    component.selectedMemberId = 'mem-1';
    component.addMember();

    addSubject.next({ detail: 'Member added.' });
    addSubject.complete();

    expect(markSpy).toHaveBeenCalled();
  });
});
