import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { EngagementFindingsCreateComponent } from './engagement-findings-create.component';
import { EngagementsService } from '../services/engagements.service';
import { FindingsService } from '../services/findings.service';
import { SowService } from '../services/sow.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { Engagement } from '../models/engagement.model';
import { Finding } from '../models/finding.model';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-1', name: 'Test Engagement', client_id: 'client-1', client_name: 'Acme Corp',
  status: 'active', description: 'desc', notes: '', start_date: '2026-01-01', end_date: '2026-03-01',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  findings_summary: null, engagement_type: 'general',
};

const MOCK_FINDING: Finding = {
  id: 'find-new', engagement_id: 'eng-1', asset_id: 'asset-1', asset_name: 'WebApp Main',
  title: 'XSS in Search', severity: 'medium', assessment_area: 'application_security',
  owasp_category: 'A03:2021', cwe_id: 'CWE-79', status: 'open', description_md: '', recommendation_md: '',
  is_draft: false, sample_id: null, sample_name: '', analysis_type: '', analysis_check_key: '',
  execution_status: '', created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
};

function buildTestBed(
  routeParams: Record<string, string> = { id: 'eng-1' },
  overrides: { permHas?: boolean } = {},
) {
  const paramMap$ = new BehaviorSubject(convertToParamMap(routeParams));
  const locationSpy = jasmine.createSpyObj('Location', ['back']);
  const engSvc = jasmine.createSpyObj('EngagementsService', ['getById', 'listSamples']);
  const findSvc = jasmine.createSpyObj('FindingsService', ['create', 'uploadImage']);
  const sowSvc = jasmine.createSpyObj('SowService', ['listScope', 'get']);
  const notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
  const permSvc = { has: () => overrides.permHas !== false, hasAny$: () => of(true) };

  engSvc.getById.and.returnValue(of(MOCK_ENGAGEMENT));
  engSvc.listSamples.and.returnValue(of([]));
  sowSvc.listScope.and.returnValue(of([]));
  sowSvc.get.and.returnValue(of({ id: 'sow-1', title: 'Test', status: 'approved', created_at: '', updated_at: '' }));

  return {
    paramMap$, locationSpy, engSvc, findSvc, sowSvc, notifySpy, permSvc,
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: Location, useValue: locationSpy },
      { provide: EngagementsService, useValue: engSvc },
      { provide: FindingsService, useValue: findSvc },
      { provide: SowService, useValue: sowSvc },
      { provide: NotificationService, useValue: notifySpy },
      { provide: PermissionService, useValue: permSvc },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: paramMap$, snapshot: { paramMap: convertToParamMap(routeParams) } },
      },
    ],
  };
}

describe('EngagementFindingsCreateComponent', () => {
  let component: EngagementFindingsCreateComponent;
  let fixture: ComponentFixture<EngagementFindingsCreateComponent>;
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
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    fixture = TestBed.createComponent(EngagementFindingsCreateComponent);
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

  it('loads scope assets on init', () => {
    fixture.detectChanges();
    expect(sowService.listScope).toHaveBeenCalledWith('eng-1');
  });

  // --- Template rendering ---

  it('renders "New Finding" title', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const h1 = fixture.nativeElement.querySelector('.bc-h1');
    expect(h1?.textContent).toContain('New Finding');
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

  it('renders Cancel button', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    const btns = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'));
    const cancelBtn = btns.find(b => b.textContent?.includes('Cancel'));
    expect(cancelBtn).toBeTruthy();
  }));

  // --- Navigation ---

  it('cancel() navigates to findings list when engagementId present', () => {
    component.cancel();
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings']);
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
    expect(fixture.nativeElement.querySelector('.bc-helpTitle')?.textContent).toContain('New Finding');
  }));

  // --- isDirty ---

  it('isDirty() returns false by default', () => {
    expect(component.isDirty()).toBe(false);
  });

  it('isDirty() returns true when child reports dirty', () => {
    component.onDirtyChange(true);
    expect(component.isDirty()).toBe(true);
  });

  it('isDirty() returns false after successful save', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    component.onDirtyChange(true);
    expect(component.isDirty()).toBe(true);

    component.onStandardFindingSubmitted({
      title: 'XSS', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();
    expect(component.isDirty()).toBe(false);
  }));

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

  it('onStandardFindingSubmitted calls findingsService.create and navigates', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();

    component.onStandardFindingSubmitted({
      title: 'XSS in Search', assessment_area: 'application_security', owasp_category: '',
      cwe_id: '', severity: 'medium', status: 'open', asset_id: 'asset-1',
      description_md: '# Details', recommendation_md: '# Fix', is_draft: false,
    });
    tick();

    expect(findingsService.create).toHaveBeenCalledWith('eng-1', jasmine.objectContaining({
      title: 'XSS in Search', severity: 'medium', asset_id: 'asset-1',
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings']);
  }));

  it('onStandardFindingSubmitted shows error on API failure', fakeAsync(() => {
    findingsService.create.and.returnValue(throwError(() => ({ error: { detail: 'Duplicate title' } })));
    fixture.detectChanges();

    component.onStandardFindingSubmitted({
      title: 'XSS', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();

    expect(notify.error).toHaveBeenCalledWith('Duplicate title');
    expect(component.busy).toBe(false);
  }));

  it('onStandardFindingSubmitted shows fallback error', fakeAsync(() => {
    findingsService.create.and.returnValue(throwError(() => ({ error: {} })));
    fixture.detectChanges();

    component.onStandardFindingSubmitted({
      title: 'XSS', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();

    expect(notify.error).toHaveBeenCalledWith('Create failed.');
  }));

  it('onStandardFindingSubmitted suppresses notification on 402', fakeAsync(() => {
    findingsService.create.and.returnValue(throwError(() => ({ status: 402, error: { detail: 'Payment required' } })));
    fixture.detectChanges();

    component.onStandardFindingSubmitted({
      title: 'XSS', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();

    expect(notify.error).not.toHaveBeenCalled();
  }));

  it('onStandardFindingSubmitted sets busy during API call', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();

    expect(component.busy).toBe(false);
    component.onStandardFindingSubmitted({
      title: 'XSS', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    expect(component.busy).toBe(true);
    tick();
  }));

  it('onStandardFindingSubmitted sends is_draft from payload', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();

    component.onStandardFindingSubmitted({
      title: 'Draft', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: '',
      description_md: '', recommendation_md: '', is_draft: true,
    });
    tick();

    const args = findingsService.create.calls.mostRecent().args[1];
    expect(args.is_draft).toBe(true);
  }));

  it('onStandardFindingSubmitted checks findings limit', fakeAsync(async () => {
    const limitEng = { ...MOCK_ENGAGEMENT, findings_summary: { critical: 1, high: 1, medium: 1, low: 0, info: 0 } };
    const ctx2 = buildTestBed();
    ctx2.engSvc.getById.and.returnValue(of(limitEng));

    const profileSpy = jasmine.createSpyObj('UserProfileService', ['currentSubscription']);
    profileSpy.currentSubscription.and.returnValue({
      plan_name: 'community', limits: { max_findings_per_engagement: 3 },
    });

    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: [...ctx2.providers, { provide: UserProfileService, useValue: profileSpy }],
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsCreateComponent);
    fix2.detectChanges();
    tick();

    fix2.componentInstance.onStandardFindingSubmitted({
      title: 'XSS', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();

    expect(ctx2.notifySpy.error).toHaveBeenCalledWith(jasmine.stringMatching(/Findings limit reached/));
    expect(ctx2.findSvc.create).not.toHaveBeenCalled();
  }));

  it('onStandardFindingSubmitted proceeds when under limit', fakeAsync(() => {
    const profileSvc = TestBed.inject(UserProfileService);
    spyOn(profileSvc, 'currentSubscription').and.returnValue({
      plan_name: 'community', limits: { max_findings_per_engagement: 10 },
    } as any);
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();

    component.onStandardFindingSubmitted({
      title: 'XSS', assessment_area: '', owasp_category: '', cwe_id: '',
      severity: 'medium', status: 'open', asset_id: 'a-1',
      description_md: '', recommendation_md: '', is_draft: false,
    });
    tick();

    expect(findingsService.create).toHaveBeenCalled();
  }));

  // --- onMalwareFindingSubmitted ---

  it('onMalwareFindingSubmitted calls findingsService.create and navigates', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();

    component.onMalwareFindingSubmitted({
      title: 'Malware Finding', sample_id: 'sample-1', analysis_type: 'static',
      description_md: '# Malware desc', is_draft: false,
    });
    tick();

    expect(findingsService.create).toHaveBeenCalledWith('eng-1', jasmine.objectContaining({
      title: 'Malware Finding', sample_id: 'sample-1',
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings']);
  }));

  it('onMalwareFindingSubmitted shows error on API failure', fakeAsync(() => {
    findingsService.create.and.returnValue(throwError(() => ({ error: { detail: 'Sample not found' } })));
    fixture.detectChanges();

    component.onMalwareFindingSubmitted({
      title: 'Malware Finding', sample_id: 'sample-1', analysis_type: 'static',
      description_md: '', is_draft: false,
    });
    tick();

    expect(notify.error).toHaveBeenCalledWith('Sample not found');
    expect(component.busy).toBe(false);
  }));

  it('onMalwareFindingSubmitted suppresses notification on 402', fakeAsync(() => {
    findingsService.create.and.returnValue(throwError(() => ({ status: 402, error: { detail: 'Payment required' } })));
    fixture.detectChanges();

    component.onMalwareFindingSubmitted({
      title: 'Malware Finding', sample_id: 'sample-1', analysis_type: 'static',
      description_md: '', is_draft: false,
    });
    tick();

    expect(notify.error).not.toHaveBeenCalled();
  }));

  it('onMalwareFindingSubmitted does nothing when engagementId missing', fakeAsync(async () => {
    const ctx2 = buildTestBed({});
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx2.providers,
    }).compileComponents();
    const fix2 = TestBed.createComponent(EngagementFindingsCreateComponent);
    const comp2 = fix2.componentInstance;

    comp2.onMalwareFindingSubmitted({
      title: 'M', sample_id: 's-1', analysis_type: 'static', description_md: '', is_draft: false,
    });
    tick();
    expect(ctx2.findSvc.create).not.toHaveBeenCalled();
  }));

  // --- Malware flow ---

  it('sets isMalwareFlow true for malware_analysis engagement', fakeAsync(async () => {
    const ctx2 = buildTestBed();
    ctx2.engSvc.getById.and.returnValue(of({ ...MOCK_ENGAGEMENT, engagement_type: 'malware_analysis' }));

    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx2.providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsCreateComponent);
    fix2.detectChanges();
    tick();
    expect(fix2.componentInstance.isMalwareFlow).toBe(true);
  }));

  it('sets isMalwareFlow false for general engagement', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(component.isMalwareFlow).toBe(false);
  }));

  // --- engagement$ / scopeAssets$ with empty ID ---

  it('engagement$ returns null when route has no ID', fakeAsync(async () => {
    const ctx2 = buildTestBed({});
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx2.providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsCreateComponent);
    let val: any;
    fix2.componentInstance.engagement$.subscribe(v => (val = v));
    fix2.detectChanges();
    tick();
    expect(val).toBeNull();
    expect(ctx2.engSvc.getById).not.toHaveBeenCalled();
  }));

  it('scopeAssets$ returns empty array when route has no ID', fakeAsync(async () => {
    const ctx2 = buildTestBed({});
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx2.providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsCreateComponent);
    let val: any;
    fix2.componentInstance.scopeAssets$.subscribe(v => (val = v));
    fix2.detectChanges();
    tick();
    expect(val).toEqual([]);
    expect(ctx2.sowSvc.listScope).not.toHaveBeenCalled();
  }));
});

// --- Cancel with no engagement ID ---

describe('EngagementFindingsCreateComponent cancel() with no engagementId', () => {
  it('navigates to engagements list', async () => {
    const ctx = buildTestBed({});
    await TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsCreateComponent);
    const rt = TestBed.inject(Router);
    spyOn(rt, 'navigate');
    fix.componentInstance.cancel();
    expect(rt.navigate).toHaveBeenCalledWith(['/engagements']);
  });
});

// --- SoW approval gate ---

describe('EngagementFindingsCreateComponent SoW approval gate', () => {
  it('shows form when SoW is approved', fakeAsync(async () => {
    const ctx = buildTestBed();
    await TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsCreateComponent);
    fix.detectChanges();
    tick();
    fix.detectChanges();

    expect(fix.nativeElement.querySelector('app-finding-section-standard')).not.toBeNull();
  }));

  it('shows warning when SoW is not approved', fakeAsync(async () => {
    const ctx = buildTestBed();
    ctx.sowSvc.get.and.returnValue(of({ id: 'sow-1', title: 'Test', status: 'draft', created_at: '', updated_at: '' }));

    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsCreateComponent);
    fix.detectChanges();
    tick();
    fix.detectChanges();

    const warning = fix.nativeElement.querySelector('.text-warning');
    expect(warning?.textContent).toContain('Statement of Work must be approved');
  }));
});
