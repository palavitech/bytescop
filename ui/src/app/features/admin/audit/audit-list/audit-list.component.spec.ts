import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { AuditListComponent } from './audit-list.component';
import { AuditService } from '../services/audit.service';
import {
  AuditListResponse,
  AuditSummary,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_COLORS,
} from '../models/audit-log.model';
import { MembersService } from '../../users/services/members.service';
import { TenantMember } from '../../users/models/member.model';

const MOCK_LIST_RESPONSE: AuditListResponse = {
  results: [
    {
      id: 1,
      action: 'create',
      resource_type: 'finding',
      resource_id: 'f-1',
      resource_repr: 'XSS in Search',
      actor_email: 'alice@example.com',
      ip_address: '10.0.0.1',
      timestamp: '2026-03-01T12:00:00Z',
    },
  ],
  count: 1,
  page: 1,
  page_size: 50,
  num_pages: 1,
};

const MOCK_EMPTY_RESPONSE: AuditListResponse = {
  results: [],
  count: 0,
  page: 1,
  page_size: 50,
  num_pages: 1,
};

const MOCK_PAGED_RESPONSE: AuditListResponse = {
  results: [MOCK_LIST_RESPONSE.results[0]],
  count: 250,
  page: 3,
  page_size: 50,
  num_pages: 5,
};

const MOCK_SUMMARY: AuditSummary = {
  total: 5,
  by_action: { create: 3, update: 2 },
  by_resource_type: { finding: 5 },
  by_actor: [{ actor_email: 'alice@example.com', count: 5 }],
  by_date: [],
  findings_by_user_eng: {
    actors: ['alice@example.com'],
    engagements: ['Pentest Q1'],
    matrix: [[3]],
  },
  disruptive_by_user_eng: {
    actors: ['alice@example.com'],
    engagements: ['Pentest Q1'],
    matrix: [[1]],
  },
  engagement_actions_by_user: {
    actors: ['alice@example.com'],
    actions: ['create', 'update'],
    matrix: [[2], [1]],
  },
  finding_actions_by_user: {
    actors: ['alice@example.com'],
    actions: ['create'],
    matrix: [[3]],
  },
  actions_by_ip: {
    ips: ['10.0.0.1'],
    counts: [5],
  },
  eng_id_map: { 'Pentest Q1': 'eng-1' },
};

const MOCK_EMPTY_SUMMARY: AuditSummary = {
  total: 0,
  by_action: {},
  by_resource_type: {},
  by_actor: [],
  by_date: [],
  findings_by_user_eng: { actors: [], engagements: [], matrix: [] },
  disruptive_by_user_eng: { actors: [], engagements: [], matrix: [] },
  engagement_actions_by_user: { actors: [], actions: [], matrix: [] },
  finding_actions_by_user: { actors: [], actions: [], matrix: [] },
  actions_by_ip: { ips: [], counts: [] },
  eng_id_map: {},
};

const MOCK_MEMBER: TenantMember = {
  id: 'm1',
  user: {
    id: 'u1',
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    phone: '',
    timezone: '',
    avatar_url: null,
    mfa_enabled: false,
  },
  role: 'member',
  is_active: true,
  invite_status: 'none' as const,
  groups: [],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

function buildTestBed() {
  const locationSpy = jasmine.createSpyObj('Location', ['back']);
  const auditSvc = jasmine.createSpyObj('AuditService', ['list', 'summary']);
  const membersSvc = jasmine.createSpyObj('MembersService', ['list']);

  auditSvc.list.and.returnValue(of(MOCK_LIST_RESPONSE));
  auditSvc.summary.and.returnValue(of(MOCK_SUMMARY));
  membersSvc.list.and.returnValue(of([MOCK_MEMBER]));

  return {
    locationSpy,
    auditSvc,
    membersSvc,
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Location, useValue: locationSpy },
      { provide: AuditService, useValue: auditSvc },
      { provide: MembersService, useValue: membersSvc },
    ],
  };
}

describe('AuditListComponent', () => {
  let component: AuditListComponent;
  let fixture: ComponentFixture<AuditListComponent>;
  let auditService: jasmine.SpyObj<AuditService>;
  let membersSvc: jasmine.SpyObj<MembersService>;
  let locationSpy: jasmine.SpyObj<Location>;

  beforeEach(async () => {
    const ctx = buildTestBed();
    auditService = ctx.auditSvc;
    membersSvc = ctx.membersSvc;
    locationSpy = ctx.locationSpy;

    await TestBed.configureTestingModule({
      imports: [AuditListComponent],
      providers: ctx.providers,
    }).compileComponents();

    fixture = TestBed.createComponent(AuditListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── vm$ observable ──

  it('should load data via vm$ on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(auditService.list).toHaveBeenCalled();
  }));

  it('vm$ should map response to ready state', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => vm = v);
    tick();

    expect(vm.state).toBe('ready');
    expect(vm.entries.length).toBe(1);
    expect(vm.count).toBe(1);
    expect(vm.page).toBe(1);
    expect(vm.numPages).toBe(1);
  }));

  it('vm$ should return error state on service failure', fakeAsync(() => {
    auditService.list.and.returnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => vm = v);
    tick();

    expect(vm.state).toBe('error');
    expect(vm.entries).toEqual([]);
    expect(vm.count).toBe(0);
  }));

  // ── goBack ──

  it('goBack should call location.back()', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  // ── toggleHelp ──

  it('toggleHelp should toggle showHelp and close filters', () => {
    component.showFilters = true;
    component.toggleHelp();

    expect(component.showHelp).toBe(true);
    expect(component.showFilters).toBe(false);

    component.toggleHelp();
    expect(component.showHelp).toBe(false);
  });

  it('toggleHelp when showHelp becomes false should not close filters', () => {
    component.showHelp = true;
    component.showFilters = true;
    component.toggleHelp();

    // showHelp toggled to false, showFilters should remain true
    // because the if-check only fires when showHelp becomes true
    expect(component.showHelp).toBe(false);
    expect(component.showFilters).toBe(true);
  });

  // ── toggleFilters ──

  it('toggleFilters should toggle showFilters and close help', () => {
    component.showHelp = true;
    component.toggleFilters();

    expect(component.showFilters).toBe(true);
    expect(component.showHelp).toBe(false);
  });

  it('toggleFilters should load members when opening for the first time', () => {
    component.toggleFilters();

    expect(membersSvc.list).toHaveBeenCalled();
  });

  it('toggleFilters should not reload members if already loaded', () => {
    component.members = [MOCK_MEMBER];
    component.toggleFilters();

    expect(membersSvc.list).not.toHaveBeenCalled();
  });

  it('toggleFilters off should not load members', () => {
    component.showFilters = true;
    component.toggleFilters();

    expect(component.showFilters).toBe(false);
    expect(membersSvc.list).not.toHaveBeenCalled();
  });

  // ── toggleSummary ──

  it('toggleSummary should set showSummary and load charts', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    component.toggleSummary();
    expect(component.showSummary).toBe(true);

    tick();
    fixture.detectChanges();

    expect(auditService.summary).toHaveBeenCalled();
  }));

  it('toggleSummary off should destroy charts', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    component.toggleSummary(); // on
    tick();
    fixture.detectChanges();

    component.toggleSummary(); // off
    expect(component.showSummary).toBe(false);

    const comp = component as any;
    expect(comp.engActionsChart).toBeNull();
    expect(comp.findingActionsChart).toBeNull();
    expect(comp.actionsByIpChart).toBeNull();
    expect(comp.actorChart).toBeNull();
  }));

  // ── refresh ──

  it('refresh should trigger a new data load', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    auditService.list.calls.reset();
    component.refresh();
    tick();

    expect(auditService.list).toHaveBeenCalled();
  }));

  // ── applyFilters ──

  it('applyFilters should build filters object from fields', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    auditService.list.calls.reset();

    component.filterActor = 'u1';
    component.filterAction = 'create';
    component.filterResourceType = 'finding';
    component.filterDateFrom = '2026-01-01';
    component.filterDateTo = '2026-03-01';
    component.filterResourceId = 'f-1';
    component.filterEngagement = 'eng-1';
    component.filterIpAddress = '10.0.0.1';

    component.applyFilters();
    tick();

    expect(auditService.list).toHaveBeenCalledWith(
      {
        actor: 'u1',
        action: 'create',
        resource_type: 'finding',
        date_from: '2026-01-01',
        date_to: '2026-03-01',
        resource_id: 'f-1',
        engagement: 'eng-1',
        ip_address: '10.0.0.1',
      },
      1,
      50
    );
  }));

  it('applyFilters should omit empty fields', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    auditService.list.calls.reset();

    component.filterAction = 'delete';
    component.applyFilters();
    tick();

    expect(auditService.list).toHaveBeenCalledWith({ action: 'delete' }, 1, 50);
  }));

  // ── clearFilters ──

  it('clearFilters should reset all filter fields', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.filterActor = 'u1';
    component.filterAction = 'create';
    component.filterResourceType = 'finding';
    component.filterDateFrom = '2026-01-01';
    component.filterDateTo = '2026-03-01';
    component.filterResourceId = 'f-1';
    component.filterEngagement = 'eng-1';
    component.filterEngagementName = 'Pentest Q1';
    component.filterIpAddress = '10.0.0.1';

    component.clearFilters();

    expect(component.filterActor).toBe('');
    expect(component.filterAction).toBe('');
    expect(component.filterResourceType).toBe('');
    expect(component.filterDateFrom).toBe('');
    expect(component.filterDateTo).toBe('');
    expect(component.filterResourceId).toBe('');
    expect(component.filterEngagement).toBe('');
    expect(component.filterEngagementName).toBe('');
    expect(component.filterIpAddress).toBe('');
  }));

  // ── clearFilter (individual) ──

  it('clearFilter should clear a single filter field and re-apply', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.filterActor = 'u1';
    component.filterAction = 'create';

    auditService.list.calls.reset();
    component.clearFilter('actor');
    tick();

    expect(component.filterActor).toBe('');
    expect(auditService.list).toHaveBeenCalledWith({ action: 'create' }, 1, 50);
  }));

  it('clearFilter engagement should also clear filterEngagementName', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.filterEngagement = 'eng-1';
    component.filterEngagementName = 'Pentest Q1';

    component.clearFilter('engagement');

    expect(component.filterEngagement).toBe('');
    expect(component.filterEngagementName).toBe('');
  }));

  it('clearFilter should work for all field types', () => {
    const fields: Array<'actor' | 'action' | 'resourceType' | 'dateFrom' | 'dateTo' | 'resourceId' | 'engagement' | 'ipAddress'> = [
      'actor', 'action', 'resourceType', 'dateFrom', 'dateTo', 'resourceId', 'engagement', 'ipAddress',
    ];

    component.filterActor = 'x';
    component.filterAction = 'x';
    component.filterResourceType = 'x';
    component.filterDateFrom = 'x';
    component.filterDateTo = 'x';
    component.filterResourceId = 'x';
    component.filterEngagement = 'x';
    component.filterIpAddress = 'x';

    for (const field of fields) {
      // Just verify it doesn't throw
      expect(() => component.clearFilter(field)).not.toThrow();
    }
  });

  // ── hasActiveFilters ──

  it('hasActiveFilters should return false when no filters set', () => {
    expect(component.hasActiveFilters).toBe(false);
  });

  it('hasActiveFilters should return true when any filter is set', () => {
    component.filterActor = 'u1';
    expect(component.hasActiveFilters).toBe(true);
  });

  it('hasActiveFilters should detect each filter field individually', () => {
    component.filterAction = 'create';
    expect(component.hasActiveFilters).toBe(true);
    component.filterAction = '';

    component.filterResourceType = 'finding';
    expect(component.hasActiveFilters).toBe(true);
    component.filterResourceType = '';

    component.filterDateFrom = '2026-01-01';
    expect(component.hasActiveFilters).toBe(true);
    component.filterDateFrom = '';

    component.filterDateTo = '2026-03-01';
    expect(component.hasActiveFilters).toBe(true);
    component.filterDateTo = '';

    component.filterResourceId = 'f-1';
    expect(component.hasActiveFilters).toBe(true);
    component.filterResourceId = '';

    component.filterEngagement = 'eng-1';
    expect(component.hasActiveFilters).toBe(true);
    component.filterEngagement = '';

    component.filterIpAddress = '10.0.0.1';
    expect(component.hasActiveFilters).toBe(true);
  });

  // ── actorEmail ──

  it('actorEmail should return empty string when no filterActor', () => {
    expect(component.actorEmail).toBe('');
  });

  it('actorEmail should return email from loaded members', () => {
    component.members = [MOCK_MEMBER];
    component.filterActor = 'u1';
    expect(component.actorEmail).toBe('alice@example.com');
  });

  it('actorEmail should return raw filterActor when member not found', () => {
    component.members = [MOCK_MEMBER];
    component.filterActor = 'unknown-id';
    expect(component.actorEmail).toBe('unknown-id');
  });

  // ── getActionLabel ──

  it('getActionLabel should return label for known action', () => {
    expect(component.getActionLabel('create')).toBe('Create');
    expect(component.getActionLabel('delete')).toBe('Delete');
    expect(component.getActionLabel('login_failed')).toBe('Login Failed');
  });

  it('getActionLabel should return raw action for unknown action', () => {
    expect(component.getActionLabel('unknown_action')).toBe('unknown_action');
  });

  // ── getActionColor ──

  it('getActionColor should return color for known action', () => {
    expect(component.getActionColor('create')).toBe('success');
    expect(component.getActionColor('delete')).toBe('danger');
    expect(component.getActionColor('update')).toBe('info');
  });

  it('getActionColor should return secondary for unknown action', () => {
    expect(component.getActionColor('unknown')).toBe('secondary');
  });

  // ── Pagination: onPageSizeChange ──

  it('onPageSizeChange should reset page to 1 and update pageSize', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    auditService.list.calls.reset();
    component.onPageSizeChange(100);
    tick();

    expect(auditService.list).toHaveBeenCalledWith({}, 1, 100);
  }));

  // ── Pagination: goToPage ──

  it('goToPage should change page', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    auditService.list.calls.reset();
    component.goToPage(3);
    tick();

    expect(auditService.list).toHaveBeenCalledWith({}, 3, 50);
  }));

  // ── Pagination: nextPage ──

  it('nextPage should increment page when not on last page', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    const vm = { page: 2, numPages: 5 } as any;
    auditService.list.calls.reset();
    component.nextPage(vm);
    tick();

    expect(auditService.list).toHaveBeenCalledWith({}, 3, 50);
  }));

  it('nextPage should not increment when on last page', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    const vm = { page: 5, numPages: 5 } as any;
    auditService.list.calls.reset();
    component.nextPage(vm);
    tick();

    expect(auditService.list).not.toHaveBeenCalled();
  }));

  // ── Pagination: prevPage ──

  it('prevPage should decrement page when not on first page', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    const vm = { page: 3, numPages: 5 } as any;
    auditService.list.calls.reset();
    component.prevPage(vm);
    tick();

    expect(auditService.list).toHaveBeenCalledWith({}, 2, 50);
  }));

  it('prevPage should not decrement when on first page', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    const vm = { page: 1, numPages: 5 } as any;
    auditService.list.calls.reset();
    component.prevPage(vm);
    tick();

    expect(auditService.list).not.toHaveBeenCalled();
  }));

  // ── getPageRange ──

  it('getPageRange should return simple array for <= 7 pages', () => {
    expect(component.getPageRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(component.getPageRange(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(component.getPageRange(1, 1)).toEqual([1]);
  });

  it('getPageRange should add ellipsis for page near start', () => {
    const range = component.getPageRange(2, 10);
    expect(range[0]).toBe(1);
    expect(range).toContain(2);
    expect(range).toContain(3);
    expect(range[range.length - 1]).toBe(10);
    // Should contain null (ellipsis) before end
    expect(range).toContain(null);
  });

  it('getPageRange should add ellipsis for page near end', () => {
    const range = component.getPageRange(9, 10);
    expect(range[0]).toBe(1);
    expect(range[range.length - 1]).toBe(10);
    expect(range).toContain(null);
    expect(range).toContain(9);
  });

  it('getPageRange should add two ellipses for page in middle', () => {
    const range = component.getPageRange(5, 10);
    expect(range[0]).toBe(1);
    expect(range[range.length - 1]).toBe(10);
    // Should have null on both sides of middle page
    const nulls = range.filter(p => p === null);
    expect(nulls.length).toBe(2);
    expect(range).toContain(5);
  });

  it('getPageRange at page 3 of 10 should not add left ellipsis', () => {
    const range = component.getPageRange(3, 10);
    expect(range[0]).toBe(1);
    // page 3 => page > 3 is false, so no left ellipsis
    expect(range[1]).not.toBeNull();
  });

  // ── Visualization charts ──

  it('toggleSummary renders Chart.js instances on canvas elements', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    component.toggleSummary();
    fixture.detectChanges();

    tick();
    tick();
    fixture.detectChanges();

    const canvases = fixture.nativeElement.querySelectorAll('.bc-summaryChart canvas');
    expect(canvases.length).toBe(4);

    const comp = component as any;
    expect(comp.engActionsChart).not.toBeNull();
    expect(comp.findingActionsChart).not.toBeNull();
    expect(comp.actionsByIpChart).not.toBeNull();
    expect(comp.actorChart).not.toBeNull();
  }));

  it('should handle empty summary data gracefully', fakeAsync(() => {
    auditService.summary.and.returnValue(of(MOCK_EMPTY_SUMMARY));

    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    component.toggleSummary();
    fixture.detectChanges();
    tick();
    tick();
    fixture.detectChanges();

    expect(component.chartHasData['engActions']).toBe(false);
    expect(component.chartHasData['findingActions']).toBe(false);
    expect(component.chartHasData['actionsByIp']).toBe(false);
    expect(component.chartHasData['topActors']).toBe(false);
  }));

  it('should handle summary API error gracefully', fakeAsync(() => {
    auditService.summary.and.returnValue(throwError(() => new Error('fail')));

    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    component.toggleSummary();
    fixture.detectChanges();
    tick();
    tick();
    fixture.detectChanges();

    // Should fallback to empty data
    expect(component.chartHasData['engActions']).toBe(false);
    expect(component.summaryLoading).toBe(false);
  }));

  // ── prepareChartFlags (private, tested via toggleSummary) ──

  it('should set chartHasData flags based on summary data', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    component.toggleSummary();
    fixture.detectChanges();
    tick();
    tick();
    fixture.detectChanges();

    expect(component.chartHasData['engActions']).toBe(true);
    expect(component.chartHasData['findingActions']).toBe(true);
    expect(component.chartHasData['actionsByIp']).toBe(true);
    expect(component.chartHasData['topActors']).toBe(true);
  }));

  // ── ngOnDestroy ──

  it('ngOnDestroy should clean up charts and subscriptions', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    component.toggleSummary();
    fixture.detectChanges();
    tick();
    tick();
    fixture.detectChanges();

    // Should not throw
    expect(() => component.ngOnDestroy()).not.toThrow();

    const comp = component as any;
    expect(comp.engActionsChart).toBeNull();
    expect(comp.summarySub).toBeNull();
  }));

  // ── ensureMembersLoaded (private, tested via toggleFilters + chart click) ──

  it('ensureMembersLoaded should not reload if members exist', () => {
    component.members = [MOCK_MEMBER];
    membersSvc.list.calls.reset();

    // Access private method indirectly via toggleFilters
    component.toggleFilters();

    expect(membersSvc.list).not.toHaveBeenCalled();
  });

  // ── findActorIdByEmail (private) ──

  it('should find actor ID by email from loaded members', () => {
    component.members = [MOCK_MEMBER];
    const result = (component as any).findActorIdByEmail('alice@example.com');
    expect(result).toBe('u1');
  });

  it('should return empty string if actor not found by email', () => {
    component.members = [MOCK_MEMBER];
    const result = (component as any).findActorIdByEmail('unknown@example.com');
    expect(result).toBe('');
  });

  // ── applyChartFilter (private) ──

  it('applyChartFilter engActions should set filters', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.members = [MOCK_MEMBER];
    (component as any).lastSummaryData = MOCK_SUMMARY;

    auditService.list.calls.reset();
    (component as any).applyChartFilter('engActions', 0, 0);
    tick();

    expect(component.filterResourceType).toBe('engagement');
    expect(component.filterAction).toBe('create');
    expect(component.filterActor).toBe('u1');
  }));

  it('applyChartFilter findingActions should set filters', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.members = [MOCK_MEMBER];
    (component as any).lastSummaryData = MOCK_SUMMARY;

    (component as any).applyChartFilter('findingActions', 0, 0);

    expect(component.filterResourceType).toBe('finding');
    expect(component.filterAction).toBe('create');
  }));

  it('applyChartFilter actionsByIp should set IP filter', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    (component as any).lastSummaryData = MOCK_SUMMARY;

    (component as any).applyChartFilter('actionsByIp', 0, 0);

    expect(component.filterIpAddress).toBe('10.0.0.1');
  }));

  it('applyChartFilter topActors should set actor filter', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.members = [MOCK_MEMBER];
    (component as any).lastSummaryData = MOCK_SUMMARY;

    (component as any).applyChartFilter('topActors', 0, 0);

    expect(component.filterActor).toBe('u1');
  }));

  it('applyChartFilter should do nothing with null summary data', () => {
    (component as any).lastSummaryData = null;
    expect(() => (component as any).applyChartFilter('engActions', 0, 0)).not.toThrow();
  });

  // --- ensureMembersLoaded error path ---

  it('ensureMembersLoaded handles error gracefully', fakeAsync(() => {
    component.members = [];
    membersSvc.list.and.returnValue(throwError(() => new Error('fail')));

    let result: any;
    (component as any).ensureMembersLoaded().subscribe((v: any) => result = v);
    tick();

    expect(result).toEqual([]);
  }));

  // --- applyChartFilter with undefined action/ip ---

  it('applyChartFilter engActions does not set action when datasetIndex is out of range', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.members = [MOCK_MEMBER];
    (component as any).lastSummaryData = MOCK_SUMMARY;

    // datasetIndex 99 is out of range for actions array
    component.filterAction = '';
    (component as any).applyChartFilter('engActions', 0, 99);

    // action should not be set since actions[99] is undefined
    expect(component.filterAction).toBe('');
    expect(component.filterResourceType).toBe('engagement');
  }));

  it('applyChartFilter findingActions does not set action when out of range', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.members = [MOCK_MEMBER];
    (component as any).lastSummaryData = MOCK_SUMMARY;

    component.filterAction = '';
    (component as any).applyChartFilter('findingActions', 0, 99);

    expect(component.filterAction).toBe('');
    expect(component.filterResourceType).toBe('finding');
  }));

  it('applyChartFilter actionsByIp does not set IP when dataIndex is out of range', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    (component as any).lastSummaryData = MOCK_SUMMARY;

    component.filterIpAddress = '';
    (component as any).applyChartFilter('actionsByIp', 99, 0);

    expect(component.filterIpAddress).toBe('');
  }));

  it('applyChartFilter topActors does not set actor when dataIndex is out of range', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.members = [MOCK_MEMBER];
    (component as any).lastSummaryData = MOCK_SUMMARY;

    component.filterActor = '';
    (component as any).applyChartFilter('topActors', 99, 0);

    expect(component.filterActor).toBe('');
  }));

  // --- applyChartFilter default case (unrecognized chartId) ---

  it('applyChartFilter with unknown chartId just applies filters', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    (component as any).lastSummaryData = MOCK_SUMMARY;
    auditService.list.calls.reset();
    (component as any).applyChartFilter('unknownChart', 0, 0);
    tick();

    expect(auditService.list).toHaveBeenCalled();
  }));

  // --- getPageRange edge: page at numPages - 2 ---

  it('getPageRange at page numPages-2 should not add right ellipsis', () => {
    const range = component.getPageRange(8, 10);
    expect(range[0]).toBe(1);
    expect(range[range.length - 1]).toBe(10);
    // page 8 = numPages(10) - 2, so page < numPages - 2 is false
    expect(range[range.length - 2]).not.toBeNull();
  });
});
