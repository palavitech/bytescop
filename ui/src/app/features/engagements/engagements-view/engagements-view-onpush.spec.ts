import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { Subject, of } from 'rxjs';

import { EngagementsViewComponent } from './engagements-view.component';
import { EngagementsService } from '../services/engagements.service';
import { SowService } from '../services/sow.service';
import { FindingsService } from '../services/findings.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { Engagement } from '../models/engagement.model';
import { Finding } from '../models/finding.model';

describe('EngagementsViewComponent OnPush', () => {
  let fixture: ComponentFixture<EngagementsViewComponent>;
  let component: EngagementsViewComponent;
  let markSpy: jasmine.Spy;

  let engagementsServiceSpy: jasmine.SpyObj<EngagementsService>;
  let sowServiceSpy: jasmine.SpyObj<SowService>;
  let findingsServiceSpy: jasmine.SpyObj<FindingsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;

  const mockEngagement: Engagement = {
    id: 'eng-1',
    name: 'Test Engagement',
    client_id: 'client-1',
    client_name: 'Test Client',
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

  const mockFindings: Finding[] = [
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
  ];

  beforeEach(async () => {
    engagementsServiceSpy = jasmine.createSpyObj('EngagementsService', [
      'getById', 'delete',
    ]);
    sowServiceSpy = jasmine.createSpyObj('SowService', ['get', 'listScope']);
    findingsServiceSpy = jasmine.createSpyObj('FindingsService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    // Default stubs
    engagementsServiceSpy.getById.and.returnValue(of(mockEngagement));
    sowServiceSpy.get.and.returnValue(of({ id: 'sow-1', title: 'SOW', status: 'draft' } as any));
    sowServiceSpy.listScope.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [EngagementsViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EngagementsService, useValue: engagementsServiceSpy },
        { provide: SowService, useValue: sowServiceSpy },
        { provide: FindingsService, useValue: findingsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'eng-1' } },
            root: { firstChild: null } as any,
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementsViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // triggers ngOnInit
  });

  function getMarkSpy(): jasmine.Spy {
    return spyOn((component as any).cdr, 'markForCheck');
  }

  it('renderCharts should call markForCheck after findings load', fakeAsync(() => {
    markSpy = getMarkSpy();

    const findingsSubject = new Subject<Finding[]>();
    findingsServiceSpy.list.and.returnValue(findingsSubject.asObservable());

    // toggleSummary calls renderCharts internally
    component.toggleSummary();

    findingsSubject.next(mockFindings);
    findingsSubject.complete();

    // renderCharts uses setTimeout internally for canvas render
    tick(0);

    expect(markSpy).toHaveBeenCalled();
  }));
});
