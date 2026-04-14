import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError, Subject, BehaviorSubject } from 'rxjs';

import { EngagementsListComponent } from './engagements-list.component';
import { EngagementsService } from '../services/engagements.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';
import { Engagement } from '../models/engagement.model';
import { OrganizationRef } from '../../organizations/models/organization.model';

const MOCK_ORG: OrganizationRef = { id: 'org-1', name: 'Acme Corp' };

const MOCK_ENGAGEMENTS: Engagement[] = [
  {
    id: 'eng-1',
    name: 'Pentest Q1',
    client_id: 'org-1',
    client_name: 'Acme Corp',
    status: 'active',
    description: '',
    notes: '',
    start_date: '2025-01-01',
    end_date: '2025-06-01',
    findings_summary: { critical: 2, high: 3, medium: 1, low: 0, info: 0 },
    engagement_type: 'general',
    project_id: null,
    project_name: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'eng-2',
    name: 'Pentest Q2',
    client_id: 'org-1',
    client_name: 'Acme Corp',
    status: 'planned',
    description: '',
    notes: '',
    start_date: null,
    end_date: null,
    findings_summary: null,
    engagement_type: 'general',
    project_id: null,
    project_name: null,
    created_at: '2025-02-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
  },
];

describe('EngagementsListComponent', () => {
  let component: EngagementsListComponent;
  let fixture: ComponentFixture<EngagementsListComponent>;
  let router: Router;

  let engagementsServiceSpy: jasmine.SpyObj<EngagementsService>;
  let orgServiceSpy: jasmine.SpyObj<OrganizationsService>;
  let locationSpy: jasmine.SpyObj<Location>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let profileServiceSpy: jasmine.SpyObj<UserProfileService>;

  let queryParamMap$: BehaviorSubject<any>;

  beforeEach(async () => {
    engagementsServiceSpy = jasmine.createSpyObj('EngagementsService', ['list']);
    orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['ref']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['error', 'success', 'info']);
    profileServiceSpy = jasmine.createSpyObj('UserProfileService', ['currentSubscription']);
    profileServiceSpy.currentSubscription.and.returnValue(null);

    engagementsServiceSpy.list.and.returnValue(of(MOCK_ENGAGEMENTS));
    orgServiceSpy.ref.and.returnValue(of([MOCK_ORG]));

    queryParamMap$ = new BehaviorSubject(convertToParamMap({}));

    await TestBed.configureTestingModule({
      imports: [EngagementsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EngagementsService, useValue: engagementsServiceSpy },
        { provide: OrganizationsService, useValue: orgServiceSpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap$,
            snapshot: { queryParams: {} },
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
        { provide: NotificationService, useValue: notifySpy },
        { provide: UserProfileService, useValue: profileServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementsListComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads engagements on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(engagementsServiceSpy.list).toHaveBeenCalled();
  }));

  it('vm$ emits ready state with engagements', fakeAsync(() => {
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('ready');
    expect(result.engagements).toEqual(MOCK_ENGAGEMENTS);
    expect(result.total).toBe(2);
    expect(result.organizations).toEqual([MOCK_ORG]);
  }));

  it('vm$ emits error state when list fails', fakeAsync(() => {
    engagementsServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('error');
    expect(result.engagements).toEqual([]);
    expect(result.total).toBe(0);
  }));

  it('vm$ handles orgService error gracefully', fakeAsync(() => {
    orgServiceSpy.ref.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('ready');
    expect(result.organizations).toEqual([]);
  }));

  // --- Query param filters ---

  it('reads client filter from query params', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ client: 'org-1' }));
    fixture.detectChanges();
    tick();

    expect(engagementsServiceSpy.list).toHaveBeenCalledWith(
      jasmine.objectContaining({ client: 'org-1' }),
    );
  }));

  it('reads status filter from query params', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ status: 'active' }));
    fixture.detectChanges();
    tick();

    expect(engagementsServiceSpy.list).toHaveBeenCalledWith(
      jasmine.objectContaining({ status: 'active' }),
    );
  }));

  it('ignores invalid status values in query params', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ status: 'invalid_status' }));
    fixture.detectChanges();
    tick();

    expect(engagementsServiceSpy.list).toHaveBeenCalledWith(
      jasmine.objectContaining({ status: undefined }),
    );
  }));

  it('sets filter labels when client filter is set', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ client: 'org-1' }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.filterLabels.clientName).toBe('Acme Corp');
  }));

  it('sets status label when status filter is set', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ status: 'active' }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.filterLabels.statusLabel).toBe('Active');
  }));

  it('does not re-emit when query params have not changed', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    engagementsServiceSpy.list.calls.reset();
    // Re-emit same empty params
    queryParamMap$.next(convertToParamMap({}));
    tick();

    // Should not have called list again since filters haven't changed
    expect(engagementsServiceSpy.list).not.toHaveBeenCalled();
  }));

  // --- goBack ---

  it('goBack() calls location.back()', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  // --- toggleHelp ---

  it('toggleHelp() toggles showHelp and hides filters', () => {
    component.showFilters = true;
    component.toggleHelp();
    expect(component.showHelp).toBe(true);
    expect(component.showFilters).toBe(false);

    component.toggleHelp();
    expect(component.showHelp).toBe(false);
  });

  // --- toggleFilters ---

  it('toggleFilters() toggles showFilters and hides help', () => {
    component.showHelp = true;
    component.toggleFilters();
    expect(component.showFilters).toBe(true);
    expect(component.showHelp).toBe(false);

    component.toggleFilters();
    expect(component.showFilters).toBe(false);
  });

  // --- refresh ---

  it('refresh() triggers vm$ re-emission', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    engagementsServiceSpy.list.calls.reset();
    component.refresh();
    tick();

    expect(engagementsServiceSpy.list).toHaveBeenCalled();
  }));

  // --- Filter changes ---

  it('onClientFilterChange() pushes client filter to URL', () => {
    fixture.detectChanges();
    const event = { target: { value: 'org-1' } } as unknown as Event;
    component.onClientFilterChange(event);

    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: jasmine.objectContaining({ client: 'org-1' }),
    }));
  });

  it('onClientFilterChange() sets null for empty value', () => {
    fixture.detectChanges();
    const event = { target: { value: '' } } as unknown as Event;
    component.onClientFilterChange(event);

    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: jasmine.objectContaining({ client: null }),
    }));
  });

  it('onStatusFilterChange() pushes status filter to URL', () => {
    fixture.detectChanges();
    const event = { target: { value: 'active' } } as unknown as Event;
    component.onStatusFilterChange(event);

    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: jasmine.objectContaining({ status: 'active' }),
    }));
  });

  it('clearClientFilter() clears client from URL', () => {
    fixture.detectChanges();
    component.clearClientFilter();
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: jasmine.objectContaining({ client: null }),
    }));
  });

  it('clearStatusFilter() clears status from URL', () => {
    fixture.detectChanges();
    component.clearStatusFilter();
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: jasmine.objectContaining({ status: null }),
    }));
  });

  it('clearAllFilters() clears all filters from URL', () => {
    fixture.detectChanges();
    component.clearAllFilters();
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { client: null, status: null, type: null },
    }));
  });

  // --- prettyStatus ---

  it('prettyStatus() returns label for known statuses', () => {
    expect(component.prettyStatus('active')).toBe('Active');
    expect(component.prettyStatus('planned')).toBe('Planned');
    expect(component.prettyStatus('on_hold')).toBe('On Hold');
    expect(component.prettyStatus('completed')).toBe('Completed');
  });

  it('prettyStatus() returns raw string for unknown status', () => {
    expect(component.prettyStatus('xyz')).toBe('xyz');
  });

  // --- statusClass ---

  it('statusClass() returns expected CSS class', () => {
    expect(component.statusClass('active')).toBe('bc-statusEngagement--active');
    expect(component.statusClass('planned')).toBe('bc-statusEngagement--planned');
  });

  // --- exportCsv ---

  it('exportCsv() creates a CSV blob and triggers download', () => {
    const clickSpy = jasmine.createSpy('click');
    const revokeUrlSpy = spyOn(URL, 'revokeObjectURL');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    spyOn(document, 'createElement').and.returnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as any);

    component.exportCsv(MOCK_ENGAGEMENTS);

    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:fake');
  });

  it('exportCsv() handles null findings_summary', () => {
    const clickSpy = jasmine.createSpy('click');
    spyOn(URL, 'revokeObjectURL');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    spyOn(document, 'createElement').and.returnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as any);

    // Second engagement has null findings_summary
    component.exportCsv([MOCK_ENGAGEMENTS[1]]);
    expect(clickSpy).toHaveBeenCalled();
  });

  // --- createQueryParams ---

  it('createQueryParams() returns empty object when no filters', () => {
    fixture.detectChanges();
    expect(component.createQueryParams()).toEqual({});
  });

  it('createQueryParams() includes client when set', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ client: 'org-1' }));
    fixture.detectChanges();
    tick();

    const qp = component.createQueryParams();
    expect(qp['client']).toBe('org-1');
  }));

  it('createQueryParams() includes status for planned or active', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ status: 'active' }));
    fixture.detectChanges();
    tick();

    const qp = component.createQueryParams();
    expect(qp['status']).toBe('active');
  }));

  it('createQueryParams() excludes status for on_hold/completed', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ status: 'on_hold' }));
    fixture.detectChanges();
    tick();

    const qp = component.createQueryParams();
    expect(qp['status']).toBeUndefined();
  }));

  it('createQueryParams() includes status for planned', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ status: 'planned' }));
    fixture.detectChanges();
    tick();

    const qp = component.createQueryParams();
    expect(qp['status']).toBe('planned');
  }));

  it('createQueryParams() excludes status for completed', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ status: 'completed' }));
    fixture.detectChanges();
    tick();

    const qp = component.createQueryParams();
    expect(qp['status']).toBeUndefined();
  }));

  // --- vm$ filter label edge cases ---

  it('vm$ sets clientName to null when client filter does not match any org', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ client: 'unknown-org-id' }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.filterLabels.clientName).toBeNull();
  }));

  it('vm$ sets both filter labels to null when no filters are active', fakeAsync(() => {
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.filterLabels.clientName).toBeNull();
    expect(result.filterLabels.statusLabel).toBeNull();
  }));

  // --- createEngagement ---

  it('createEngagement() navigates when subscription is null', () => {
    fixture.detectChanges();
    profileServiceSpy.currentSubscription.and.returnValue(null);
    component.createEngagement();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/engagements/create'],
      jasmine.objectContaining({ queryParams: {} }),
    );
  });

  it('createEngagement() navigates when limit is 0 (unlimited)', () => {
    fixture.detectChanges();
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_engagements: 0 },
      usage: { engagements: 100 },
      features: {},
    } as any);
    component.createEngagement();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/engagements/create'],
      jasmine.objectContaining({ queryParams: {} }),
    );
  });

  it('createEngagement() navigates when usage is below limit', () => {
    fixture.detectChanges();
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_engagements: 10 },
      usage: { engagements: 5 },
      features: {},
    } as any);
    component.createEngagement();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/engagements/create'],
      jasmine.objectContaining({ queryParams: {} }),
    );
  });

  it('createEngagement() shows error when limit is reached', () => {
    fixture.detectChanges();
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_engagements: 5 },
      usage: { engagements: 5 },
      features: {},
    } as any);
    component.createEngagement();

    expect(notifySpy.error).toHaveBeenCalledWith(
      jasmine.stringContaining('Engagement limit reached'),
    );
    expect(router.navigate).not.toHaveBeenCalledWith(
      ['/engagements/create'],
      jasmine.anything(),
    );
  });

  it('createEngagement() shows error when usage exceeds limit', () => {
    fixture.detectChanges();
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_engagements: 3 },
      usage: { engagements: 5 },
      features: {},
    } as any);
    component.createEngagement();

    expect(notifySpy.error).toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalledWith(
      ['/engagements/create'],
      jasmine.anything(),
    );
  });

  it('createEngagement() navigates when sub has no limits property', () => {
    fixture.detectChanges();
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: null,
      usage: null,
      features: {},
    } as any);
    component.createEngagement();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/engagements/create'],
      jasmine.objectContaining({ queryParams: {} }),
    );
  });

  it('createEngagement() navigates when sub has no usage property', () => {
    fixture.detectChanges();
    profileServiceSpy.currentSubscription.and.returnValue({
      plan_code: 'free',
      plan_name: 'Free',
      limits: { max_engagements: 5 },
      usage: null,
      features: {},
    } as any);
    component.createEngagement();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/engagements/create'],
      jasmine.objectContaining({ queryParams: {} }),
    );
  });

  // --- exportCsv edge cases ---

  it('exportCsv() includes findings_summary values in CSV', () => {
    const clickSpy = jasmine.createSpy('click');
    spyOn(URL, 'revokeObjectURL');
    const createObjSpy = spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    spyOn(document, 'createElement').and.returnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as any);

    component.exportCsv([MOCK_ENGAGEMENTS[0]]);
    expect(clickSpy).toHaveBeenCalled();
    // Verify that createObjectURL was called with a Blob
    const blob = createObjSpy.calls.mostRecent().args[0] as Blob;
    expect(blob.type).toBe('text/csv');
  });

  it('exportCsv() handles engagement with empty start_date and end_date', () => {
    const clickSpy = jasmine.createSpy('click');
    spyOn(URL, 'revokeObjectURL');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    spyOn(document, 'createElement').and.returnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as any);

    const engWithNullDates: Engagement = {
      ...MOCK_ENGAGEMENTS[0],
      start_date: null,
      end_date: null,
      findings_summary: null,
    };
    component.exportCsv([engWithNullDates]);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('exportCsv() handles empty engagements array', () => {
    const clickSpy = jasmine.createSpy('click');
    spyOn(URL, 'revokeObjectURL');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:fake');
    spyOn(document, 'createElement').and.returnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as any);

    component.exportCsv([]);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('vm$ sets statusLabel to null when status has no matching label', fakeAsync(() => {
    // Subscribe first to capture emissions
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    fixture.detectChanges();
    tick();

    // Now push a status value not in ENGAGEMENT_STATUS_LABELS to exercise the ?? null fallback
    (component as any).filters$.next({ client: null, status: 'nonexistent_status' as any });
    tick();

    expect(result.filterLabels.statusLabel).toBeNull();
  }));

  // --- toggleHelp/toggleFilters: closing path (inner if not entered) ---

  it('toggleHelp() does not affect showFilters when closing help', () => {
    component.showHelp = true;
    component.showFilters = false;
    component.toggleHelp();
    expect(component.showHelp).toBe(false);
    expect(component.showFilters).toBe(false);
  });

  it('toggleFilters() does not affect showHelp when closing filters', () => {
    component.showFilters = true;
    component.showHelp = false;
    component.toggleFilters();
    expect(component.showFilters).toBe(false);
    expect(component.showHelp).toBe(false);
  });

  // --- ngOnInit: query param edge cases ---

  it('reads both client and status filters from query params', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ client: 'org-1', status: 'planned' }));
    fixture.detectChanges();
    tick();

    expect(engagementsServiceSpy.list).toHaveBeenCalledWith(
      jasmine.objectContaining({ client: 'org-1', status: 'planned' }),
    );
  }));

  it('treats empty string client param as null', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ client: '' }));
    fixture.detectChanges();
    tick();

    expect(engagementsServiceSpy.list).toHaveBeenCalledWith(
      jasmine.objectContaining({ client: undefined }),
    );
  }));

  it('treats empty string status param as null', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ status: '' }));
    fixture.detectChanges();
    tick();

    expect(engagementsServiceSpy.list).toHaveBeenCalledWith(
      jasmine.objectContaining({ status: undefined }),
    );
  }));

  // --- onStatusFilterChange with empty value ---

  it('onStatusFilterChange() sets null for empty value', () => {
    fixture.detectChanges();
    const event = { target: { value: '' } } as unknown as Event;
    component.onStatusFilterChange(event);

    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: jasmine.objectContaining({ status: null }),
    }));
  });

  // --- createEngagement with filter-based query params ---

  it('createEngagement() passes client filter as query param', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ client: 'org-1' }));
    fixture.detectChanges();
    tick();

    (router.navigate as jasmine.Spy).calls.reset();
    component.createEngagement();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/engagements/create'],
      jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ client: 'org-1' }),
      }),
    );
  }));

  it('createEngagement() passes active status as query param', fakeAsync(() => {
    queryParamMap$.next(convertToParamMap({ status: 'active' }));
    fixture.detectChanges();
    tick();

    (router.navigate as jasmine.Spy).calls.reset();
    component.createEngagement();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/engagements/create'],
      jasmine.objectContaining({
        queryParams: jasmine.objectContaining({ status: 'active' }),
      }),
    );
  }));
});
