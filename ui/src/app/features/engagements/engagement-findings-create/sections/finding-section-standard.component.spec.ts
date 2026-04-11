import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { FindingSectionStandardComponent, StandardFindingPayload } from './finding-section-standard.component';
import { FindingsService } from '../../services/findings.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { Asset } from '../../../assets/models/asset.model';

const MOCK_ASSETS: Asset[] = [
  {
    id: 'asset-1', name: 'WebApp Main', client_id: 'c-1', client_name: 'Acme', asset_type: 'webapp',
    environment: 'prod', criticality: 'high', target: 'https://app.test', notes: '', attributes: {},
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'asset-2', name: 'API Gateway', client_id: 'c-1', client_name: 'Acme', asset_type: 'api',
    environment: 'prod', criticality: 'high', target: 'https://api.test', notes: '', attributes: {},
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
];

function buildTestBed() {
  const findSvc = jasmine.createSpyObj('FindingsService', ['uploadImage']);
  const notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);

  return {
    findSvc,
    notifySpy,
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: FindingsService, useValue: findSvc },
      { provide: NotificationService, useValue: notifySpy },
    ],
  };
}

describe('FindingSectionStandardComponent', () => {
  let component: FindingSectionStandardComponent;
  let fixture: ComponentFixture<FindingSectionStandardComponent>;
  let findingsService: jasmine.SpyObj<FindingsService>;
  let notify: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    const ctx = buildTestBed();
    findingsService = ctx.findSvc;
    notify = ctx.notifySpy;

    await TestBed.configureTestingModule({
      imports: [FindingSectionStandardComponent],
      providers: ctx.providers,
    }).compileComponents();

    fixture = TestBed.createComponent(FindingSectionStandardComponent);
    component = fixture.componentInstance;
    component.engagementId = 'eng-1';
    component.scopeAssets$ = of(MOCK_ASSETS);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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

  it('form becomes invalid when title is too short', () => {
    component.form.patchValue({ title: 'abc', asset_id: 'asset-1' });
    expect(component.form.valid).toBe(false);
  });

  it('form remains valid when assessment_area is cleared (optional field)', () => {
    component.form.patchValue({ title: 'Valid Title Here', asset_id: 'asset-1', assessment_area: '' });
    expect(component.form.valid).toBe(true);
  });

  // --- isInvalid ---

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

  it('isInvalid() returns true for dirty invalid field', () => {
    component.form.get('title')?.markAsDirty();
    expect(component.isInvalid('title')).toBe(true);
  });

  it('isInvalid() returns false for non-existent field', () => {
    expect(component.isInvalid('nonexistent')).toBe(false);
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

  // --- initialData ---

  it('patches form from initialData on ngAfterViewInit', () => {
    component.initialData = {
      title: 'SQL Injection',
      assessment_area: 'web_security',
      severity: 'high',
      status: 'open',
      asset_id: 'asset-1',
      description_md: '# Desc',
      recommendation_md: '# Fix',
    };
    component.ngAfterViewInit();

    expect(component.form.get('title')?.value).toBe('SQL Injection');
    expect(component.form.get('assessment_area')?.value).toBe('web_security');
    expect(component.form.get('severity')?.value).toBe('high');
    expect(component.form.get('description_md')?.value).toBe('# Desc');
  });

  it('marks form pristine after patching initialData', () => {
    component.initialData = { title: 'Test Title' };
    component.ngAfterViewInit();
    expect(component.form.pristine).toBe(true);
  });

  // --- CWE typeahead ---

  it('onCweInput filters cweCatalog by code match', () => {
    component.cweCatalog = [
      { code: 'CWE-79', name: 'Cross-site Scripting', description: 'XSS' },
      { code: 'CWE-89', name: 'SQL Injection', description: 'SQLi' },
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
    component.cweFiltered = [{ code: 'CWE-79', name: 'XSS', description: '' }];
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
    component.cweFiltered = [{ code: 'CWE-79', name: 'XSS', description: '' }];
    component.cweHighlightIndex = -1;

    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    spyOn(event, 'preventDefault');
    component.onCweKeydown(event);
    expect(component.form.get('cwe_id')?.value).toBe('');
  });

  it('onCweKeydown Escape closes dropdown', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [{ code: 'CWE-79', name: 'XSS', description: '' }];
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
    component.cweFiltered = [{ code: 'CWE-79', name: 'XSS', description: '' }];
    component.cweHighlightIndex = -1;

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
    component.onCweKeydown(event);
    expect(component.cweHighlightIndex).toBe(-1);
  });

  it('onCweKeydown ignores unrecognized keys', () => {
    component.cweDropdownOpen = true;
    component.cweFiltered = [{ code: 'CWE-79', name: 'XSS', description: '' }];
    component.cweHighlightIndex = 0;

    const event = new KeyboardEvent('keydown', { key: 'Tab' });
    component.onCweKeydown(event);
    expect(component.cweHighlightIndex).toBe(0);
    expect(component.cweDropdownOpen).toBe(true);
  });

  it('selectCwe sets form value and display text', () => {
    component.selectCwe({ code: 'CWE-79', name: 'Cross-site Scripting', description: '' });
    expect(component.form.get('cwe_id')?.value).toBe('CWE-79');
    expect(component.cweSearch).toBe('CWE-79 — Cross-site Scripting');
    expect(component.cweDropdownOpen).toBe(false);
    expect(component.cweHighlightIndex).toBe(-1);
  });

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

  // --- scrollCweHighlightIntoView ---

  it('scrollCweHighlightIntoView does not throw with detached element', fakeAsync(() => {
    const inputEl = document.createElement('input');
    component.cweHighlightIndex = 0;
    expect(() => {
      (component as any).scrollCweHighlightIntoView(inputEl);
      tick(16);
    }).not.toThrow();
  }));

  // --- Editors ---

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

  it('tryInitDescEditor() does not init when viewReady is false', () => {
    (component as any).descEditorEl = document.createElement('div');
    (component as any).tryInitDescEditor();
    expect((component as any).descEditorInited).toBe(false);
  });

  it('tryInitDescEditor() does not init when descEditorEl is missing', () => {
    (component as any).viewReady = true;
    (component as any).mdReady = true;
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

  it('tryInitRecEditor() does not init when viewReady is false', () => {
    (component as any).recEditorEl = document.createElement('div');
    (component as any).tryInitRecEditor();
    expect((component as any).recEditorInited).toBe(false);
  });

  it('tryInitRecEditor() does not init when recEditorEl is missing', () => {
    (component as any).viewReady = true;
    (component as any).mdReady = true;
    (component as any).tryInitRecEditor();
    expect((component as any).recEditorInited).toBe(false);
  });

  it('tryInitRecEditor() does not double-init', () => {
    (component as any).viewReady = true;
    (component as any).mdReady = true;
    (component as any).recEditorEl = document.createElement('div');
    (component as any).recEditorInited = true;
    (component as any).tryInitRecEditor();
    expect((component as any).recCrepe).toBeUndefined();
  });

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

  // --- readMarkdown ---

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

  it('readDescriptionMarkdown() returns empty string when form value is null', async () => {
    component.form.patchValue({ description_md: null as any });
    const result = await (component as any).readDescriptionMarkdown();
    expect(result).toBe('');
  });

  it('readRecommendationMarkdown() returns empty string when form value is null', async () => {
    component.form.patchValue({ recommendation_md: null as any });
    const result = await (component as any).readRecommendationMarkdown();
    expect(result).toBe('');
  });

  // --- uploadImageToApi ---

  it('uploadImageToApi() returns absolute URL unchanged', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: 'https://cdn.test/img.png' }));
    const file = new File(['px'], 'img.png', { type: 'image/png' });
    const result = await (component as any).uploadImageToApi(file);
    expect(result).toBe('https://cdn.test/img.png');
  });

  it('uploadImageToApi() prepends apiUrl to relative URL', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: '/media/img.png' }));
    const file = new File(['px'], 'img.png', { type: 'image/png' });
    const result = await (component as any).uploadImageToApi(file);
    expect(result).toContain('/media/img.png');
  });

  it('uploadImageToApi() adds leading slash to relative URL without one', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: 'media/img.png' }));
    const file = new File(['px'], 'img.png', { type: 'image/png' });
    const result = await (component as any).uploadImageToApi(file);
    expect(result).toContain('/media/img.png');
  });

  it('uploadImageToApi() throws when URL is empty', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: '' }));
    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((component as any).uploadImageToApi(file)).toBeRejectedWithError('Upload succeeded but no image URL was returned.');
  });

  it('uploadImageToApi calls notify.error on failure', async () => {
    findingsService.uploadImage.and.returnValue(throwError(() => ({ error: { message: 'Network error' } })));
    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((component as any).uploadImageToApi(file)).toBeRejected();
    expect(notify.error).toHaveBeenCalledWith('Image upload failed: Network error');
    expect(component.imageUploading).toBe(false);
  });

  it('uploadImageToApi calls notify.error with unknown error when no message', async () => {
    findingsService.uploadImage.and.returnValue(throwError(() => ({})));
    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((component as any).uploadImageToApi(file)).toBeRejected();
    expect(notify.error).toHaveBeenCalledWith('Image upload failed: Unknown error');
  });

  it('uploadImageToApi sets imageUploading during upload', async () => {
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: 'https://cdn.test/img.png' }));
    const file = new File(['px'], 'img.png', { type: 'image/png' });
    expect(component.imageUploading).toBe(false);
    await (component as any).uploadImageToApi(file);
    expect(component.imageUploading).toBe(false);
  });

  it('uploadImageToApi rejects when image limit is reached', async () => {
    const profileSvc = TestBed.inject(UserProfileService);
    spyOn(profileSvc, 'currentSubscription').and.returnValue({
      plan_name: 'community', limits: { max_images_per_finding: 1 },
    } as any);
    component.form.patchValue({
      description_md: '![img](/api/attachments/12345678-1234-1234-1234-123456789abc/content/img.png)',
    });
    const file = new File(['px'], 'img.png', { type: 'image/png' });
    await expectAsync((component as any).uploadImageToApi(file)).toBeRejectedWithError('Image limit reached');
    expect(notify.error).toHaveBeenCalledWith(jasmine.stringMatching(/Image limit reached/));
  });

  it('uploadImageToApi proceeds when image count is under limit', async () => {
    const profileSvc = TestBed.inject(UserProfileService);
    spyOn(profileSvc, 'currentSubscription').and.returnValue({
      plan_name: 'community', limits: { max_images_per_finding: 5 },
    } as any);
    findingsService.uploadImage.and.returnValue(of({ token: 't', url: 'https://cdn.test/img.png' }));
    const file = new File(['px'], 'img.png', { type: 'image/png' });
    const result = await (component as any).uploadImageToApi(file);
    expect(result).toBe('https://cdn.test/img.png');
  });

  // --- Submit / Save ---

  it('onSubmit emits submitted with form values in create mode', fakeAsync(() => {
    component.mode = 'create';
    component.form.patchValue({ title: 'XSS in Search', asset_id: 'asset-1' });

    let emitted: StandardFindingPayload | undefined;
    component.submitted.subscribe(p => (emitted = p));
    component.onSubmit();
    tick();

    expect(emitted).toBeDefined();
    expect(emitted!.title).toBe('XSS in Search');
    expect(emitted!.asset_id).toBe('asset-1');
    expect(emitted!.severity).toBe('medium');
    expect(emitted!.is_draft).toBe(false);
  }));

  it('onSubmit does nothing when form is invalid in create mode', fakeAsync(() => {
    component.mode = 'create';
    let emitted = false;
    component.submitted.subscribe(() => (emitted = true));
    component.onSubmit();
    tick();
    expect(emitted).toBe(false);
  }));

  it('saveAsDraft emits with is_draft=true when title is valid', fakeAsync(() => {
    component.form.patchValue({ title: 'Draft Finding Title' });

    let emitted: StandardFindingPayload | undefined;
    component.submitted.subscribe(p => (emitted = p));
    component.saveAsDraft();
    tick();

    expect(emitted).toBeDefined();
    expect(emitted!.is_draft).toBe(true);
  }));

  it('saveAsDraft fails when title is too short', fakeAsync(() => {
    component.form.patchValue({ title: 'ab' });
    let emitted = false;
    component.submitted.subscribe(() => (emitted = true));
    component.saveAsDraft();
    tick();
    expect(emitted).toBe(false);
  }));

  it('saveAsDraft fails when title is empty', fakeAsync(() => {
    component.form.patchValue({ title: '' });
    let emitted = false;
    component.submitted.subscribe(() => (emitted = true));
    component.saveAsDraft();
    tick();
    expect(emitted).toBe(false);
  }));

  it('onSubmit marks all fields touched on full validation', fakeAsync(() => {
    component.mode = 'create';
    expect(component.form.get('title')?.touched).toBe(false);
    component.onSubmit();
    tick();
    expect(component.form.get('title')?.touched).toBe(true);
  }));

  it('onSubmit sends description_md and recommendation_md', fakeAsync(() => {
    component.form.patchValue({
      title: 'XSS in Search', asset_id: 'asset-1',
      description_md: '# Details', recommendation_md: '# Fix',
    });

    let emitted: StandardFindingPayload | undefined;
    component.submitted.subscribe(p => (emitted = p));
    component.onSubmit();
    tick();

    expect(emitted!.description_md).toContain('# Details');
    expect(emitted!.recommendation_md).toContain('# Fix');
  }));

  it('publish emits with is_draft=false and full validation', fakeAsync(() => {
    component.mode = 'edit';
    component.isDraft = true;
    component.form.patchValue({ title: 'Finding Title', asset_id: 'asset-1' });

    let emitted: StandardFindingPayload | undefined;
    component.submitted.subscribe(p => (emitted = p));
    component.publish();
    tick();

    expect(emitted).toBeDefined();
    expect(emitted!.is_draft).toBe(false);
  }));

  it('publish fails when form is invalid', fakeAsync(() => {
    component.mode = 'edit';
    component.isDraft = true;
    let emitted = false;
    component.submitted.subscribe(() => (emitted = true));
    component.publish();
    tick();
    expect(emitted).toBe(false);
  }));

  it('onSubmit in edit draft mode uses title-only validation', fakeAsync(() => {
    component.mode = 'edit';
    component.isDraft = true;
    component.form.patchValue({ title: 'Draft Title Here' });

    let emitted: StandardFindingPayload | undefined;
    component.submitted.subscribe(p => (emitted = p));
    component.onSubmit();
    tick();

    expect(emitted).toBeDefined();
    expect(emitted!.is_draft).toBe(true);
    expect(emitted!.asset_id).toBe(''); // not required for draft
  }));

  it('doSave shows editor error when readDescriptionMarkdown rejects', fakeAsync(() => {
    component.form.patchValue({ title: 'XSS in Search', asset_id: 'asset-1' });
    (component as any).descCrepe = {};
    (component as any).descReady = Promise.reject(new Error('Editor crashed'));
    component.onSubmit();
    tick();
    expect(notify.error).toHaveBeenCalledWith('Editor crashed');
  }));

  it('doSave shows generic message when editor throws without message', fakeAsync(() => {
    component.form.patchValue({ title: 'XSS in Search', asset_id: 'asset-1' });
    (component as any).descCrepe = {};
    (component as any).descReady = Promise.reject({});
    component.onSubmit();
    tick();
    expect(notify.error).toHaveBeenCalledWith('Editor not ready.');
  }));

  // --- Cancel ---

  it('cancel emits cancelled', () => {
    let emitted = false;
    component.cancelled.subscribe(() => (emitted = true));
    component.cancel();
    expect(emitted).toBe(true);
  });

  // --- dirtyChange ---

  it('emits dirtyChange when form value changes after ngAfterViewInit', fakeAsync(() => {
    component.ngAfterViewInit();
    let dirty: boolean | undefined;
    component.dirtyChange.subscribe(d => (dirty = d));
    component.form.patchValue({ title: 'changed' });
    expect(dirty).toBeDefined();
  }));

  // --- ngAfterViewInit ---

  it('ngAfterViewInit sets viewReady and mdReady', () => {
    expect((component as any).viewReady).toBe(false);
    expect((component as any).mdReady).toBe(false);
    component.ngAfterViewInit();
    expect((component as any).viewReady).toBe(true);
    expect((component as any).mdReady).toBe(true);
  });
});
