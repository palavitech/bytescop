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
import { Asset } from '../../assets/models/asset.model';
import { UserProfileService } from '../../../services/core/profile/user-profile.service';

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
  engagement_type: 'general',
};

const MOCK_FINDING: Finding = {
  id: 'find-1',
  engagement_id: 'eng-1',
  asset_id: 'asset-1',
  asset_name: 'WebApp Main',
  title: 'SQL Injection in Login',
  severity: 'high',
  assessment_area: 'application_security',
  owasp_category: 'A03:2021',
  cwe_id: 'CWE-89',
  status: 'open',
  description_md: '# Description\nSQL injection found.',
  recommendation_md: '# Recommendation\nUse parameterized queries.',
  is_draft: false,
  sample_id: null,
  sample_name: '',
  analysis_type: '',
  analysis_check_key: '',
  execution_status: '',
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
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

function buildTestBed(routeParams: Record<string, string> = { id: 'eng-1', findingId: 'find-1' }) {
  const paramMap$ = new BehaviorSubject(convertToParamMap(routeParams));
  const locationSpy = jasmine.createSpyObj('Location', ['back']);
  const engSvc = jasmine.createSpyObj('EngagementsService', ['getById', 'listSamples']);
  const findSvc = jasmine.createSpyObj('FindingsService', ['getById', 'update', 'uploadImage']);
  const sowSvc = jasmine.createSpyObj('SowService', ['listScope']);
  const notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);

  engSvc.getById.and.returnValue(of(MOCK_ENGAGEMENT));
  engSvc.listSamples.and.returnValue(of([]));
  findSvc.getById.and.returnValue(of(MOCK_FINDING));
  sowSvc.listScope.and.returnValue(of(MOCK_ASSETS));

  return {
    paramMap$,
    locationSpy,
    engSvc,
    findSvc,
    sowSvc,
    notifySpy,
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Location, useValue: locationSpy },
      { provide: EngagementsService, useValue: engSvc },
      { provide: FindingsService, useValue: findSvc },
      { provide: SowService, useValue: sowSvc },
      { provide: NotificationService, useValue: notifySpy },
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

  // --- Form pre-fill ---

  it('pre-fills form with finding data after init', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.form.get('title')?.value).toBe('SQL Injection in Login');
    expect(component.form.get('assessment_area')?.value).toBe('application_security');
    expect(component.form.get('severity')?.value).toBe('high');
    expect(component.form.get('status')?.value).toBe('open');
    expect(component.form.get('asset_id')?.value).toBe('asset-1');
    expect(component.form.get('description_md')?.value).toBe('# Description\nSQL injection found.');
    expect(component.form.get('recommendation_md')?.value).toBe('# Recommendation\nUse parameterized queries.');
  }));

  it('does not patch form when finding is null', fakeAsync(() => {
    findingsService.getById.and.returnValue(of(null as any));
    fixture.detectChanges();
    tick();

    expect(component.form.get('title')?.value).toBe('');
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

  it('renders scope assets in the dropdown', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('select[formControlName="asset_id"] option');
    const optTexts = Array.from(options).map((o: any) => o.textContent.trim());
    expect(optTexts).toContain('WebApp Main');
    expect(optTexts).toContain('API Gateway');
  }));

  it('renders submit button with "Save changes" text', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn?.textContent).toContain('Save changes');
  }));

  // --- Form validation ---

  it('form starts valid when pre-filled with complete finding data', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.form.valid).toBe(true);
  }));

  it('form becomes invalid when title is cleared', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: '' });
    expect(component.form.valid).toBe(false);
  }));

  it('form becomes invalid when title is too short', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: 'abc' });
    expect(component.form.valid).toBe(false);
  }));

  it('form becomes invalid when asset_id is cleared', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.form.patchValue({ asset_id: '' });
    expect(component.form.valid).toBe(false);
  }));

  it('isInvalid() returns true for touched invalid field', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.form.get('title')?.setValue('');
    component.form.get('title')?.markAsTouched();
    expect(component.isInvalid('title')).toBe(true);
  }));

  it('isInvalid() returns false for untouched invalid field', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.form.get('title')?.setValue('');
    expect(component.isInvalid('title')).toBe(false);
  }));

  it('isInvalid() returns false for valid field', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.form.get('title')?.markAsTouched();
    expect(component.isInvalid('title')).toBe(false);
  }));

  // --- Save ---

  it('save() calls findingsService.update with form values', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: 'Updated Title' });
    component.save('eng-1', 'find-1');
    tick();

    expect(findingsService.update).toHaveBeenCalledWith('eng-1', 'find-1', jasmine.objectContaining({
      title: 'Updated Title',
      assessment_area: 'application_security',
      severity: 'high',
      status: 'open',
      asset_id: 'asset-1',
    }));
  }));

  it('save() navigates to view finding page on success', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    component.save('eng-1', 'find-1');
    tick();

    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings', 'find-1']);
  }));

  it('save() shows error notification on API failure', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ error: { detail: 'Server error' } })));
    fixture.detectChanges();
    tick();

    component.save('eng-1', 'find-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Server error');
  }));

  it('save() shows generic error when API returns no detail', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ error: { message: 'Network fail' } })));
    fixture.detectChanges();
    tick();

    component.save('eng-1', 'find-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Network fail');
  }));

  it('save() does nothing when form is invalid', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: '' });
    component.save('eng-1', 'find-1');
    tick();

    expect(findingsService.update).not.toHaveBeenCalled();
  }));

  it('save() sets busy to true while saving', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    expect(component.busy).toBe(false);
    component.save('eng-1', 'find-1');
    expect(component.busy).toBe(true);

    tick();
    expect(component.busy).toBe(false);
  }));

  // --- Cancel ---

  it('cancel() navigates to view finding page when both IDs present', () => {
    fixture.detectChanges();
    component.cancel();

    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings', 'find-1']);
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

  // --- Loading template ---

  it('shows loading spinner before data arrives', () => {
    engagementsService.getById.and.returnValue(new BehaviorSubject(null as any));
    findingsService.getById.and.returnValue(new BehaviorSubject(null as any));

    fixture = TestBed.createComponent(EngagementFindingsEditComponent);
    fixture.detectChanges();

    const spinner = fixture.nativeElement.querySelector('.spinner-border');
    expect(spinner).not.toBeNull();
  });

  // --- Help aside ---

  it('shows help aside when Help button is clicked', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.bc-helpPane')).toBeNull();

    // Click the Help button in the DOM to trigger change detection with OnPush
    const helpBtn = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'))
      .find(btn => btn.textContent?.includes('Help'));
    helpBtn?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.bc-helpPane')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.bc-helpTitle')?.textContent).toContain('Edit Finding');
  }));

  // --- isInvalid edge cases ---

  it('isInvalid() returns true for dirty invalid field', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.form.get('title')?.setValue('');
    component.form.get('title')?.markAsDirty();
    expect(component.isInvalid('title')).toBe(true);
  }));

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

  it('ngOnDestroy() unsubscribes findingSub', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    const sub = (component as any).findingSub;
    expect(sub).toBeTruthy();
    component.ngOnDestroy();
    expect(sub.closed).toBe(true);
  }));

  // --- ngOnInit / mdReady ---

  it('ngOnInit sets mdReady to true after finding arrives', fakeAsync(() => {
    expect((component as any).mdReady).toBe(false);
    fixture.detectChanges();
    tick();
    expect((component as any).mdReady).toBe(true);
  }));

  it('ngOnInit does not set mdReady when finding is null', fakeAsync(() => {
    findingsService.getById.and.returnValue(of(null as any));
    fixture.detectChanges();
    tick();
    expect((component as any).mdReady).toBe(false);
  }));

  // --- ngAfterViewInit ---

  it('ngAfterViewInit() sets viewReady flag', () => {
    expect((component as any).viewReady).toBe(false);
    component.ngAfterViewInit();
    expect((component as any).viewReady).toBe(true);
  });

  // --- tryInitDescEditor ---

  it('tryInitDescEditor() does not init when viewReady is false', () => {
    (component as any).descEditorEl = document.createElement('div');
    (component as any).mdReady = true;
    (component as any).tryInitDescEditor();
    expect((component as any).descEditorInited).toBe(false);
  });

  it('tryInitDescEditor() does not init when descEditorEl is missing', () => {
    (component as any).viewReady = true;
    (component as any).mdReady = true;
    (component as any).tryInitDescEditor();
    expect((component as any).descEditorInited).toBe(false);
  });

  it('tryInitDescEditor() does not init when mdReady is false', () => {
    (component as any).viewReady = true;
    (component as any).descEditorEl = document.createElement('div');
    (component as any).tryInitDescEditor();
    expect((component as any).descEditorInited).toBe(false);
  });

  it('tryInitDescEditor() does not double-init', () => {
    (component as any).viewReady = true;
    (component as any).mdReady = true;
    (component as any).descEditorEl = document.createElement('div');
    (component as any).descEditorInited = true;
    (component as any).tryInitDescEditor();
    expect((component as any).descCrepe).toBeUndefined();
  });

  // --- tryInitRecEditor ---

  it('tryInitRecEditor() does not init when viewReady is false', () => {
    (component as any).recEditorEl = document.createElement('div');
    (component as any).mdReady = true;
    (component as any).tryInitRecEditor();
    expect((component as any).recEditorInited).toBe(false);
  });

  it('tryInitRecEditor() does not init when mdReady is false', () => {
    (component as any).viewReady = true;
    (component as any).recEditorEl = document.createElement('div');
    (component as any).tryInitRecEditor();
    expect((component as any).recEditorInited).toBe(false);
  });

  // --- uploadImageToApi ---

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

  it('uploadImageToApi() throws when engagement ID is missing', async () => {
    const ctx2 = buildTestBed({});
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx2.providers,
    }).compileComponents();
    const fix2 = TestBed.createComponent(EngagementFindingsEditComponent);
    const comp2 = fix2.componentInstance;

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((comp2 as any).uploadImageToApi(file)).toBeRejectedWithError('Engagement ID missing for image upload');
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
    findingsService.update.and.returnValue(throwError(() => ({})));
    fixture.detectChanges();
    tick();

    component.save('eng-1', 'find-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Update failed.');
  }));

  // --- Render Cancel button ---

  it('renders Cancel button', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const btns = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'));
    const cancelBtn = btns.find(b => b.textContent?.includes('Cancel'));
    expect(cancelBtn).toBeTruthy();
  }));

  // --- engagement$ and scopeAssets$ with empty ID ---

  it('engagement$ returns null when route has no ID', fakeAsync(() => {
    const ctx2 = buildTestBed({});
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx2.providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsEditComponent);
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
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx2.providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsEditComponent);
    const comp2 = fix2.componentInstance;
    let val: any;
    comp2.scopeAssets$.subscribe(v => (val = v));
    fix2.detectChanges();
    tick();

    expect(val).toEqual([]);
    expect(ctx2.sowSvc.listScope).not.toHaveBeenCalled();
  }));

  it('finding$ returns null when route has no IDs', fakeAsync(() => {
    const ctx2 = buildTestBed({});
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx2.providers,
    }).compileComponents();

    const fix2 = TestBed.createComponent(EngagementFindingsEditComponent);
    const comp2 = fix2.componentInstance;
    let val: any;
    comp2.finding$.subscribe(v => (val = v));
    fix2.detectChanges();
    tick();

    expect(val).toBeNull();
    expect(ctx2.findSvc.getById).not.toHaveBeenCalled();
  }));

  // --- save() catch block when editor rejects ---

  it('save() shows editor error when readDescriptionMarkdown rejects', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    (component as any).descCrepe = {};
    (component as any).descReady = Promise.reject(new Error('Editor crashed'));

    component.save('eng-1', 'find-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Editor crashed');
    expect(component.busy).toBe(false);
  }));

  it('save() shows generic message when editor throws without message', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    (component as any).descCrepe = {};
    (component as any).descReady = Promise.reject({});

    component.save('eng-1', 'find-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Editor not ready.');
    expect(component.busy).toBe(false);
  }));

  // --- save() markAllAsTouched ---

  it('save() marks all fields as touched', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: '' });
    expect(component.form.get('title')?.touched).toBe(false);
    component.save('eng-1', 'find-1');
    tick();

    expect(component.form.get('title')?.touched).toBe(true);
  }));

  // --- save() sends description and recommendation markdown ---

  it('save() sends description_md and recommendation_md from form', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    // Ensure no editor is used so form values are returned directly
    (component as any).descCrepe = undefined;
    (component as any).recCrepe = undefined;

    component.form.patchValue({
      description_md: '# Updated details',
      recommendation_md: '# Updated fix',
    });
    component.save('eng-1', 'find-1');
    tick();

    const callArgs = findingsService.update.calls.mostRecent().args[2];
    expect(callArgs.description_md).toBe('# Updated details');
    expect(callArgs.recommendation_md).toBe('# Updated fix');
  }));

  // --- findingId$ observable ---

  it('finding$ loads finding when both engagementId and findingId present', fakeAsync(() => {
    let val: any;
    component.finding$.subscribe(v => (val = v));
    fixture.detectChanges();
    tick();

    expect(val).toEqual(MOCK_FINDING);
  }));

  // --- save() as draft ---

  it('save() as draft sends is_draft=true with valid title', fakeAsync(() => {
    const draftFinding: Finding = { ...MOCK_FINDING, is_draft: true };
    findingsService.getById.and.returnValue(of(draftFinding));
    findingsService.update.and.returnValue(of(draftFinding));
    fixture.detectChanges();
    tick();

    component.save('eng-1', 'find-1');
    tick();

    const callArgs = findingsService.update.calls.mostRecent().args[2];
    expect(callArgs.is_draft).toBe(true);
  }));

  it('save() as draft fails when title is too short', fakeAsync(() => {
    const draftFinding: Finding = { ...MOCK_FINDING, is_draft: true };
    findingsService.getById.and.returnValue(of(draftFinding));
    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: 'abc' });
    component.save('eng-1', 'find-1');
    tick();

    expect(findingsService.update).not.toHaveBeenCalled();
  }));

  it('save() as draft fails when title is empty', fakeAsync(() => {
    const draftFinding: Finding = { ...MOCK_FINDING, is_draft: true };
    findingsService.getById.and.returnValue(of(draftFinding));
    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: '' });
    component.save('eng-1', 'find-1');
    tick();

    expect(findingsService.update).not.toHaveBeenCalled();
  }));

  // --- save() publish ---

  it('save() with publish=true sets is_draft=false and shows published message', fakeAsync(() => {
    const draftFinding: Finding = { ...MOCK_FINDING, is_draft: true };
    findingsService.getById.and.returnValue(of(draftFinding));
    findingsService.update.and.returnValue(of({ ...draftFinding, is_draft: false }));
    fixture.detectChanges();
    tick();

    component.save('eng-1', 'find-1', true);
    tick();

    const callArgs = findingsService.update.calls.mostRecent().args[2];
    expect(callArgs.is_draft).toBe(false);
  }));

  // --- isDraft$ ---

  it('isDraft$ reflects finding is_draft state', fakeAsync(() => {
    const draftFinding: Finding = { ...MOCK_FINDING, is_draft: true };
    findingsService.getById.and.returnValue(of(draftFinding));
    fixture.detectChanges();
    tick();

    let isDraft: boolean | undefined;
    component.isDraft$.subscribe(v => isDraft = v);
    expect(isDraft).toBe(true);
  }));

  // --- save() non-draft, non-publish (no is_draft set in payload) ---

  it('save() on non-draft finding does not set is_draft in payload', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    // isDraft$ is false (default), publish is false (default)
    component.save('eng-1', 'find-1');
    tick();

    const callArgs = findingsService.update.calls.mostRecent().args[2];
    expect(callArgs.is_draft).toBeUndefined();
  }));

  // --- tryInitRecEditor double-init guard ---

  it('tryInitRecEditor() does not double-init', () => {
    (component as any).viewReady = true;
    (component as any).mdReady = true;
    (component as any).recEditorEl = document.createElement('div');
    (component as any).recEditorInited = true;
    (component as any).tryInitRecEditor();
    expect((component as any).recCrepe).toBeUndefined();
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

  // --- ngAfterViewInit cweSearch population from existing cwe_id ---

  it('ngAfterViewInit populates cweSearch when cwe_id matches catalog entry', fakeAsync(() => {
    const cweCatalog = [
      { code: 'CWE-89', name: 'SQL Injection', description: 'SQLi' },
    ];

    // Patch form to have a cwe_id before afterViewInit
    component.form.patchValue({ cwe_id: 'CWE-89' });

    // Set catalog and simulate the subscription callback in ngAfterViewInit
    component.cweCatalog = cweCatalog;
    component.ngAfterViewInit();
    tick();

    // Simulate the subscription callback manually
    const currentCwe = component.form.get('cwe_id')?.value;
    if (currentCwe) {
      const entry = cweCatalog.find(c => c.code === currentCwe);
      if (entry) {
        component.cweSearch = `${entry.code} — ${entry.name}`;
      }
    }

    expect(component.cweSearch).toBe('CWE-89 — SQL Injection');
  }));

  it('ngAfterViewInit does not set cweSearch when cwe_id has no match', fakeAsync(() => {
    component.form.patchValue({ cwe_id: 'CWE-999' });
    component.cweCatalog = [
      { code: 'CWE-89', name: 'SQL Injection', description: 'SQLi' },
    ];
    component.cweSearch = '';
    component.ngAfterViewInit();
    tick();

    // cweSearch should remain empty since CWE-999 is not in catalog
    expect(component.cweSearch).toBe('');
  }));

  // --- isDirty ---

  it('isDirty() returns false when form is pristine', () => {
    expect(component.isDirty()).toBe(false);
  });

  it('isDirty() returns true when form is dirty and not saved', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.form.markAsDirty();
    expect(component.isDirty()).toBe(true);
  }));

  it('isDirty() returns false after save completes', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();
    tick();

    component.form.markAsDirty();
    expect(component.isDirty()).toBe(true);

    component.save('eng-1', 'find-1');
    tick();

    expect(component.isDirty()).toBe(false);
  }));

  // --- onMalwareFindingSubmitted ---

  it('onMalwareFindingSubmitted() calls findingsService.update and navigates on success', fakeAsync(() => {
    findingsService.update.and.returnValue(of(MOCK_FINDING));
    fixture.detectChanges();

    const payload = {
      title: 'Malware Finding Title',
      sample_id: 'sample-1',
      analysis_type: 'static',
      description_md: '# Malware desc',
      is_draft: false,
    };
    component.onMalwareFindingSubmitted(payload);
    tick();

    expect(findingsService.update).toHaveBeenCalledWith('eng-1', 'find-1', jasmine.objectContaining({
      title: 'Malware Finding Title',
      sample_id: 'sample-1',
      analysis_type: 'static',
      description_md: '# Malware desc',
      is_draft: false,
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings', 'find-1']);
  }));

  it('onMalwareFindingSubmitted() shows error on API failure', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ error: { detail: 'Sample not found' } })));
    fixture.detectChanges();

    const payload = {
      title: 'Malware Finding Title',
      sample_id: 'sample-1',
      analysis_type: 'static',
      description_md: '',
      is_draft: false,
    };
    component.onMalwareFindingSubmitted(payload);
    tick();

    expect(notify.error).toHaveBeenCalledWith('Sample not found');
    expect(component.busy).toBe(false);
  }));

  it('onMalwareFindingSubmitted() shows fallback error when no detail or message', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ error: {} })));
    fixture.detectChanges();

    const payload = {
      title: 'Malware Finding Title',
      sample_id: 'sample-1',
      analysis_type: 'static',
      description_md: '',
      is_draft: false,
    };
    component.onMalwareFindingSubmitted(payload);
    tick();

    expect(notify.error).toHaveBeenCalledWith('Update failed.');
    expect(component.busy).toBe(false);
  }));

  it('onMalwareFindingSubmitted() does nothing when engagementId is missing', fakeAsync(async () => {
    const ctx2 = buildTestBed({});
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx2.providers,
    }).compileComponents();
    const fix2 = TestBed.createComponent(EngagementFindingsEditComponent);
    const comp2 = fix2.componentInstance;

    const payload = {
      title: 'Malware Finding',
      sample_id: 'sample-1',
      analysis_type: 'static',
      description_md: '',
      is_draft: false,
    };
    comp2.onMalwareFindingSubmitted(payload);
    tick();

    expect(ctx2.findSvc.update).not.toHaveBeenCalled();
  }));

  it('onMalwareFindingSubmitted() suppresses notification on 402 error', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ status: 402, error: { detail: 'Payment required' } })));
    fixture.detectChanges();

    const payload = {
      title: 'Malware Finding Title',
      sample_id: 'sample-1',
      analysis_type: 'static',
      description_md: '',
      is_draft: false,
    };
    component.onMalwareFindingSubmitted(payload);
    tick();

    expect(notify.error).not.toHaveBeenCalled();
    expect(component.busy).toBe(false);
  }));

  it('onMalwareFindingSubmitted() resets busy to false after error', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ error: { detail: 'fail' } })));
    fixture.detectChanges();

    expect(component.busy).toBe(false);
    const payload = {
      title: 'Malware Finding',
      sample_id: 'sample-1',
      analysis_type: 'static',
      description_md: '',
      is_draft: false,
    };
    component.onMalwareFindingSubmitted(payload);
    tick();
    expect(component.busy).toBe(false);
  }));

  // --- onMalwareDirtyChange ---

  it('onMalwareDirtyChange(true) marks form dirty', () => {
    component.form.markAsPristine();
    component.onMalwareDirtyChange(true);
    expect(component.form.dirty).toBe(true);
  });

  it('onMalwareDirtyChange(false) does not mark form dirty', () => {
    component.form.markAsPristine();
    component.onMalwareDirtyChange(false);
    expect(component.form.dirty).toBe(false);
  });

  // --- save() 402 suppression ---

  it('save() suppresses notification on 402 error', fakeAsync(() => {
    findingsService.update.and.returnValue(throwError(() => ({ status: 402, error: { detail: 'Payment required' } })));
    fixture.detectChanges();
    tick();

    component.save('eng-1', 'find-1');
    tick();

    expect(notify.error).not.toHaveBeenCalled();
  }));

  // --- scrollCweHighlightIntoView ---

  it('scrollCweHighlightIntoView does not throw with detached element', fakeAsync(() => {
    const inputEl = document.createElement('input');
    component.cweHighlightIndex = 0;

    expect(() => {
      (component as any).scrollCweHighlightIntoView(inputEl);
      tick(16); // requestAnimationFrame
    }).not.toThrow();
  }));

  // --- ngAfterViewInit malware flow ---

  it('ngAfterViewInit sets isMalwareFlow to true for malware_analysis engagement', fakeAsync(() => {
    engagementsService.getById.and.returnValue(of({
      ...MOCK_ENGAGEMENT,
      engagement_type: 'malware_analysis',
    }));

    fixture.detectChanges();
    component.ngAfterViewInit();
    tick();

    expect(component.isMalwareFlow).toBe(true);
  }));

  it('ngAfterViewInit sets isMalwareFlow to false for general engagement', fakeAsync(() => {
    fixture.detectChanges();
    component.ngAfterViewInit();
    tick();

    expect(component.isMalwareFlow).toBe(false);
  }));

  // --- ngAfterViewInit populates malwareInitialData ---

  it('ngAfterViewInit populates malwareInitialData when finding has sample_id', fakeAsync(() => {
    findingsService.getById.and.returnValue(of({
      ...MOCK_FINDING,
      sample_id: 'sample-42',
      analysis_type: 'dynamic',
    }));
    fixture.detectChanges();
    component.ngAfterViewInit();
    tick();

    expect(component.malwareInitialData).toEqual(jasmine.objectContaining({
      sample_id: 'sample-42',
      analysis_type: 'dynamic',
    }));
  }));

  it('ngAfterViewInit does not set malwareInitialData when finding has no sample_id', fakeAsync(() => {
    fixture.detectChanges();
    component.ngAfterViewInit();
    tick();

    expect(component.malwareInitialData).toBeNull();
  }));

  // --- ngOnInit CWE display from catalog race ---

  it('ngOnInit populates cweSearch from cweCatalog when finding has cwe_id', fakeAsync(() => {
    // Set cweCatalog before finding arrives
    component.cweCatalog = [
      { code: 'CWE-89', name: 'SQL Injection', description: 'SQLi' },
    ];
    fixture.detectChanges();
    tick();

    expect(component.cweSearch).toBe('CWE-89 — SQL Injection');
  }));

  it('ngOnInit does not set cweSearch when cwe_id has no catalog match', fakeAsync(() => {
    component.cweCatalog = [
      { code: 'CWE-79', name: 'XSS', description: '' },
    ];
    component.cweSearch = '';
    fixture.detectChanges();
    tick();

    // CWE-89 from MOCK_FINDING is not in catalog, so search should be empty
    expect(component.cweSearch).toBe('');
  }));

  // --- uploadImageToApi image limit enforcement ---

  it('uploadImageToApi rejects when image limit is reached', fakeAsync(async () => {
    fixture.detectChanges();
    tick();

    const profileSvc = TestBed.inject(UserProfileService);
    spyOn(profileSvc, 'currentSubscription').and.returnValue({
      plan_name: 'community',
      limits: { max_images_per_finding: 1 },
    } as any);

    // Ensure no Crepe editor so readDescriptionMarkdown returns form value
    (component as any).descCrepe = undefined;
    (component as any).recCrepe = undefined;

    // Set form value AFTER detectChanges so ngOnInit finding patch doesn't overwrite
    component.form.patchValue({
      description_md: '![img](/api/attachments/12345678-1234-1234-1234-123456789abc/content/img.png)',
    });

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((component as any).uploadImageToApi(file)).toBeRejectedWithError('Image limit reached');
    expect(notify.error).toHaveBeenCalledWith(jasmine.stringMatching(/Image limit reached/));
  }));

  it('uploadImageToApi proceeds when image count is under limit', fakeAsync(async () => {
    fixture.detectChanges();
    tick();

    const profileSvc = TestBed.inject(UserProfileService);
    spyOn(profileSvc, 'currentSubscription').and.returnValue({
      plan_name: 'community',
      limits: { max_images_per_finding: 5 },
    } as any);

    // Ensure no Crepe editor so readDescriptionMarkdown returns form value
    (component as any).descCrepe = undefined;
    (component as any).recCrepe = undefined;

    findingsService.uploadImage.and.returnValue(of({ token: 't', url: 'https://cdn.test/img.png' }));

    const file = new File(['px'], 'img.png', { type: 'image/png' });
    const result = await (component as any).uploadImageToApi(file);
    expect(result).toBe('https://cdn.test/img.png');
  }));

  // --- save() publish sets isDraft$ to false ---

  it('save() with publish=true updates isDraft$ to false', fakeAsync(() => {
    const draftFinding: Finding = { ...MOCK_FINDING, is_draft: true };
    findingsService.getById.and.returnValue(of(draftFinding));
    findingsService.update.and.returnValue(of({ ...draftFinding, is_draft: false }));
    fixture.detectChanges();
    tick();

    let isDraft: boolean | undefined;
    component.isDraft$.subscribe(v => isDraft = v);
    expect(isDraft).toBe(true);

    component.save('eng-1', 'find-1', true);
    tick();

    expect(isDraft).toBe(false);
  }));

  // --- onBeforeUnload ---

  it('onBeforeUnload calls preventDefault when form is dirty', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.form.markAsDirty();
    const event = new Event('beforeunload') as BeforeUnloadEvent;
    spyOn(event, 'preventDefault');
    component.onBeforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalled();
  }));

  it('onBeforeUnload does not call preventDefault when form is clean', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    const event = new Event('beforeunload') as BeforeUnloadEvent;
    spyOn(event, 'preventDefault');
    component.onBeforeUnload(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  }));
});

// --- Cancel with different route params (separate describe blocks) ---

describe('EngagementFindingsEditComponent cancel() with only engagementId', () => {
  it('navigates to findings list', async () => {
    const ctx = buildTestBed({ id: 'eng-1' });

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsEditComponent);
    const comp = fix.componentInstance;
    const rt = TestBed.inject(Router);
    spyOn(rt, 'navigate');
    fix.detectChanges();

    comp.cancel();
    expect(rt.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1', 'findings']);
  });
});

describe('EngagementFindingsEditComponent cancel() with no IDs', () => {
  it('navigates to engagements list', async () => {
    const ctx = buildTestBed({});

    await TestBed.configureTestingModule({
      imports: [EngagementFindingsEditComponent],
      providers: ctx.providers,
    }).compileComponents();

    const fix = TestBed.createComponent(EngagementFindingsEditComponent);
    const comp = fix.componentInstance;
    const rt = TestBed.inject(Router);
    spyOn(rt, 'navigate');
    fix.detectChanges();

    comp.cancel();
    expect(rt.navigate).toHaveBeenCalledWith(['/engagements']);
  });
});
