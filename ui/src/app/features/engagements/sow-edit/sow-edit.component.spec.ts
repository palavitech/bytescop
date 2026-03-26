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

  // --- Scope management: _loadScopeData ---

  it('loads scope and available assets after engagement loads', fakeAsync(() => {
    sowService.listScope.and.returnValue(of([MOCK_ASSET]));
    assetsService.list.and.returnValue(of([MOCK_ASSET, MOCK_ASSET_2]));

    fixture.detectChanges();
    tick();

    const scopeVm = component.scopeVm$.value;
    expect(scopeVm.state).toBe('ready');
    expect(scopeVm.assets).toEqual([MOCK_ASSET]);
    expect(scopeVm.total).toBe(1);

    // Available should exclude already-scoped asset
    const available = component.availableAssets$.value;
    expect(available.length).toBe(1);
    expect(available[0].id).toBe('asset-2');
  }));

  it('sets scope error state when listScope fails', fakeAsync(() => {
    sowService.listScope.and.returnValue(throwError(() => new Error('fail')));
    assetsService.list.and.returnValue(of([MOCK_ASSET]));

    fixture.detectChanges();
    tick();

    const scopeVm = component.scopeVm$.value;
    expect(scopeVm.state).toBe('error');
    // Available should still contain all client assets
    expect(component.availableAssets$.value).toEqual([MOCK_ASSET]);
  }));

  it('handles null client_id by returning empty assets list', fakeAsync(() => {
    const engNoClient = { ...MOCK_ENGAGEMENT, client_id: null };
    engagementsService.getById.and.returnValue(of(engNoClient));

    fixture.detectChanges();
    tick();

    expect(assetsService.list).not.toHaveBeenCalled();
  }));

  // --- addAsset ---

  it('addAsset() does nothing when selectedAssetId is empty', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.selectedAssetId = '';
    component.addAsset();

    expect(sowService.addScope).not.toHaveBeenCalled();
  }));

  it('addAsset() calls addScope and refreshes on success', fakeAsync(() => {
    sowService.addScope.and.returnValue(of(undefined as any));
    sowService.listScope.and.returnValue(of([MOCK_ASSET]));

    fixture.detectChanges();
    tick();

    component.selectedAssetId = 'asset-2';
    component.addAsset();
    tick();

    expect(sowService.addScope).toHaveBeenCalledWith('eng-1', 'asset-2');
    expect(component.selectedAssetId).toBe('');
    expect(component.addingScope$.value).toBe(false);
    expect(notify.success).not.toHaveBeenCalled();
  }));

  it('addAsset() shows error on failure', fakeAsync(() => {
    sowService.addScope.and.returnValue(throwError(() => ({ error: { detail: 'Duplicate' } })));

    fixture.detectChanges();
    tick();

    component.selectedAssetId = 'asset-2';
    component.addAsset();
    tick();

    expect(component.addingScope$.value).toBe(false);
    expect(notify.error).toHaveBeenCalledWith('Duplicate');
  }));

  it('addAsset() shows generic error when no detail', fakeAsync(() => {
    sowService.addScope.and.returnValue(throwError(() => ({})));

    fixture.detectChanges();
    tick();

    component.selectedAssetId = 'asset-2';
    component.addAsset();
    tick();

    expect(notify.error).toHaveBeenCalledWith('Failed to add asset to scope.');
  }));

  // --- confirmRemove / cancelRemove / removeAsset ---

  it('confirmRemove() sets confirmingRemoveId$', () => {
    component.confirmRemove('asset-1');
    expect(component.confirmingRemoveId$.value).toBe('asset-1');
  });

  it('cancelRemove() clears confirmingRemoveId$', () => {
    component.confirmRemove('asset-1');
    component.cancelRemove();
    expect(component.confirmingRemoveId$.value).toBeNull();
  });

  it('removeAsset() calls removeScope and refreshes on success', fakeAsync(() => {
    sowService.removeScope.and.returnValue(of(undefined as any));
    sowService.listScope.and.returnValue(of([]));

    fixture.detectChanges();
    tick();

    component.removeAsset('asset-1');
    tick();

    expect(sowService.removeScope).toHaveBeenCalledWith('eng-1', 'asset-1');
    expect(component.removingAssetId$.value).toBeNull();
    expect(component.confirmingRemoveId$.value).toBeNull();
  }));

  it('removeAsset() shows error on failure', fakeAsync(() => {
    sowService.removeScope.and.returnValue(throwError(() => ({ error: { detail: 'Has findings' } })));

    fixture.detectChanges();
    tick();

    component.removeAsset('asset-1');
    tick();

    expect(component.removingAssetId$.value).toBeNull();
    expect(component.confirmingRemoveId$.value).toBeNull();
    expect(notify.error).toHaveBeenCalledWith('Has findings');
  }));

  it('removeAsset() shows generic error when no detail', fakeAsync(() => {
    sowService.removeScope.and.returnValue(throwError(() => ({})));

    fixture.detectChanges();
    tick();

    component.removeAsset('asset-1');
    tick();

    expect(notify.error).toHaveBeenCalledWith('Failed to remove asset from scope.');
  }));

  // --- refreshScope ---

  it('refreshScope() reloads scope data', fakeAsync(() => {
    sowService.listScope.and.returnValue(of([MOCK_ASSET]));

    fixture.detectChanges();
    tick();

    sowService.listScope.calls.reset();
    sowService.listScope.and.returnValue(of([MOCK_ASSET, MOCK_ASSET_2]));

    component.refreshScope();
    tick();

    expect(sowService.listScope).toHaveBeenCalledWith('eng-1');
    expect(component.scopeVm$.value.total).toBe(2);
  }));

  it('refreshScope() handles error', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    sowService.listScope.and.returnValue(throwError(() => new Error('fail')));

    component.refreshScope();
    tick();

    expect(component.scopeVm$.value.state).toBe('error');
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
