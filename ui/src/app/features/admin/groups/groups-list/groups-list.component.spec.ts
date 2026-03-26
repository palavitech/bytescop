import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { GroupsListComponent } from './groups-list.component';
import { GroupsService } from '../services/groups.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { PermissionService } from '../../../../services/core/auth/permission.service';
import { TenantGroupListItem } from '../models/group.model';

const MOCK_GROUPS: TenantGroupListItem[] = [
  { id: 'grp-1', name: 'Administrators', description: 'Full access', is_default: true, member_count: 2, created_at: '2025-01-01T00:00:00Z' },
  { id: 'grp-2', name: 'Analysts', description: '', is_default: false, member_count: 5, created_at: '2025-01-01T00:00:00Z' },
  { id: 'grp-3', name: 'Collaborators', description: 'Read-only', is_default: true, member_count: 3, created_at: '2025-01-01T00:00:00Z' },
];

describe('GroupsListComponent', () => {
  let component: GroupsListComponent;
  let fixture: ComponentFixture<GroupsListComponent>;

  let groupsServiceSpy: jasmine.SpyObj<GroupsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;

  beforeEach(async () => {
    groupsServiceSpy = jasmine.createSpyObj('GroupsService', ['list', 'delete']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    groupsServiceSpy.list.and.returnValue(of(MOCK_GROUPS));

    await TestBed.configureTestingModule({
      imports: [GroupsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GroupsService, useValue: groupsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupsListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- vm$ / initial load ---

  it('loads groups and produces ready state', fakeAsync(() => {
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(groupsServiceSpy.list).toHaveBeenCalled();
    expect(vm.state).toBe('ready');
    expect(vm.groups.length).toBe(3);
    expect(vm.total).toBe(3);
    expect(vm.deletingId).toBeNull();
  }));

  it('produces error state when list fails', fakeAsync(() => {
    groupsServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.groups).toEqual([]);
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

    groupsServiceSpy.list.calls.reset();
    component.refresh();
    tick();

    expect(groupsServiceSpy.list).toHaveBeenCalledTimes(1);
  }));

  // --- confirmDelete / cancelDelete ---

  it('confirmDelete() sets deletingId', fakeAsync(() => {
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('grp-2');
    tick();

    expect(vm.deletingId).toBe('grp-2');
  }));

  it('cancelDelete() clears deletingId', fakeAsync(() => {
    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('grp-2');
    tick();
    expect(vm.deletingId).toBe('grp-2');

    component.cancelDelete();
    tick();
    expect(vm.deletingId).toBeNull();
  }));

  // --- deleteGroup ---

  it('deleteGroup() calls groupsService.delete and refreshes on success', fakeAsync(() => {
    groupsServiceSpy.delete.and.returnValue(of(undefined as any));
    component.vm$.subscribe();
    tick();

    component.deleteGroup(MOCK_GROUPS[1]);
    tick();

    expect(groupsServiceSpy.delete).toHaveBeenCalledWith('grp-2');
  }));

  it('deleteGroup() shows error on failure with detail', fakeAsync(() => {
    groupsServiceSpy.delete.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot delete default group' } })),
    );
    component.vm$.subscribe();
    tick();

    component.deleteGroup(MOCK_GROUPS[0]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Cannot delete default group');
  }));

  it('deleteGroup() shows generic error when no detail', fakeAsync(() => {
    groupsServiceSpy.delete.and.returnValue(throwError(() => ({})));
    component.vm$.subscribe();
    tick();

    component.deleteGroup(MOCK_GROUPS[1]);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to delete group.');
  }));

  it('deleteGroup() clears deletingId via finalize', fakeAsync(() => {
    groupsServiceSpy.delete.and.returnValue(of(undefined as any));

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    component.confirmDelete('grp-2');
    tick();
    expect(vm.deletingId).toBe('grp-2');

    component.deleteGroup(MOCK_GROUPS[1]);
    tick();

    expect(vm.deletingId).toBeNull();
  }));

  // --- exportCsv ---

  it('exportCsv() creates a CSV download', () => {
    const createElementSpy = spyOn(document, 'createElement').and.callThrough();
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    const revokeUrlSpy = spyOn(URL, 'revokeObjectURL');

    component.exportCsv(MOCK_GROUPS);

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(revokeUrlSpy).toHaveBeenCalled();
  });

  it('exportCsv() handles groups with empty description', () => {
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    const revokeUrlSpy = spyOn(URL, 'revokeObjectURL');

    // Should not throw for groups with empty description
    component.exportCsv([MOCK_GROUPS[1]]);
    expect(revokeUrlSpy).toHaveBeenCalled();
  });
});
