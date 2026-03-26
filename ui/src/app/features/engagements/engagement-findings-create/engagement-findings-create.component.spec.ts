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
import { Asset } from '../../assets/models/asset.model';

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-1',
  name: 'Test Engagement',
  client_id: 'client-1',
  client_name: 'Acme Corp',
  status: 'active',
  description: 'desc',
  notes: '',
  start_date: '2026-01-01',
  end_date: '2026-03-01',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  findings_summary: null,
};

const MOCK_FINDING: Finding = {
  id: 'find-new',
  engagement_id: 'eng-1',
  asset_id: 'asset-1',
  asset_name: 'WebApp Main',
  title: 'XSS in Search',
  severity: 'medium',
  assessment_area: 'application_security',
  owasp_category: 'A03:2021',
  cwe_id: 'CWE-79',
  status: 'open',
  description_md: '',
  recommendation_md: '',
  is_draft: false,
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

const MOCK_ASSETS: Asset[] = [
  {
    id: 'asset-1',
    name: 'WebApp Main',
    client_id: 'client-1',
    client_name: 'Acme Corp',
    asset_type: 'webapp',
    environment: 'prod',
    criticality: 'high',
    target: 'https://app.acme.com',
    notes: '',
    attributes: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'asset-2',
    name: 'API Gateway',
    client_id: 'client-1',
    client_name: 'Acme Corp',
    asset_type: 'api',
    environment: 'prod',
    criticality: 'high',
    target: 'https://api.acme.com',
    notes: '',
    attributes: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

function buildTestBed(
  routeParams: Record<string, string> = { id: 'eng-1' },
  overrides: { permHas?: boolean } = {},
) {
  const paramMap$ = new BehaviorSubject(convertToParamMap(routeParams));
  const locationSpy = jasmine.createSpyObj('Location', ['back']);
  const engSvc = jasmine.createSpyObj('EngagementsService', ['getById']);
  const findSvc = jasmine.createSpyObj('FindingsService', ['create', 'uploadImage']);
  const sowSvc = jasmine.createSpyObj('SowService', ['listScope', 'get']);
  const notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
  const permSvc = { has: () => overrides.permHas !== false, hasAny$: () => of(true) };

  engSvc.getById.and.returnValue(of(MOCK_ENGAGEMENT));
  sowSvc.listScope.and.returnValue(of(MOCK_ASSETS));
  sowSvc.get.and.returnValue(of({ id: 'sow-1', title: 'Test', status: 'approved', created_at: '', updated_at: '' }));

  return {
    paramMap$,
    locationSpy,
    engSvc,
    findSvc,
    sowSvc,
    notifySpy,
    permSvc,
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Location, useValue: locationSpy },
      { provide: EngagementsService, useValue: engSvc },
      { provide: FindingsService, useValue: findSvc },
      { provide: SowService, useValue: sowSvc },
      { provide: NotificationService, useValue: notifySpy },
      { provide: PermissionService, useValue: permSvc },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: paramMap$,
          snapshot: { paramMap: convertToParamMap(routeParams) },
        },
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

  // --- Form defaults ---

  it('form starts with default values', () => {
    expect(component.form.get('title')?.value).toBe('');
    expect(component.form.get('assessment_area')?.value).toBe('application_security');
    expect(component.form.get('severity')?.value).toBe('medium');
    expect(component.form.get('status')?.value).toBe('open');
    expect(component.form.get('asset_id')?.value).toBe('');
    expect(component.form.get('description_md')?.value).toBe('');
    expect(component.form.get('recommendation_md')?.value).toBe('');
  });

  it('form is invalid by default (missing title and asset)', () => {
    expect(component.form.valid).toBe(false);
  });

  it('form becomes valid when required fields are filled', () => {
    component.form.patchValue({ title: 'XSS in Search Field', asset_id: 'asset-1' });
    expect(component.form.valid).toBe(true);
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

  it('renders scope assets in the dropdown', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('select[formControlName="asset_id"] option');
    const optTexts = Array.from(options).map((o: any) => o.textContent.trim());
    expect(optTexts).toContain('WebApp Main');
    expect(optTexts).toContain('API Gateway');
  }));

  it('renders submit button with "Create finding" text', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn?.textContent).toContain('Create finding');
  }));

  it('renders Cancel button', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const btns = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'));
    const cancelBtn = btns.find(b => b.textContent?.includes('Cancel'));
    expect(cancelBtn).toBeTruthy();
  }));

  // --- Form validation ---

  it('form becomes invalid when title is too short', () => {
    component.form.patchValue({ title: 'abc', asset_id: 'asset-1' });
    expect(component.form.valid).toBe(false);
  });

  it('form remains valid when assessment_area is cleared (optional field)', () => {
    component.form.patchValue({ title: 'Valid Title Here', asset_id: 'asset-1', assessment_area: '' });
    expect(component.form.valid).toBe(true);
  });

  it('isInvalid() returns true for touched invalid field', () => {
    component.form.get('title')?.markAsTouched();
    expect(component.isInvalid('title')).toBe(true);
  });

  it('isInvalid() returns false for untouched invalid field', () => {
    expect(component.isInvalid('title')).toBe(false);
  });

  it('isInvalid() returns false for valid field', () => {
    component.form.patchValue({ title: 'Valid Title Here' });
    component.form.get('title')?.markAsTouched();
    expect(component.isInvalid('title')).toBe(false);
  });

  // --- Save ---

  it('save() calls findingsService.create with form values', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    component.form.patchValue({ title: 'XSS in Search Field', asset_id: 'asset-1' });
    fixture.detectChanges();

    component.save('eng-1');
    tick();

    expect(findingsService.create).toHaveBeenCalledWith('eng-1', jasmine.objectContaining({
      title: 'XSS in Search Field',
      assessment_area: 'application_security',
      severity: 'medium',
      status: 'open',
      asset_id: 'asset-1',
    }));
  }));

  it('save() navigates to findings list on success', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    component.form.patchValue({ title: 'XSS in Search Field', asset_id: 'asset-1' });
    fixture.detectChanges();

    component.save('eng-1');
    tick();

    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings']);
  }));

  it('save() shows error notification on API failure', fakeAsync(() => {
    findingsService.create.and.returnValue(throwError(() => ({ error: { detail: 'Duplicate title' } })));
    component.form.patchValue({ title: 'XSS in Search Field', asset_id: 'asset-1' });
    fixture.detectChanges();

    component.save('eng-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Duplicate title');
  }));

  it('save() shows generic error when API returns no detail', fakeAsync(() => {
    findingsService.create.and.returnValue(throwError(() => ({ error: { message: 'Network fail' } })));
    component.form.patchValue({ title: 'XSS in Search Field', asset_id: 'asset-1' });
    fixture.detectChanges();

    component.save('eng-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Network fail');
  }));

  it('save() does nothing when form is invalid', fakeAsync(() => {
    fixture.detectChanges();

    component.save('eng-1');
    tick();

    expect(findingsService.create).not.toHaveBeenCalled();
  }));

  it('save() sets busy to true while saving', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    component.form.patchValue({ title: 'XSS in Search Field', asset_id: 'asset-1' });
    fixture.detectChanges();

    expect(component.busy).toBe(false);
    component.save('eng-1');
    expect(component.busy).toBe(true);

    tick();
    expect(component.busy).toBe(false);
  }));

  // --- Cancel ---

  it('cancel() navigates to findings list when engagementId present', () => {
    fixture.detectChanges();
    component.cancel();

    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings']);
  });

  // --- goBack ---

  it('goBack() calls location.back()', () => {
    fixture.detectChanges();
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

  // --- Severity and status options ---

  it('has 5 severity options', () => {
    expect(component.severities.length).toBe(5);
    expect(component.severities.map(s => s.value)).toEqual(['critical', 'high', 'medium', 'low', 'info']);
  });

  it('has 5 status options', () => {
    expect(component.statuses.length).toBe(5);
    expect(component.statuses.map(s => s.value)).toEqual(['open', 'triage', 'accepted', 'fixed', 'false_positive']);
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

  // --- isInvalid edge cases ---

  it('isInvalid() returns true for dirty invalid field', () => {
    component.form.get('title')?.markAsDirty();
    expect(component.isInvalid('title')).toBe(true);
  });

  it('isInvalid() returns false for non-existent field', () => {
    expect(component.isInvalid('nonexistent')).toBe(false);
  });

  // --- ngOnDestroy ---

  it('ngOnDestroy() does not throw when no editors are initialized', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  it('ngOnDestroy() calls dispose on image handlers if set', () => {
    const descDispose = jasmine.createSpy('descDispose');
    const recDispose = jasmine.createSpy('recDispose');
    (component as any).descImagesDispose = descDispose;
    (component as any).recImagesDispose = recDispose;

    component.ngOnDestroy();
    expect(descDispose).toHaveBeenCalled();
    expect(recDispose).toHaveBeenCalled();
  });

  it('ngOnDestroy() calls destroy on crepe editors if set', () => {
    const descDestroy = jasmine.createSpy('descDestroy');
    const recDestroy = jasmine.createSpy('recDestroy');
    (component as any).descCrepe = { destroy: descDestroy };
    (component as any).recCrepe = { destroy: recDestroy };

    component.ngOnDestroy();
    expect(descDestroy).toHaveBeenCalled();
    expect(recDestroy).toHaveBeenCalled();
  });

  // --- ngAfterViewInit ---

  it('ngAfterViewInit() sets viewReady flag', () => {
    expect((component as any).viewReady).toBe(false);
    component.ngAfterViewInit();
    expect((component as any).viewReady).toBe(true);
  });

  // --- tryInitDescEditor ---

  it('tryInitDescEditor() does not init when viewReady is false', () => {
    (component as any).descEditorEl = document.createElement('div');
    (component as any).tryInitDescEditor();
    expect((component as any).descEditorInited).toBe(false);
  });

  it('tryInitDescEditor() does not init when descEditorEl is missing', () => {
    (component as any).viewReady = true;
    (component as any).tryInitDescEditor();
    expect((component as any).descEditorInited).toBe(false);
  });

  it('tryInitDescEditor() does not double-init', () => {
    (component as any).viewReady = true;
    (component as any).descEditorEl = document.createElement('div');
    (component as any).descEditorInited = true;
    (component as any).tryInitDescEditor();
    expect((component as any).descCrepe).toBeUndefined();
  });

  // --- tryInitRecEditor ---

  it('tryInitRecEditor() does not init when viewReady is false', () => {
    (component as any).recEditorEl = document.createElement('div');
    (component as any).tryInitRecEditor();
    expect((component as any).recEditorInited).toBe(false);
  });

  it('tryInitRecEditor() does not init when recEditorEl is missing', () => {
    (component as any).viewReady = true;
    (component as any).tryInitRecEditor();
    expect((component as any).recEditorInited).toBe(false);
  });

  // --- uploadImageToApi ---

  it('uploadImageToApi() throws when engagement ID is missing', async () => {
    const ctx2 = buildTestBed({});
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx2.providers,
    }).compileComponents();
    const fix2 = TestBed.createComponent(EngagementFindingsCreateComponent);
    const comp2 = fix2.componentInstance;

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((comp2 as any).uploadImageToApi(file)).toBeRejectedWithError('Engagement ID missing for image upload');
  });

  it('uploadImageToApi() returns absolute URL unchanged', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: 'https://cdn.test/img.png' }));
    fixture.detectChanges();

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    const result = await (component as any).uploadImageToApi(file);
    expect(result).toBe('https://cdn.test/img.png');
  });

  it('uploadImageToApi() prepends apiUrl to relative URL', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: '/media/img.png' }));
    fixture.detectChanges();

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    const result = await (component as any).uploadImageToApi(file);
    expect(result).toContain('/media/img.png');
  });

  it('uploadImageToApi() adds leading slash to relative URL without one', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: 'media/img.png' }));
    fixture.detectChanges();

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    const result = await (component as any).uploadImageToApi(file);
    expect(result).toContain('/media/img.png');
  });

  it('uploadImageToApi() throws when URL is empty', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: '' }));
    fixture.detectChanges();

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((component as any).uploadImageToApi(file)).toBeRejectedWithError('Upload succeeded but no image URL was returned.');
  });

  // --- readDescriptionMarkdown / readRecommendationMarkdown ---

  it('readDescriptionMarkdown() returns form value when no editor', async () => {
    component.form.patchValue({ description_md: 'Some **markdown**' });
    const result = await (component as any).readDescriptionMarkdown();
    expect(result).toBe('Some **markdown**');
  });

  it('readRecommendationMarkdown() returns form value when no editor', async () => {
    component.form.patchValue({ recommendation_md: 'Fix **this**' });
    const result = await (component as any).readRecommendationMarkdown();
    expect(result).toBe('Fix **this**');
  });

  it('readDescriptionMarkdown() returns empty string when no editor and form value is null', async () => {
    component.form.patchValue({ description_md: null as any });
    const result = await (component as any).readDescriptionMarkdown();
    expect(result).toBe('');
  });

  it('readRecommendationMarkdown() returns empty string when no editor and form value is null', async () => {
    component.form.patchValue({ recommendation_md: null as any });
    const result = await (component as any).readRecommendationMarkdown();
    expect(result).toBe('');
  });

  // --- ViewChild setters ---

  it('editorRefSetter sets descEditorEl', () => {
    const el = document.createElement('div');
    (component as any).editorRefSetter = { nativeElement: el };
    expect((component as any).descEditorEl).toBe(el);
  });

  it('editorRefSetter handles undefined', () => {
    (component as any).editorRefSetter = undefined;
    expect((component as any).descEditorEl).toBeUndefined();
  });

  it('recEditorRefSetter sets recEditorEl', () => {
    const el = document.createElement('div');
    (component as any).recEditorRefSetter = { nativeElement: el };
    expect((component as any).recEditorEl).toBe(el);
  });

  it('recEditorRefSetter handles undefined', () => {
    (component as any).recEditorRefSetter = undefined;
    expect((component as any).recEditorEl).toBeUndefined();
  });

  // --- save() with fallback error message ---

  it('save() shows fallback error when API returns neither detail nor message', fakeAsync(() => {
    findingsService.create.and.returnValue(throwError(() => ({})));
    component.form.patchValue({ title: 'XSS in Search Field', asset_id: 'asset-1' });
    fixture.detectChanges();

    component.save('eng-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Create failed.');
  }));

  // --- engagement$ and scopeAssets$ with empty ID ---

  it('engagement$ returns null when route has no ID', fakeAsync(() => {
    const ctx2 = buildTestBed({});
    const fix2Providers = ctx2.providers;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: fix2Providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsCreateComponent);
    const comp2 = fix2.componentInstance;
    let val: any;
    comp2.engagement$.subscribe(v => (val = v));
    fix2.detectChanges();
    tick();

    expect(val).toBeNull();
    expect(ctx2.engSvc.getById).not.toHaveBeenCalled();
  }));

  it('scopeAssets$ returns empty array when route has no ID', fakeAsync(() => {
    const ctx2 = buildTestBed({});
    const fix2Providers = ctx2.providers;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: fix2Providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsCreateComponent);
    const comp2 = fix2.componentInstance;
    let val: any;
    comp2.scopeAssets$.subscribe(v => (val = v));
    fix2.detectChanges();
    tick();

    expect(val).toEqual([]);
    expect(ctx2.sowSvc.listScope).not.toHaveBeenCalled();
  }));

  // --- save() catch block when editor rejects ---

  it('save() shows editor error when readDescriptionMarkdown rejects', fakeAsync(() => {
    component.form.patchValue({ title: 'XSS in Search Field', asset_id: 'asset-1' });
    fixture.detectChanges();

    // Mock a failing descCrepe
    (component as any).descCrepe = {};
    (component as any).descReady = Promise.reject(new Error('Editor crashed'));

    component.save('eng-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Editor crashed');
    expect(component.busy).toBe(false);
  }));

  it('save() shows generic message when editor throws without message', fakeAsync(() => {
    component.form.patchValue({ title: 'XSS in Search Field', asset_id: 'asset-1' });
    fixture.detectChanges();

    (component as any).descCrepe = {};
    (component as any).descReady = Promise.reject({});

    component.save('eng-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Editor not ready.');
    expect(component.busy).toBe(false);
  }));

  // --- save() markAllAsTouched ---

  it('save() marks all fields as touched', fakeAsync(() => {
    fixture.detectChanges();

    expect(component.form.get('title')?.touched).toBe(false);
    component.save('eng-1');
    tick();

    expect(component.form.get('title')?.touched).toBe(true);
  }));

  // --- save() includes description_md and recommendation_md ---

  it('save() sends description_md and recommendation_md', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    component.form.patchValue({
      title: 'XSS in Search Field',
      asset_id: 'asset-1',
      description_md: '# Details',
      recommendation_md: '# Fix',
    });
    fixture.detectChanges();

    component.save('eng-1');
    tick();

    const callArgs = findingsService.create.calls.mostRecent().args[1];
    expect(callArgs.description_md).toContain('# Details');
    expect(callArgs.recommendation_md).toContain('# Fix');
  }));

  // --- save() as draft ---

  it('save() as draft sends is_draft=true with valid title', fakeAsync(() => {
    findingsService.create.and.returnValue(of(MOCK_FINDING));
    component.form.patchValue({ title: 'Draft Finding Title' });
    fixture.detectChanges();

    component.save('eng-1', true);
    tick();

    expect(findingsService.create).toHaveBeenCalled();
    const callArgs = findingsService.create.calls.mostRecent().args[1];
    expect(callArgs.is_draft).toBe(true);
  }));

  it('save() as draft fails when title is too short', fakeAsync(() => {
    component.form.patchValue({ title: 'ab' });
    fixture.detectChanges();

    component.save('eng-1', true);
    tick();

    expect(findingsService.create).not.toHaveBeenCalled();
  }));

  it('save() as draft fails when title is empty', fakeAsync(() => {
    component.form.patchValue({ title: '' });
    fixture.detectChanges();

    component.save('eng-1', true);
    tick();

    expect(findingsService.create).not.toHaveBeenCalled();
  }));

  // --- tryInitRecEditor double-init guard ---

  it('tryInitRecEditor() does not double-init', () => {
    (component as any).viewReady = true;
    (component as any).recEditorEl = document.createElement('div');
    (component as any).recEditorInited = true;
    (component as any).tryInitRecEditor();
    expect((component as any).recCrepe).toBeUndefined();
  });

  // --- ngAfterViewInit SoW loading with null engagement ID ---

  it('ngAfterViewInit sets sowStatus$ to null when no engagement ID', fakeAsync(async () => {
    const ctx2 = buildTestBed({});
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx2.providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsCreateComponent);
    const comp2 = fix2.componentInstance;
    fix2.detectChanges();
    comp2.ngAfterViewInit();
    tick();

    let status: any;
    comp2.sowStatus$.subscribe(v => status = v);
    expect(status).toBeNull();
    expect(comp2.sowLoaded).toBe(true);
  }));

  // --- uploadImageToApi error branch with notify ---

  it('uploadImageToApi calls notify.error on failure', async () => {
    findingsService.uploadImage.and.returnValue(throwError(() => ({ error: { message: 'Network error' } })));
    fixture.detectChanges();

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((component as any).uploadImageToApi(file)).toBeRejected();
    expect(notify.error).toHaveBeenCalledWith('Image upload failed: Network error');
    expect(component.imageUploading).toBe(false);
  });

  it('uploadImageToApi calls notify.error with unknown error when no message', async () => {
    findingsService.uploadImage.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((component as any).uploadImageToApi(file)).toBeRejected();
    expect(notify.error).toHaveBeenCalledWith('Image upload failed: Unknown error');
  });

  // --- uploadImageToApi sets and clears imageUploading ---

  it('uploadImageToApi sets imageUploading during upload', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: 'https://cdn.test/img.png' }));
    fixture.detectChanges();

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    expect(component.imageUploading).toBe(false);
    await (component as any).uploadImageToApi(file);
    expect(component.imageUploading).toBe(false); // reset in finally
  });

  // --- CWE typeahead: onCweInput ---

  it('onCweInput filters cweCatalog by code match', () => {
    component.cweCatalog = [
      { code: 'CWE-79', name: 'Cross-site Scripting', description: 'XSS' },
      { code: 'CWE-89', name: 'SQL Injection', description: 'SQLi' },
      { code: 'CWE-22', name: 'Path Traversal', description: 'Path trav' },
    ];
    const event = { target: { value: 'CWE-79' } } as unknown as Event;
    component.onCweInput(event);

    expect(component.cweSearch).toBe('CWE-79');
    expect(component.cweDropdownOpen).toBe(true);
    expect(component.cweHighlightIndex).toBe(-1);
    expect(component.cweFiltered.length).toBe(1);
    expect(component.cweFiltered[0].code).toBe('CWE-79');
  });

  it('onCweInput filters cweCatalog by name match', () => {
    component.cweCatalog = [
      { code: 'CWE-79', name: 'Cross-site Scripting', description: 'XSS' },
      { code: 'CWE-89', name: 'SQL Injection', description: 'SQLi' },
    ];
    const event = { target: { value: 'injection' } } as unknown as Event;
    component.onCweInput(event);

    expect(component.cweFiltered.length).toBe(1);
    expect(component.cweFiltered[0].code).toBe('CWE-89');
  });

  it('onCweInput limits results to 15', () => {
    component.cweCatalog = Array.from({ length: 20 }, (_, i) => ({
      code: `CWE-${i}`, name: `Entry ${i}`, description: 'desc',
    }));
    const event = { target: { value: 'entry' } } as unknown as Event;
    component.onCweInput(event);

    expect(component.cweFiltered.length).toBe(15);
  });

  it('onCweInput returns empty when no match', () => {
    component.cweCatalog = [
      { code: 'CWE-79', name: 'Cross-site Scripting', description: 'XSS' },
    ];
    const event = { target: { value: 'zzzzz' } } as unknown as Event;
    component.onCweInput(event);

    expect(component.cweFiltered.length).toBe(0);
  });

  // --- CWE typeahead: onCweKeydown ---

  it('onCweKeydown ArrowDown increments highlight', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [
      { code: 'CWE-79', name: 'XSS', description: '' },
      { code: 'CWE-89', name: 'SQLi', description: '' },
    ];
    component.cweHighlightIndex = -1;

    const inputEl = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    Object.defineProperty(event, 'target', { value: inputEl });
    spyOn(event, 'preventDefault');
    component.onCweKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.cweHighlightIndex).toBe(0);
  });

  it('onCweKeydown ArrowDown clamps at last item', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [
      { code: 'CWE-79', name: 'XSS', description: '' },
      { code: 'CWE-89', name: 'SQLi', description: '' },
    ];
    component.cweHighlightIndex = 1;

    const inputEl = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    Object.defineProperty(event, 'target', { value: inputEl });
    spyOn(event, 'preventDefault');
    component.onCweKeydown(event);

    expect(component.cweHighlightIndex).toBe(1);
  });

  it('onCweKeydown ArrowUp decrements highlight', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [
      { code: 'CWE-79', name: 'XSS', description: '' },
      { code: 'CWE-89', name: 'SQLi', description: '' },
    ];
    component.cweHighlightIndex = 1;

    const inputEl = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    Object.defineProperty(event, 'target', { value: inputEl });
    spyOn(event, 'preventDefault');
    component.onCweKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.cweHighlightIndex).toBe(0);
  });

  it('onCweKeydown ArrowUp clamps at 0', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [
      { code: 'CWE-79', name: 'XSS', description: '' },
    ];
    component.cweHighlightIndex = 0;

    const inputEl = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
    Object.defineProperty(event, 'target', { value: inputEl });
    spyOn(event, 'preventDefault');
    component.onCweKeydown(event);

    expect(component.cweHighlightIndex).toBe(0);
  });

  it('onCweKeydown Enter selects highlighted CWE', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [
      { code: 'CWE-79', name: 'Cross-site Scripting', description: '' },
      { code: 'CWE-89', name: 'SQL Injection', description: '' },
    ];
    component.cweHighlightIndex = 1;

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    spyOn(event, 'preventDefault');
    component.onCweKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.form.get('cwe_id')?.value).toBe('CWE-89');
    expect(component.cweSearch).toBe('CWE-89 — SQL Injection');
    expect(component.cweDropdownOpen).toBe(false);
  });

  it('onCweKeydown Enter does nothing when highlight is -1', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [
      { code: 'CWE-79', name: 'XSS', description: '' },
    ];
    component.cweHighlightIndex = -1;

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    spyOn(event, 'preventDefault');
    component.onCweKeydown(event);

    expect(component.form.get('cwe_id')?.value).toBe('');
  });

  it('onCweKeydown Escape closes dropdown', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [
      { code: 'CWE-79', name: 'XSS', description: '' },
    ];

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onCweKeydown(event);

    expect(component.cweDropdownOpen).toBe(false);
  });

  it('onCweKeydown Escape closes dropdown when list is empty', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [];

    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    component.onCweKeydown(event);

    expect(component.cweDropdownOpen).toBe(false);
  });

  it('onCweKeydown returns early when dropdown is closed', () => {
    component.cweDropdownOpen = false;
    component.cweFiltered = [
      { code: 'CWE-79', name: 'XSS', description: '' },
    ];
    component.cweHighlightIndex = -1;

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    component.onCweKeydown(event);

    expect(component.cweHighlightIndex).toBe(-1);
  });

  it('onCweKeydown ignores unrecognized keys', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [
      { code: 'CWE-79', name: 'XSS', description: '' },
    ];
    component.cweHighlightIndex = 0;

    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    component.onCweKeydown(event);

    expect(component.cweHighlightIndex).toBe(0);
    expect(component.cweDropdownOpen).toBe(true);
  });

  // --- selectCwe ---

  it('selectCwe sets form value and display text', () => {
    component.selectCwe({ code: 'CWE-79', name: 'Cross-site Scripting', description: '' });

    expect(component.form.get('cwe_id')?.value).toBe('CWE-79');
    expect(component.cweSearch).toBe('CWE-79 — Cross-site Scripting');
    expect(component.cweDropdownOpen).toBe(false);
    expect(component.cweHighlightIndex).toBe(-1);
  });

  // --- clearCwe ---

  it('clearCwe resets form value and search', () => {
    component.form.patchValue({ cwe_id: 'CWE-79' });
    component.cweSearch = 'CWE-79 — XSS';
    component.cweDropdownOpen = true;
    component.cweHighlightIndex = 2;

    component.clearCwe();

    expect(component.form.get('cwe_id')?.value).toBe('');
    expect(component.cweSearch).toBe('');
    expect(component.cweDropdownOpen).toBe(false);
    expect(component.cweHighlightIndex).toBe(-1);
  });
});

// --- Cancel with no engagement ID (separate describe block) ---

describe('EngagementFindingsCreateComponent cancel() with no engagementId', () => {
  it('navigates to engagements list', async () => {
    const ctx = buildTestBed({});

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsCreateComponent);
    const comp = fix.componentInstance;
    const rt = TestBed.inject(Router);
    spyOn(rt, 'navigate');
    fix.detectChanges();

    comp.cancel();
    expect(rt.navigate).toHaveBeenCalledWith(['/engagements']);
  });
});

// --- SoW approval gate ---

describe('EngagementFindingsCreateComponent SoW approval gate', () => {

  it('shows form when SoW is approved', fakeAsync(async () => {
    const ctx = buildTestBed();
    // sowSvc.get already returns approved by default

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsCreateComponent);
    fix.detectChanges();
    fix.componentInstance.ngAfterViewInit();
    tick();
    fix.detectChanges();

    const warning = fix.nativeElement.querySelector('.text-warning');
    const formCard = fix.nativeElement.querySelector('form[formGroup]') ||
                     fix.nativeElement.querySelector('form');
    expect(warning).toBeNull();
    expect(formCard).not.toBeNull();
  }));

  it('shows warning when SoW is draft', fakeAsync(async () => {
    const ctx = buildTestBed();
    ctx.sowSvc.get.and.returnValue(of({ id: 'sow-1', title: 'Test', status: 'draft', created_at: '', updated_at: '' }));

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsCreateComponent);
    fix.detectChanges();
    fix.componentInstance.ngAfterViewInit();
    tick();
    fix.detectChanges();

    const warning = fix.nativeElement.querySelector('.text-warning');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toContain('Statement of Work must be approved');

    const formEl = fix.nativeElement.querySelector('form');
    expect(formEl).toBeNull();
  }));

  it('shows warning when SoW fetch fails', fakeAsync(async () => {
    const ctx = buildTestBed();
    ctx.sowSvc.get.and.returnValue(throwError(() => new Error('Network error')));

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsCreateComponent);
    fix.detectChanges();
    fix.componentInstance.ngAfterViewInit();
    tick();
    fix.detectChanges();

    const warning = fix.nativeElement.querySelector('.text-warning');
    expect(warning).not.toBeNull();
  }));

  it('shows SoW link when user has sow.update permission', fakeAsync(async () => {
    const ctx = buildTestBed({ id: 'eng-1' }, { permHas: true });
    ctx.sowSvc.get.and.returnValue(of({ id: 'sow-1', title: 'Test', status: 'draft', created_at: '', updated_at: '' }));

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsCreateComponent);
    fix.detectChanges();
    fix.componentInstance.ngAfterViewInit();
    tick();
    fix.detectChanges();

    const link = fix.nativeElement.querySelector('.bc-link[href*="sow"]') ||
                 fix.nativeElement.querySelector('a.bc-link');
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Statement of Work');
  }));

  it('shows contact message when user lacks sow.update permission', fakeAsync(async () => {
    const ctx = buildTestBed({ id: 'eng-1' }, { permHas: false });
    ctx.sowSvc.get.and.returnValue(of({ id: 'sow-1', title: 'Test', status: 'draft', created_at: '', updated_at: '' }));

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsCreateComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsCreateComponent);
    fix.detectChanges();
    fix.componentInstance.ngAfterViewInit();
    tick();
    fix.detectChanges();

    const body = fix.nativeElement.textContent;
    expect(body).toContain('Contact your project lead or admin');

    // The warning card is the one containing text-warning; ensure it has no SoW link
    const warningCard = fix.nativeElement.querySelector('.text-warning')?.closest('.bc-card');
    const sowLink = warningCard?.querySelector('a.bc-link[href*="sow"]');
    expect(sowLink).toBeNull();
  }));
});
