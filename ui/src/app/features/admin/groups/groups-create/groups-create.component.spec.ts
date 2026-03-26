import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { GroupsCreateComponent } from './groups-create.component';
import { GroupsService } from '../services/groups.service';
import { PermissionsApiService } from '../services/permissions-api.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { TenantGroupDetail, PermissionItem } from '../models/group.model';

const MOCK_PERMISSIONS: PermissionItem[] = [
  { id: 'p1', codename: 'view_engagement', name: 'View Engagement', category: 'engagements', resource: 'engagement' },
  { id: 'p2', codename: 'edit_engagement', name: 'Edit Engagement', category: 'engagements', resource: 'engagement' },
];

const MOCK_CREATED_GROUP: TenantGroupDetail = {
  id: 'grp-new',
  name: 'New Group',
  description: 'A new group',
  is_default: false,
  permissions: [MOCK_PERMISSIONS[0]],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('GroupsCreateComponent', () => {
  let component: GroupsCreateComponent;
  let fixture: ComponentFixture<GroupsCreateComponent>;

  let groupsServiceSpy: jasmine.SpyObj<GroupsService>;
  let permissionsApiSpy: jasmine.SpyObj<PermissionsApiService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    groupsServiceSpy = jasmine.createSpyObj('GroupsService', ['create']);
    permissionsApiSpy = jasmine.createSpyObj('PermissionsApiService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    permissionsApiSpy.list.and.returnValue(of(MOCK_PERMISSIONS));

    await TestBed.configureTestingModule({
      imports: [GroupsCreateComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GroupsService, useValue: groupsServiceSpy },
        { provide: PermissionsApiService, useValue: permissionsApiSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: Router, useValue: routerSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupsCreateComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- constructor ---

  it('loads permissions on construction', fakeAsync(() => {
    tick();

    expect(permissionsApiSpy.list).toHaveBeenCalled();
    expect(component.allPermissions$.value).toEqual(MOCK_PERMISSIONS);
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

  it('onSubmit() calls groupsService.create and navigates on success', fakeAsync(() => {
    groupsServiceSpy.create.and.returnValue(of(MOCK_CREATED_GROUP));

    component.onSubmit({
      name: 'New Group',
      description: 'A new group',
      permission_ids: ['p1'],
    });
    tick();

    expect(groupsServiceSpy.create).toHaveBeenCalledWith({
      name: 'New Group',
      description: 'A new group',
      permission_ids: ['p1'],
    });
    expect(component.saving$.value).toBe(false);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/groups']);
  }));

  it('onSubmit() clears serverError$ before request', fakeAsync(() => {
    groupsServiceSpy.create.and.returnValue(of(MOCK_CREATED_GROUP));

    component.serverError$.next('old error');
    component.onSubmit({
      name: 'X',
      description: '',
      permission_ids: [],
    });
    tick();

    expect(component.serverError$.value).toBeNull();
  }));

  it('onSubmit() sets saving$ to true while in progress', fakeAsync(() => {
    groupsServiceSpy.create.and.returnValue(of(MOCK_CREATED_GROUP));

    component.onSubmit({
      name: 'X',
      description: '',
      permission_ids: [],
    });
    tick();
    expect(component.saving$.value).toBe(false);
  }));

  it('onSubmit() shows error on failure with name field', fakeAsync(() => {
    groupsServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { name: ['Name already exists'] } })),
    );

    component.onSubmit({
      name: 'Duplicate',
      description: '',
      permission_ids: [],
    });
    tick();

    expect(component.saving$.value).toBe(false);
    expect(component.serverError$.value).toBe('Name already exists');
    expect(notifySpy.error).toHaveBeenCalledWith('Name already exists');
  }));

  it('onSubmit() shows error with detail fallback', fakeAsync(() => {
    groupsServiceSpy.create.and.returnValue(
      throwError(() => ({ error: { detail: 'Not authorized' } })),
    );

    component.onSubmit({
      name: 'X',
      description: '',
      permission_ids: [],
    });
    tick();

    expect(component.serverError$.value).toBe('Not authorized');
  }));

  it('onSubmit() shows generic error when no specific field', fakeAsync(() => {
    groupsServiceSpy.create.and.returnValue(throwError(() => ({})));

    component.onSubmit({
      name: 'X',
      description: '',
      permission_ids: [],
    });
    tick();

    expect(component.serverError$.value).toBe('Failed to create group.');
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to create group.');
  }));

  // --- onCancel ---

  it('onCancel() navigates to groups list', () => {
    component.onCancel();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/admin/groups']);
  });
});
