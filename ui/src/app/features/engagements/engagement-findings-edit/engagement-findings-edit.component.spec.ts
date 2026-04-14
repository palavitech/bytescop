import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { EngagementFindingsEditComponent } from './engagement-findings-edit.component';
import { EngagementsService } from '../services/engagements.service';
import { FindingsService } from '../services/findings.service';
import { SowService } from '../services/sow.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { Engagement } from '../models/engagement.model';
import { Finding } from '../models/finding.model';

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-1', name: 'Test Engagement', client_id: 'client-1', client_name: 'Acme Corp',
  status: 'active', description: 'desc', notes: '', start_date: '2026-01-01', end_date: '2026-03-01',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  findings_summary: null, engagement_type: 'general', project_id: null, project_name: null,
};

const MOCK_FINDING: Finding = {
  id: 'find-1', engagement_id: 'eng-1', asset_id: 'asset-1', asset_name: 'WebApp Main',
  title: 'SQL Injection in Login', severity: 'high', assessment_area: 'application_security',
  owasp_category: 'A03:2021', cwe_id: 'CWE-89', status: 'open',
  description_md: '# Description\nSQL injection found.',
  recommendation_md: '# Recommendation\nUse parameterized queries.',
  is_draft: false, sample_id: null, sample_name: '', analysis_type: '', analysis_check_key: '',
  execution_status: '', created_at: '2026-01-15T00:00:00Z', updated_at: '2026-01-15T00:00:00Z',
};

const MOCK_DRAFT_FINDING: Finding = { ...MOCK_FINDING, is_draft: true };

function buildTestBed(routeParams: Record<string, string> = { id: 'eng-1', findingId: 'find-1' }) {
  const paramMap$ = new BehaviorSubject(convertToParamMap(routeParams));
  const locationSpy = jasmine.createSpyObj('Location', ['back']);
  const engSvc = jasmine.createSpyObj('EngagementsService', ['getById']);
  const findSvc = jasmine.createSpyObj('FindingsService', ['getById', 'update', 'uploadImage']);
  const sowSvc = jasmine.createSpyObj('SowService', ['listScope']);
  const notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);

  engSvc.getById.and.returnValue(of(MOCK_ENGAGEMENT));
  findSvc.getById.and.returnValue(of(MOCK_FINDING));
  sowSvc.listScope.and.returnValue(of([]));

  return {
    paramMap$, locationSpy, engSvc, findSvc, sowSvc, notifySpy,
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: Location, useValue: locationSpy },
      { provide: EngagementsService, useValue: engSvc },
      { provide: FindingsService, useValue: findSvc },
      { provide: SowService, useValue: sowSvc },
      { provide: NotificationService, useValue: notifySpy },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: paramMap$, snapshot: { paramMap: convertToParamMap(routeParams) } },
      },
    ],
  };
}

describe('EngagementFindingsEditComponent', () => {
  let component: EngagementFindingsEditComponent;
  let fixture: ComponentFixture<EngagementFindingsEditComponent>;
  let router: Router;
  let locationSpy: jasmine.SpyObj<Location>;
  let engagementsService: jasmine.SpyObj<EngagementsService>;
  let findingsService: jasmine.SpyObj<FindingsService>;
  let sowService: jasmine.SpyObj<SowService>;
  let notify: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    const ctx = buildTestBed();
    locationSpy = ctx.locationSpy;
    engagementsService = ctx.engSvc;
    findingsService = ctx.findSvc;
    sowService = ctx.sowSvc;
    notify = ctx.notifySpy;

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx.providers,
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementFindingsEditComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- Data loading ---

  it('loads engagement on init', () => {
    fixture.detectChanges();
    expect(engagementsService.getById).toHaveBeenCalledWith('eng-1');
  });

  it('loads finding on init', () => {
    fixture.detectChanges();
    expect(findingsService.getById).toHaveBeenCalledWith('eng-1', 'find-1');
  });

  it('loads scope assets on init', () => {
    fixture.detectChanges();
    expect(sowService.listScope).toHaveBeenCalledWith('eng-1');
  });

  // --- Finding data pre-fill ---

  it('builds standardInitialData from finding', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.standardInitialData).toEqual(jasmine.objectContaining({
      title: 'SQL Injection in Login',
      assessment_area: 'application_security',
      severity: 'high',
      status: 'open',
      asset_id: 'asset-1',
      description_md: '# Description\nSQL injection found.',
    }));
  }));

  it('sets isDraft$ from finding data', fakeAsync(() => {
    findingsService.getById.and.returnValue(of(MOCK_DRAFT_FINDING));

    // Reset to use draft finding
    TestBed.resetTestingModule();
    const ctx = buildTestBed();
    ctx.findSvc.getById.and.returnValue(of(MOCK_DRAFT_FINDING));
    ctx.engSvc.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    ctx.sowSvc.listScope.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsEditComponent);
    fix.detectChanges();
    tick();

    let draft: boolean | undefined;
    fix.componentInstance.isDraft$.subscribe(v => (draft = v));
    expect(draft).toBe(true);
  }));

  it('does not set standardInitialData when finding is null', fakeAsync(() => {
    findingsService.getById.and.returnValue(of(null as any));
    fixture.detectChanges();
    tick();

    expect(component.standardInitialData).toBeNull();
  }));

  // --- Template rendering ---

  it('renders "Edit Finding" title', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const h1 = fixture.nativeElement.querySelector('.bc-h1');
    expect(h1?.textContent).toContain('Edit Finding');
  }));

  it('renders engagement name in metadata', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const metaValues = fixture.nativeElement.querySelectorAll('.bc-metaValue');
    const texts = Array.from(metaValues).map((el: any) => el.textContent.trim());
    expect(texts).toContain('Test Engagement');
  }));

  it('renders organization name in metadata', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const metaValues = fixture.nativeElement.querySelectorAll('.bc-metaValue');
    const texts = Array.from(metaValues).map((el: any) => el.textContent.trim());
    expect(texts).toContain('Acme Corp');
  }));

  // --- Navigation ---

  it('cancel() navigates to view finding page when both IDs present', () => {
    component.cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings', 'find-1']);
  });

  it('goBack() calls location.back()', () => {
    component.goBack();
    expect(locationSpy.back).toHaveBeenCalled();
  });

  it('toggleHelp() toggles showHelp flag', () => {
    expect(component.showHelp).toBe(false);
    component.toggleHelp();
    expect(component.showHelp).toBe(true);
    component.toggleHelp();
    expect(component.showHelp).toBe(false);
  });

  // --- Help aside ---

  it('shows help aside when Help button is clicked', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.bc-helpPane')).toBeNull();
    const helpBtn = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Help'));
    helpBtn?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.bc-helpPane')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.bc-helpTitle')?.textContent).toContain('Edit Finding');
  }));

  // --- isDirty ---

  it('isDirty() returns false by default', () => {
    expect(component.isDirty()).toBe(false);
  });

  it('isDirty() returns true when child reports dirty', () => {
    component.onDirtyChange(true);
    expect(component.isDirty()).toBe(true);
  });

  // --- onBeforeUnload ---

  it('onBeforeUnload calls preventDefault when dirty', () => {
    component.onDirtyChange(true);
    const event = new Event('beforeunload') as BeforeUnloadEvent;
    spyOn(event, 'preventDefault');
    component.onBeforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('onBeforeUnload does not call preventDefault when clean', () => {
    const event = new Event('beforeunload') as BeforeUnloadEvent;
    spyOn(event, 'preventDefault');
    component.onBeforeUnload(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  // --- onStandardFindingSubmitted ---

  it('onStandardFindingSubmitted calls findingsService.update and navigates', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    component.onStandardFindingSubmitted({
      title: 'Updated Title', assessment_area: 'application_security', owasp_category: '',
      cwe_id: '', severity: 'high', status: 'open', asset_id: 'asset-1',
      description_md: '# Updated', recommendation_md: '', is_draft: false,
    });
    tick();

    expect(findingsService.update).toHaveBeenCalledWith('eng-1', 'find-1', jasmine.objectContaining({
      title: 'Updated Title', severity: 'high',
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings', 'find-1']);
  }));

  it('onStandardFindingSubmitted shows error on API failure', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ error: { detail: 'Server error' } })));
    fixture.detectChanges();
    tick();

    component.onStandardFindingSubmitted({
      title: 'X', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();

    expect(notify.error).toHaveBeenCalledWith('Server error');
    expect(component.busy).toBe(false);
  }));

  it('onStandardFindingSubmitted shows fallback error', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ error: {} })));
    fixture.detectChanges();
    tick();

    component.onStandardFindingSubmitted({
      title: 'X', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();

    expect(notify.error).toHaveBeenCalledWith('Update failed.');
  }));

  it('onStandardFindingSubmitted suppresses notification on 402', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ status: 402, error: { detail: 'Payment required' } })));
    fixture.detectChanges();
    tick();

    component.onStandardFindingSubmitted({
      title: 'X', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();

    expect(notify.error).not.toHaveBeenCalled();
  }));

  it('onStandardFindingSubmitted resets busy after API call', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    expect(component.busy).toBe(false);
    component.onStandardFindingSubmitted({
      title: 'X', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();
    expect(component.busy).toBe(false);
  }));

  it('onStandardFindingSubmitted publishes draft (is_draft=false)', fakeAsync(async () => {
    const ctx2 = buildTestBed();
    ctx2.findSvc.getById.and.returnValue(of(MOCK_DRAFT_FINDING));
    ctx2.findSvc.update.and.returnValue(of(MOCK_FINDING));
    ctx2.engSvc.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    ctx2.sowSvc.listScope.and.returnValue(of([]));

    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx2.providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsEditComponent);
    const comp2 = fix2.componentInstance;
    const rt = TestBed.inject(Router);
    spyOn(rt, 'navigate');
    fix2.detectChanges();
    tick();

    expect(comp2.isDraft$.value).toBe(true);

    comp2.onStandardFindingSubmitted({
      title: 'X', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();

    const args = ctx2.findSvc.update.calls.mostRecent().args[2];
    expect(args.is_draft).toBe(false);
    expect(comp2.isDraft$.value).toBe(false);
  }));

  it('onStandardFindingSubmitted saves draft (is_draft=true)', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    component.isDraft$.next(true);
    fixture.detectChanges();
    tick();

    component.onStandardFindingSubmitted({
      title: 'X', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: true,
    });
    tick();

    const args = findingsService.update.calls.mostRecent().args[2];
    expect(args.is_draft).toBe(true);
  }));

  // --- onMalwareFindingSubmitted ---

  it('onMalwareFindingSubmitted calls findingsService.update and navigates', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    component.onMalwareFindingSubmitted({
      title: 'Malware Finding', sample_id: 'sample-1', analysis_type: 'static',
      description_md: '', is_draft: false,
    });
    tick();

    expect(findingsService.update).toHaveBeenCalledWith('eng-1', 'find-1', jasmine.objectContaining({
      title: 'Malware Finding', sample_id: 'sample-1',
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings', 'find-1']);
  }));

  it('onMalwareFindingSubmitted shows error on API failure', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ error: { detail: 'Sample not found' } })));
    fixture.detectChanges();
    tick();

    component.onMalwareFindingSubmitted({
      title: 'M', sample_id: 's-1', analysis_type: 'static', description_md: '', is_draft: false,
    });
    tick();

    expect(notify.error).toHaveBeenCalledWith('Sample not found');
    expect(component.busy).toBe(false);
  }));

  it('onMalwareFindingSubmitted does nothing when IDs are missing', fakeAsync(async () => {
    const ctx2 = buildTestBed({});
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx2.providers,
    }).compileComponents();
    const fix2 = TestBed.createComponent(EngagementFindingsEditComponent);

    fix2.componentInstance.onMalwareFindingSubmitted({
      title: 'M', sample_id: 's-1', analysis_type: 'static', description_md: '', is_draft: false,
    });
    tick();
    expect(ctx2.findSvc.update).not.toHaveBeenCalled();
  }));

  // --- Malware flow ---

  it('sets isMalwareFlow true for malware_analysis engagement', fakeAsync(() => {
    engagementsService.getById.and.returnValue(of({ ...MOCK_ENGAGEMENT, engagement_type: 'malware_analysis' }));
    fixture.detectChanges();
    tick();
    expect(component.isMalwareFlow).toBe(true);
  }));

  it('sets isMalwareFlow false for general engagement', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(component.isMalwareFlow).toBe(false);
  }));

  it('builds malwareInitialData when finding has sample_id', fakeAsync(() => {
    findingsService.getById.and.returnValue(of({ ...MOCK_FINDING, sample_id: 'sample-1' }));

    TestBed.resetTestingModule();
    const ctx = buildTestBed();
    ctx.findSvc.getById.and.returnValue(of({ ...MOCK_FINDING, sample_id: 'sample-1' }));
    ctx.engSvc.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    ctx.sowSvc.listScope.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsEditComponent);
    fix.detectChanges();
    tick();

    expect(fix.componentInstance.malwareInitialData).toEqual(jasmine.objectContaining({
      sample_id: 'sample-1',
    }));
  }));
});

// --- Cancel with various route params ---

describe('EngagementFindingsEditComponent cancel()', () => {
  it('navigates to findings list when only engagementId present', async () => {
    const ctx = buildTestBed({ id: 'eng-1' });
    await TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsEditComponent);
    const rt = TestBed.inject(Router);
    spyOn(rt, 'navigate');
    fix.componentInstance.cancel();
    expect(rt.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings']);
  });

  it('navigates to engagements when no IDs present', async () => {
    const ctx = buildTestBed({});
    await TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsEditComponent);
    const rt = TestBed.inject(Router);
    spyOn(rt, 'navigate');
    fix.componentInstance.cancel();
    expect(rt.navigate).toHaveBeenCalledWith(['/engagements']);
  });
});
