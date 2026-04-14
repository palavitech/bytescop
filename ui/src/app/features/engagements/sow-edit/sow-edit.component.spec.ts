import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { SowEditComponent } from './sow-edit.component';
import { SowService } from '../services/sow.service';
import { EngagementsService } from '../services/engagements.service';
import { AssetsService } from '../../assets/services/assets.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { Engagement } from '../models/engagement.model';
import { Sow } from '../models/sow.model';
import { Asset } from '../../assets/models/asset.model';

const MOCK_SOW: Sow = {
  id: 'sow-1',
  title: 'Test SoW',
  status: 'draft' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-1',
  name: 'Test Engagement',
  client_id: 'client-1',
  client_name: 'Acme Corp',
  status: 'planned' as const,
  description: '',
  notes: '',
  start_date: '2026-01-01',
  end_date: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  findings_summary: null,
  engagement_type: 'general',
};

const MOCK_ASSET: Asset = {
  id: 'asset-1',
  name: 'Web App',
  client_id: 'client-1',
  client_name: 'Acme',
  asset_type: 'webapp',
  environment: 'prod',
  criticality: 'high',
  target: 'https://example.com',
  notes: '',
  attributes: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_ASSET_2: Asset = {
  id: 'asset-2',
  name: 'API Server',
  client_id: 'client-1',
  client_name: 'Acme',
  asset_type: 'api',
  environment: 'prod',
  criticality: 'medium',
  target: 'https://api.example.com',
  notes: '',
  attributes: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function buildTestBed(routeParams: Record<string, string> = { id: 'eng-1' }) {
  const paramMap$ = new BehaviorSubject(convertToParamMap(routeParams));
  const locationSpy = jasmine.createSpyObj('Location', ['back']);
  const sowSvc = jasmine.createSpyObj('SowService', ['get', 'update', 'listScope', 'addScope', 'removeScope']);
  const engSvc = jasmine.createSpyObj('EngagementsService', ['getById']);
  const assetsSvc = jasmine.createSpyObj('AssetsService', ['list']);
  const notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
  const permSpy = jasmine.createSpyObj('PermissionService', ['has', 'hasAny$']);

  sowSvc.get.and.returnValue(of(MOCK_SOW));
  sowSvc.listScope.and.returnValue(of([]));
  engSvc.getById.and.returnValue(of(MOCK_ENGAGEMENT));
  assetsSvc.list.and.returnValue(of([MOCK_ASSET, MOCK_ASSET_2]));
  permSpy.has.and.returnValue(true);
  permSpy.hasAny$.and.returnValue(of(true));

  return {
    paramMap$,
    locationSpy,
    sowSvc,
    engSvc,
    assetsSvc,
    notifySpy,
    permSpy,
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Location, useValue: locationSpy },
      { provide: SowService, useValue: sowSvc },
      { provide: EngagementsService, useValue: engSvc },
      { provide: AssetsService, useValue: assetsSvc },
      { provide: NotificationService, useValue: notifySpy },
      { provide: PermissionService, useValue: permSpy },
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

describe('SowEditComponent', () => {
  let component: SowEditComponent;
  let fixture: ComponentFixture<SowEditComponent>;
  let router: Router;
  let locationSpy: jasmine.SpyObj<Location>;
  let sowService: jasmine.SpyObj<SowService>;
  let engagementsService: jasmine.SpyObj<EngagementsService>;
  let assetsService: jasmine.SpyObj<AssetsService>;
  let notify: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    const ctx = buildTestBed();
    locationSpy = ctx.locationSpy;
    sowService = ctx.sowSvc;
    engagementsService = ctx.engSvc;
    assetsService = ctx.assetsSvc;
    notify = ctx.notifySpy;

    await TestBed.configureTestingModule({
      imports: [SowEditComponent],
      providers: ctx.providers,
    }).compileComponents();

    fixture = TestBed.createComponent(SowEditComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- Data loading ---

  it('loads SoW on init', () => {
    fixture.detectChanges();
    expect(sowService.get).toHaveBeenCalledWith('eng-1');
  });

  it('loads engagement on init', () => {
    fixture.detectChanges();
    expect(engagementsService.getById).toHaveBeenCalledWith('eng-1');
  });

  it('patches form title from loaded SoW', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.form.get('title')?.value).toBe('Test SoW');
  }));

  it('sets currentStatus$ from loaded SoW', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.currentStatus$.value).toBe('draft');
  }));

  it('sets loading$ to false after SoW load', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.loading$.value).toBe(false);
  }));

  // --- SoW load error ---

  it('shows error notification when SoW fails to load', fakeAsync(() => {
    sowService.get.and.returnValue(throwError(() => new Error('Network error')));

    fixture.detectChanges();
    tick();

    expect(notify.error).toHaveBeenCalledWith('Failed to load statement of work.');
    expect(component.loading$.value).toBe(false);
  }));

  // --- Engagement load error ---

  it('handles engagement load error silently', fakeAsync(() => {
    engagementsService.getById.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    tick();

    // Should not throw, engagement$ remains null
    expect(component.engagement$.value).toBeNull();
  }));

  // --- Form ---

  it('form has only a title control', () => {
    fixture.detectChanges();
    expect(component.form.get('title')).toBeTruthy();
    expect(component.form.get('status')).toBeNull();
  });

  // --- save() ---

  it('save() calls sowService.update with only title', fakeAsync(() => {
    const updatedSow = { ...MOCK_SOW, title: 'Updated Title' };
    sowService.update.and.returnValue(of(updatedSow));

    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: 'Updated Title' });
    component.save();
    tick();

    expect(sowService.update).toHaveBeenCalledWith('eng-1', { title: 'Updated Title' });
  }));

  it('save() does not include status in the update payload', fakeAsync(() => {
    const updatedSow = { ...MOCK_SOW, title: 'New Title' };
    sowService.update.and.returnValue(of(updatedSow));

    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: 'New Title' });
    component.save();
    tick();

    const callArgs = sowService.update.calls.mostRecent().args[1];
    expect(callArgs).toEqual({ title: 'New Title' });
    expect((callArgs as Record<string, unknown>)['status']).toBeUndefined();
  }));

  it('save() navigates on success', fakeAsync(() => {
    sowService.update.and.returnValue(of(MOCK_SOW));

    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: 'Updated Title' });
    component.save();
    tick();

    expect(router.navigate).toHaveBeenCalledWith(['/engagements', 'eng-1']);
  }));

  it('save() shows error on failure', fakeAsync(() => {
    sowService.update.and.returnValue(throwError(() => ({ error: { detail: 'Title too long' } })));

    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: 'X' });
    component.save();
    tick();

    expect(notify.error).toHaveBeenCalledWith('Title too long');
    expect(component.serverError$.value).toBe('Title too long');
  }));

  it('save() shows generic error when API returns no detail', fakeAsync(() => {
    sowService.update.and.returnValue(throwError(() => ({})));

    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: 'X' });
    component.save();
    tick();

    expect(notify.error).toHaveBeenCalledWith('Failed to update statement of work.');
  }));

  it('save() does nothing when form is invalid', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: '' });
    component.save();
    tick();

    expect(sowService.update).not.toHaveBeenCalled();
  }));

  it('save() sets saving$ back to false after completion', fakeAsync(() => {
    sowService.update.and.returnValue(of(MOCK_SOW));

    fixture.detectChanges();
    tick();

    component.form.patchValue({ title: 'X' });
    expect(component.saving$.value).toBe(false);
    component.save();
    tick();

    expect(component.saving$.value).toBe(false);
  }));

  it('save() clears serverError$ before sending', fakeAsync(() => {
    sowService.update.and.returnValue(of(MOCK_SOW));
    fixture.detectChanges();
    tick();

    component.serverError$.next('old error');
    component.form.patchValue({ title: 'X' });
    component.save();
    tick();

    // Error was cleared (then not set again on success)
    expect(component.serverError$.value).toBeNull();
  }));

  // --- toggleStatus() ---

  it('toggleStatus() calls sowService.update with approved when current is draft', fakeAsync(() => {
    const updatedSow = { ...MOCK_SOW, status: 'approved' as const };
    sowService.update.and.returnValue(of(updatedSow));

    fixture.detectChanges();
    tick();

    component.toggleStatus();
    tick();

    expect(sowService.update).toHaveBeenCalledWith('eng-1', { status: 'approved' });
    expect(component.currentStatus$.value).toBe('approved');
  }));

  it('toggleStatus() calls sowService.update with draft when current is approved', fakeAsync(() => {
    const approvedSow = { ...MOCK_SOW, status: 'approved' as const };
    sowService.get.and.returnValue(of(approvedSow));
    const revertedSow = { ...MOCK_SOW, status: 'draft' as const };
    sowService.update.and.returnValue(of(revertedSow));

    fixture.detectChanges();
    tick();

    component.toggleStatus();
    tick();

    expect(sowService.update).toHaveBeenCalledWith('eng-1', { status: 'draft' });
    expect(component.currentStatus$.value).toBe('draft');
  }));

  it('toggleStatus() shows error on failure', fakeAsync(() => {
    sowService.update.and.returnValue(throwError(() => ({ error: { detail: 'Not allowed' } })));

    fixture.detectChanges();
    tick();

    component.toggleStatus();
    tick();

    expect(notify.error).toHaveBeenCalledWith('Not allowed');
    expect(component.serverError$.value).toBe('Not allowed');
  }));

  it('toggleStatus() shows generic error when API returns no detail', fakeAsync(() => {
    sowService.update.and.returnValue(throwError(() => ({})));

    fixture.detectChanges();
    tick();

    component.toggleStatus();
    tick();

    expect(notify.error).toHaveBeenCalledWith('Failed to update status.');
  }));

  it('toggleStatus() sets toggling$ during operation', fakeAsync(() => {
    sowService.update.and.returnValue(of(MOCK_SOW));
    fixture.detectChanges();
    tick();

    expect(component.toggling$.value).toBe(false);
    component.toggleStatus();
    tick();

    expect(component.toggling$.value).toBe(false);
  }));

  it('toggleStatus() clears serverError$ before request', fakeAsync(() => {
    sowService.update.and.returnValue(of(MOCK_SOW));
    fixture.detectChanges();
    tick();

    component.serverError$.next('old error');
    component.toggleStatus();
    tick();

    expect(component.serverError$.value).toBeNull();
  }));

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

  // --- isScopeLockedByApproval ---

  it('isScopeLockedByApproval returns false when status is draft', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(component.isScopeLockedByApproval).toBe(false);
  }));

  it('isScopeLockedByApproval returns true when status is approved', fakeAsync(() => {
    const approvedSow = { ...MOCK_SOW, status: 'approved' as const };
    sowService.get.and.returnValue(of(approvedSow));

    fixture.detectChanges();
    tick();

    expect(component.isScopeLockedByApproval).toBe(true);
  }));

  // --- Template rendering ---

  it('renders "Edit Statement of Work" title', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const h1 = fixture.nativeElement.querySelector('.bc-h1');
    expect(h1?.textContent).toContain('Edit Statement of Work');
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
});
