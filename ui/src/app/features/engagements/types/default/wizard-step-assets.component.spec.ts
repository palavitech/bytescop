import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';

import { WizardStepAssetsComponent, AssetStepResult } from './wizard-step-assets.component';
import { AssetsService } from '../../../assets/services/assets.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { Asset } from '../../../assets/models/asset.model';

const MOCK_ASSET: Asset = {
  id: 'asset-1', name: 'Web App', client_id: 'org-1', client_name: 'Acme',
  asset_type: 'webapp', environment: 'prod', criticality: 'high', target: 'https://app.test',
  notes: '', attributes: {}, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_ASSET_2: Asset = {
  id: 'asset-2', name: 'API Server', client_id: 'org-1', client_name: 'Acme',
  asset_type: 'api', environment: 'prod', criticality: 'medium', target: 'https://api.test',
  notes: '', attributes: {}, created_at: '2025-01-02T00:00:00Z', updated_at: '2025-01-02T00:00:00Z',
};

describe('WizardStepAssetsComponent', () => {
  let component: WizardStepAssetsComponent;
  let fixture: ComponentFixture<WizardStepAssetsComponent>;
  let assetService: jasmine.SpyObj<AssetsService>;
  let notify: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    const assetSpy = jasmine.createSpyObj('AssetsService', ['list', 'create']);
    const notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    assetSpy.list.and.returnValue(of([MOCK_ASSET, MOCK_ASSET_2]));

    await TestBed.configureTestingModule({
      imports: [WizardStepAssetsComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: AssetsService, useValue: assetSpy },
        { provide: NotificationService, useValue: notifySpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WizardStepAssetsComponent);
    component = fixture.componentInstance;
    component.orgId = 'org-1';
    component.orgName = 'Acme Corp';
    assetService = assetSpy;
    notify = notifySpy;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads assets on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(assetService.list).toHaveBeenCalledWith('org-1');
    expect(component.orgAssets()).toEqual([MOCK_ASSET, MOCK_ASSET_2]);
    expect(component.assetsLoading()).toBeFalse();
  }));

  it('shows error when asset loading fails', fakeAsync(() => {
    assetService.list.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    tick();
    expect(component.assetsLoading()).toBeFalse();
    expect(notify.error).toHaveBeenCalledWith('Failed to load assets.');
  }));

  it('toggleAssetSelection adds an asset id', () => {
    component.toggleAssetSelection('asset-1');
    expect(component.isAssetSelected('asset-1')).toBeTrue();
  });

  it('toggleAssetSelection removes an already-selected asset', () => {
    component.toggleAssetSelection('asset-1');
    component.toggleAssetSelection('asset-1');
    expect(component.isAssetSelected('asset-1')).toBeFalse();
  });

  it('isAssetSelected returns false for unselected assets', () => {
    expect(component.isAssetSelected('nonexistent')).toBeFalse();
  });

  it('selectAllAssets selects every asset', () => {
    component.orgAssets.set([MOCK_ASSET, MOCK_ASSET_2]);
    component.selectAllAssets();
    expect(component.isAssetSelected('asset-1')).toBeTrue();
    expect(component.isAssetSelected('asset-2')).toBeTrue();
  });

  it('deselectAllAssets clears selection', () => {
    component.selectedAssetIds.set(new Set(['asset-1', 'asset-2']));
    component.deselectAllAssets();
    expect(component.selectedAssetIds().size).toBe(0);
  });

  it('canProceed returns false when none selected', () => {
    expect(component.canProceed()).toBeFalse();
  });

  it('canProceed returns true when assets selected', () => {
    component.selectedAssetIds.set(new Set(['asset-1']));
    expect(component.canProceed()).toBeTrue();
  });

  it('onProceed emits selected IDs and assets', () => {
    component.orgAssets.set([MOCK_ASSET, MOCK_ASSET_2]);
    component.selectedAssetIds.set(new Set(['asset-1']));

    let result: AssetStepResult | undefined;
    component.proceed.subscribe(r => (result = r));
    component.onProceed();

    expect(result).toBeDefined();
    expect(result!.selectedIds).toEqual(['asset-1']);
    expect(result!.selectedAssets.length).toBe(1);
    expect(result!.selectedAssets[0].id).toBe('asset-1');
  });

  it('onProceed does nothing when none selected', () => {
    let emitted = false;
    component.proceed.subscribe(() => (emitted = true));
    component.onProceed();
    expect(emitted).toBeFalse();
  });

  it('onBack emits back event', () => {
    let emitted = false;
    component.back.subscribe(() => (emitted = true));
    component.onBack();
    expect(emitted).toBeTrue();
  });

  it('toggleAssetForm toggles visibility', () => {
    expect(component.showAssetForm()).toBeFalse();
    component.toggleAssetForm();
    expect(component.showAssetForm()).toBeTrue();
  });

  it('toggleAssetForm resets form when opening', () => {
    component.assetForm.get('name')?.setValue('Dirty');
    component.toggleAssetForm();
    expect(component.assetForm.get('name')?.value).toBe('');
    expect(component.assetForm.get('asset_type')?.value).toBe('host');
  });

  it('submitNewAsset marks touched if form invalid', () => {
    spyOn(component.assetForm, 'markAllAsTouched');
    component.submitNewAsset();
    expect(component.assetForm.markAllAsTouched).toHaveBeenCalled();
    expect(assetService.create).not.toHaveBeenCalled();
  });

  it('submitNewAsset creates asset and auto-selects it', fakeAsync(() => {
    assetService.create.and.returnValue(of(MOCK_ASSET));
    component.assetForm.get('name')?.setValue('Web App');
    component.showAssetForm.set(true);

    component.submitNewAsset();
    tick();

    expect(component.assetSaving()).toBeFalse();
    expect(component.showAssetForm()).toBeFalse();
    expect(component.isAssetSelected('asset-1')).toBeTrue();
    expect(component.orgAssets().some(a => a.id === 'asset-1')).toBeTrue();
    expect(notify.success).toHaveBeenCalledWith('Asset "Web App" created.');
  }));

  it('submitNewAsset sends client_id with payload', fakeAsync(() => {
    assetService.create.and.returnValue(of(MOCK_ASSET));
    component.assetForm.get('name')?.setValue('New Asset');
    component.submitNewAsset();
    tick();
    const callArg = assetService.create.calls.mostRecent().args[0];
    expect(callArg.client_id).toBe('org-1');
  }));

  it('submitNewAsset handles error with name field', fakeAsync(() => {
    assetService.create.and.returnValue(throwError(() => ({ error: { name: ['Name already exists'] } })));
    component.assetForm.get('name')?.setValue('Dup');
    component.submitNewAsset();
    tick();
    expect(component.assetSaving()).toBeFalse();
    expect(notify.error).toHaveBeenCalledWith('Name already exists');
  }));

  it('submitNewAsset handles error with detail field', fakeAsync(() => {
    assetService.create.and.returnValue(throwError(() => ({ error: { detail: 'Quota exceeded' } })));
    component.assetForm.get('name')?.setValue('New');
    component.submitNewAsset();
    tick();
    expect(notify.error).toHaveBeenCalledWith('Quota exceeded');
  }));

  it('submitNewAsset handles generic error', fakeAsync(() => {
    assetService.create.and.returnValue(throwError(() => ({ error: {} })));
    component.assetForm.get('name')?.setValue('New');
    component.submitNewAsset();
    tick();
    expect(notify.error).toHaveBeenCalledWith('Failed to create asset.');
  }));
});
