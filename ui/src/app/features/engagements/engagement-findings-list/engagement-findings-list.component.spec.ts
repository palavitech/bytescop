import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError, BehaviorSubject } from 'rxjs';

import { EngagementFindingsListComponent } from './engagement-findings-list.component';
import { EngagementsService } from '../services/engagements.service';
import { FindingsService } from '../services/findings.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { Engagement } from '../models/engagement.model';
import { Finding } from '../models/finding.model';

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-1',
  name: 'Test Engagement',
  client_id: 'client-1',
  client_name: 'Acme Corp',
  status: 'active',
  description: '',
  notes: '',
  start_date: '2025-01-01',
  end_date: '2025-06-01',
  findings_summary: null,
  engagement_type: 'general',
  project_id: null,
  project_name: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_FINDINGS: Finding[] = [
  {
    id: 'f1',
    engagement_id: 'eng-1',
    asset_id: 'asset-1',
    asset_name: 'Web App',
    title: 'SQL Injection',
    severity: 'critical',
    assessment_area: 'application_security',
    owasp_category: 'A03:2021',
    cwe_id: 'CWE-89',
    status: 'open',
    description_md: '',
    recommendation_md: '',
    is_draft: false,
    sample_id: null,
    sample_name: '',
    analysis_type: '',
    analysis_check_key: '',
    execution_status: '',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'f2',
    engagement_id: 'eng-1',
    asset_id: 'asset-1',
    asset_name: 'Web App',
    title: 'XSS',
    severity: 'high',
    assessment_area: 'application_security',
    owasp_category: 'A03:2021',
    cwe_id: 'CWE-79',
    status: 'triage',
    description_md: '',
    recommendation_md: '',
    is_draft: true,
    sample_id: null,
    sample_name: '',
    analysis_type: '',
    analysis_check_key: '',
    execution_status: '',
    created_at: '2025-01-02T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
  },
];

describe('EngagementFindingsListComponent', () => {
  let component: EngagementFindingsListComponent;
  let fixture: ComponentFixture<EngagementFindingsListComponent>;
  let router: Router;

  let engagementsServiceSpy: jasmine.SpyObj<EngagementsService>;
  let findingsServiceSpy: jasmine.SpyObj<FindingsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;

  let paramMap$: BehaviorSubject<any>;

  beforeEach(async () => {
    engagementsServiceSpy = jasmine.createSpyObj('EngagementsService', [
      'getById',
    ]);
    findingsServiceSpy = jasmine.createSpyObj('FindingsService', ['list', 'delete']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error', 'info']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    engagementsServiceSpy.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    findingsServiceSpy.list.and.returnValue(of(MOCK_FINDINGS));

    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'eng-1' }));

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EngagementsService, useValue: engagementsServiceSpy },
        { provide: FindingsService, useValue: findingsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$,
            snapshot: { paramMap: { get: () => 'eng-1' } },
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementFindingsListComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- vm$ ---

  it('vm$ emits ready state with findings', fakeAsync(() => {
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('ready');
    expect(result.engagement).toEqual(MOCK_ENGAGEMENT);
    expect(result.items).toEqual(MOCK_FINDINGS);
    expect(result.total).toBe(2);
  }));

  it('vm$ emits error state when engagement fails to load', fakeAsync(() => {
    engagementsServiceSpy.getById.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('error');
    expect(result.engagement).toBeNull();
  }));

  it('vm$ uses empty array when findings fail to load', fakeAsync(() => {
    findingsServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('ready');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  }));

  it('vm$ emits timeBar when engagement has dates', fakeAsync(() => {
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    // MOCK_ENGAGEMENT has both start and end dates
    expect(result.timeBar).not.toBeNull();
  }));

  it('vm$ emits null timeBar when engagement has no dates', fakeAsync(() => {
    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      start_date: null,
      end_date: null,
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar).toBeNull();
  }));

  it('vm$ returns null timeBar when end_date only is null', fakeAsync(() => {
    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      end_date: null,
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar).toBeNull();
  }));

  it('vm$ returns null timeBar when dates are invalid', fakeAsync(() => {
    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      start_date: 'not-a-date',
      end_date: 'also-not',
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar).toBeNull();
  }));

  it('vm$ returns null timeBar when end <= start', fakeAsync(() => {
    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      start_date: '2025-06-01',
      end_date: '2025-01-01',
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar).toBeNull();
  }));

  it('vm$ builds timeBar with "Ended" for past engagement', fakeAsync(() => {
    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      start_date: '2020-01-01',
      end_date: '2020-06-01',
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar).not.toBeNull();
    expect(result.timeBar.label).toBe('Ended');
    expect(result.timeBar.percent).toBe(0);
  }));

  it('vm$ builds timeBar with remaining days for future engagement', fakeAsync(() => {
    const futureStart = new Date();
    futureStart.setDate(futureStart.getDate() - 10);
    const futureEnd = new Date();
    futureEnd.setDate(futureEnd.getDate() + 90);

    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      start_date: futureStart.toLocaleDateString('en-CA'),
      end_date: futureEnd.toLocaleDateString('en-CA'),
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar).not.toBeNull();
    expect(result.timeBar.label).toContain('remaining');
    expect(result.timeBar.percent).toBeGreaterThan(0);
  }));

  it('vm$ builds timeBar with "Ends today" for today end date', fakeAsync(() => {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA');
    const pastStart = new Date();
    pastStart.setDate(pastStart.getDate() - 30);

    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      start_date: pastStart.toLocaleDateString('en-CA'),
      end_date: todayStr,
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar).not.toBeNull();
    expect(result.timeBar.label).toBe('Ends today');
  }));

  // --- empty engagementId ---

  it('returns empty findings when engagementId is empty', fakeAsync(() => {
    paramMap$.next(convertToParamMap({}));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.items).toEqual([]);
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

  it('refresh() triggers findings reload', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    findingsServiceSpy.list.calls.reset();
    component.refresh();
    tick();

    expect(findingsServiceSpy.list).toHaveBeenCalled();
  }));

  // --- Filter changes ---

  it('onSeverityFilterChange() updates severity filter', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    findingsServiceSpy.list.calls.reset();
    component.onSeverityFilterChange('critical');
    tick();

    expect(findingsServiceSpy.list).toHaveBeenCalledWith('eng-1', jasmine.objectContaining({
      severity: 'critical',
    }));
  }));

  it('onStatusFilterChange() updates status filter', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    findingsServiceSpy.list.calls.reset();
    component.onStatusFilterChange('open');
    tick();

    expect(findingsServiceSpy.list).toHaveBeenCalledWith('eng-1', jasmine.objectContaining({
      status: 'open',
    }));
  }));

  it('clearAllFilters() resets both filters', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.onSeverityFilterChange('critical');
    component.onStatusFilterChange('open');
    tick();

    findingsServiceSpy.list.calls.reset();
    component.clearAllFilters();
    tick();

    expect(findingsServiceSpy.list).toHaveBeenCalledWith('eng-1', jasmine.objectContaining({
      severity: undefined,
      status: undefined,
    }));
  }));

  // --- prettySeverity ---

  it('prettySeverity() returns label for known severities', () => {
    expect(component.prettySeverity('critical')).toBe('Critical');
    expect(component.prettySeverity('high')).toBe('High');
    expect(component.prettySeverity('medium')).toBe('Medium');
    expect(component.prettySeverity('low')).toBe('Low');
    expect(component.prettySeverity('info')).toBe('Info');
  });

  it('prettySeverity() returns raw string for unknown', () => {
    expect(component.prettySeverity('xyz')).toBe('xyz');
  });

  // --- prettyStatus ---

  it('prettyStatus() returns label for known statuses', () => {
    expect(component.prettyStatus('open')).toBe('Open');
    expect(component.prettyStatus('triage')).toBe('Triage');
    expect(component.prettyStatus('accepted')).toBe('Accepted');
    expect(component.prettyStatus('fixed')).toBe('Fixed');
    expect(component.prettyStatus('false_positive')).toBe('False Positive');
  });

  it('prettyStatus() returns raw string for unknown', () => {
    expect(component.prettyStatus('xyz')).toBe('xyz');
  });

  // --- goToCreate ---

  it('goToCreate() navigates to create route for active engagement', () => {
    component.goToCreate(MOCK_ENGAGEMENT);
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings', 'create']);
  });

  it('goToCreate() shows error for planned engagement', () => {
    component.goToCreate({ ...MOCK_ENGAGEMENT, status: 'planned' });
    expect(notifySpy.error).toHaveBeenCalledWith(
      'This engagement is still in Planned state. Mark it as Active before adding findings.',
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('goToCreate() shows error for completed engagement', () => {
    component.goToCreate({ ...MOCK_ENGAGEMENT, status: 'completed' });
    expect(notifySpy.error).toHaveBeenCalledWith(
      'This engagement is already Completed. Reopen it to add new findings.',
    );
  });

  it('goToCreate() shows error for on_hold engagement', () => {
    component.goToCreate({ ...MOCK_ENGAGEMENT, status: 'on_hold' });
    expect(notifySpy.error).toHaveBeenCalledWith(
      'This engagement is On Hold. Resume it to Active before adding findings.',
    );
  });

  it('goToCreate() does nothing when engagement is null', () => {
    component.goToCreate(null);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(notifySpy.error).not.toHaveBeenCalled();
  });

  it('goToCreate() shows generic error for unknown non-active status', () => {
    component.goToCreate({ ...MOCK_ENGAGEMENT, status: 'unknown' as any });
    expect(notifySpy.error).toHaveBeenCalledWith('Engagement must be Active to add findings.');
  });

  // --- timeBar color thresholds ---

  it('timeBar color is green when > 80% remaining', fakeAsync(() => {
    const start = new Date();
    start.setDate(start.getDate() - 5);
    const end = new Date();
    end.setDate(end.getDate() + 95);

    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      start_date: start.toLocaleDateString('en-CA'),
      end_date: end.toLocaleDateString('en-CA'),
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar.color).toBe('#00c853');
  }));

  it('timeBar color is red when <= 20% remaining', fakeAsync(() => {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    const end = new Date();
    end.setDate(end.getDate() + 2);

    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      start_date: start.toLocaleDateString('en-CA'),
      end_date: end.toLocaleDateString('en-CA'),
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar.color).toBe('#ff1744');
  }));

  it('timeBar uses singular "day" for 1 day remaining', fakeAsync(() => {
    const start = new Date();
    start.setDate(start.getDate() - 90);
    const end = new Date();
    end.setDate(end.getDate() + 1);

    engagementsServiceSpy.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      start_date: start.toLocaleDateString('en-CA'),
      end_date: end.toLocaleDateString('en-CA'),
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.timeBar.label).toBe('1 day remaining');
  }));

  // --- boundRefresh ---

  it('boundRefresh() triggers findings reload', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    findingsServiceSpy.list.calls.reset();
    component.boundRefresh();
    tick();

    expect(findingsServiceSpy.list).toHaveBeenCalled();
  }));
});
