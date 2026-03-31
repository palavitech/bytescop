import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError, Subject } from 'rxjs';

import { EngagementFindingsViewComponent } from './engagement-findings-view.component';
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
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_FINDING: Finding = {
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
  description_md: '## Description\n\nThis is a **test** finding.',
  recommendation_md: '## Recommendation\n\nFix it.',
  is_draft: false,
  sample_id: null,
  sample_name: '',
  analysis_type: '',
  analysis_check_key: '',
  execution_status: '',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('EngagementFindingsViewComponent', () => {
  let component: EngagementFindingsViewComponent;
  let fixture: ComponentFixture<EngagementFindingsViewComponent>;
  let router: Router;

  let engagementsServiceSpy: jasmine.SpyObj<EngagementsService>;
  let findingsServiceSpy: jasmine.SpyObj<FindingsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;

  beforeEach(async () => {
    engagementsServiceSpy = jasmine.createSpyObj('EngagementsService', ['getById']);
    findingsServiceSpy = jasmine.createSpyObj('FindingsService', ['getById', 'delete']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    engagementsServiceSpy.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    findingsServiceSpy.getById.and.returnValue(of(MOCK_FINDING));

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsViewComponent],
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
            snapshot: {
              paramMap: {
                get: (key: string) => {
                  if (key === 'id') return 'eng-1';
                  if (key === 'findingId') return 'f1';
                  return null;
                },
              },
            },
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementFindingsViewComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('reads engagement and finding ids from route params', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(engagementsServiceSpy.getById).toHaveBeenCalledWith('eng-1');
    expect(findingsServiceSpy.getById).toHaveBeenCalledWith('eng-1', 'f1');
  }));

  it('vm$ emits ready state on success', fakeAsync(() => {
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('ready');
    expect(result.engagement).toEqual(MOCK_ENGAGEMENT);
    expect(result.finding).toEqual(MOCK_FINDING);
  }));

  it('vm$ renders markdown for description and recommendation', fakeAsync(() => {
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    // The SafeHtml should not be empty string
    expect(result.descriptionHtml).toBeTruthy();
    expect(result.recommendationHtml).toBeTruthy();
  }));

  it('vm$ emits missing state on 404', fakeAsync(() => {
    findingsServiceSpy.getById.and.returnValue(throwError(() => ({ status: 404 })));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('missing');
    expect(result.finding).toBeNull();
  }));

  it('vm$ emits error state when finding errors with non-404', fakeAsync(() => {
    findingsServiceSpy.getById.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('error');
    expect(result.finding).toBeNull();
  }));

  it('vm$ emits error state when engagement fails', fakeAsync(() => {
    engagementsServiceSpy.getById.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('error');
    expect(result.engagement).toBeNull();
  }));

  it('vm$ handles empty markdown gracefully', fakeAsync(() => {
    findingsServiceSpy.getById.and.returnValue(of({
      ...MOCK_FINDING,
      description_md: '',
      recommendation_md: '',
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('ready');
    expect(result.descriptionHtml).toBe('');
    expect(result.recommendationHtml).toBe('');
  }));

  it('vm$ handles null markdown gracefully', fakeAsync(() => {
    findingsServiceSpy.getById.and.returnValue(of({
      ...MOCK_FINDING,
      description_md: null as any,
      recommendation_md: null as any,
    }));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('ready');
    expect(result.descriptionHtml).toBe('');
    expect(result.recommendationHtml).toBe('');
  }));

  // --- goBack ---

  it('goBack() calls location.back()', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  // --- toggleHelp ---

  it('toggleHelp() toggles showHelp', () => {
    expect(component.showHelp).toBe(false);
    component.toggleHelp();
    expect(component.showHelp).toBe(true);
    component.toggleHelp();
    expect(component.showHelp).toBe(false);
  });

  // --- refresh ---

  it('refresh() triggers vm$ re-emission', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    engagementsServiceSpy.getById.calls.reset();
    findingsServiceSpy.getById.calls.reset();

    component.refresh();
    tick();

    expect(engagementsServiceSpy.getById).toHaveBeenCalled();
    expect(findingsServiceSpy.getById).toHaveBeenCalled();
  }));

  // --- Delete ---

  it('confirmDelete() sets confirmingDelete$ to true', () => {
    component.confirmDelete();
    expect(component.confirmingDelete$.value).toBe(true);
  });

  it('cancelDelete() sets confirmingDelete$ to false', () => {
    component.confirmDelete();
    component.cancelDelete();
    expect(component.confirmingDelete$.value).toBe(false);
  });

  it('deleteFinding() navigates to findings list on success', fakeAsync(() => {
    findingsServiceSpy.delete.and.returnValue(of(undefined as any));
    fixture.detectChanges();

    component.deleteFinding(MOCK_FINDING);
    tick();

    expect(component.deleting$.value).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings']);
  }));

  it('deleteFinding() shows error with detail on failure', fakeAsync(() => {
    findingsServiceSpy.delete.and.returnValue(
      throwError(() => ({ error: { detail: 'Cannot delete' } })),
    );
    fixture.detectChanges();

    component.deleteFinding(MOCK_FINDING);
    tick();

    expect(component.deleting$.value).toBe(false);
    expect(component.confirmingDelete$.value).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Cannot delete');
  }));

  it('deleteFinding() shows generic error when no detail', fakeAsync(() => {
    findingsServiceSpy.delete.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();

    component.deleteFinding(MOCK_FINDING);
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to delete finding.');
  }));

  it('deleteFinding() sets deleting$ while in progress', fakeAsync(() => {
    const subject = new Subject<void>();
    findingsServiceSpy.delete.and.returnValue(subject.asObservable());
    fixture.detectChanges();

    component.deleteFinding(MOCK_FINDING);
    expect(component.deleting$.value).toBe(true);

    subject.next(undefined);
    subject.complete();
    tick();

    expect(component.deleting$.value).toBe(false);
  }));

  // --- Helper methods ---

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

  // --- Route param fallback ---

  it('defaults ids to empty string when route params are null', async () => {
    await TestBed.resetTestingModule();
    engagementsServiceSpy.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    findingsServiceSpy.getById.and.returnValue(of(MOCK_FINDING));

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsViewComponent],
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
            snapshot: { paramMap: { get: () => null } },
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    const f = TestBed.createComponent(EngagementFindingsViewComponent);
    f.detectChanges();
    expect(engagementsServiceSpy.getById).toHaveBeenCalledWith('');
    expect(findingsServiceSpy.getById).toHaveBeenCalledWith('', '');
  });
});
