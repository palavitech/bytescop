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
import { TenantMember } from '../models/member.model';

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
  let router: Router;

  beforeEach(async () => {
    membersServiceSpy = jasmine.createSpyObj('MembersService', [
      'getById', 'delete', 'resetMfa', 'promote', 'demote',
      'getEngagements', 'addEngagement', 'removeEngagement',
    ]);
    engagementsServiceSpy = jasmine.createSpyObj('EngagementsService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    membersServiceSpy.getById.and.returnValue(of(MOCK_MEMBER));
    membersServiceSpy.delete.and.returnValue(of(undefined as any));
    membersServiceSpy.resetMfa.and.returnValue(of({ detail: 'Done' }));
    membersServiceSpy.promote.and.returnValue(of(MOCK_MEMBER));
    membersServiceSpy.demote.and.returnValue(of(MOCK_MEMBER));
    membersServiceSpy.getEngagements.and.returnValue(of([]));
    membersServiceSpy.addEngagement.and.returnValue(of({} as any));
    membersServiceSpy.removeEngagement.and.returnValue(of(undefined as any));
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
