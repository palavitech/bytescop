import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { EngagementWizardComponent, WizardStep } from './engagement-wizard.component';
import { EngagementsService } from '../services/engagements.service';
import { SowService } from '../services/sow.service';
import { OrganizationsService } from '../../organizations/services/organizations.service';
import { AssetsService } from '../../assets/services/assets.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { Engagement } from '../models/engagement.model';
import { MalwareSample } from '../types/malware-analysis';
import { Sow } from '../models/sow.model';
import { Asset } from '../../assets/models/asset.model';
import { Organization, OrganizationRef } from '../../organizations/models/organization.model';

// ── Mock data ────────────────────────────────────────────────────────

const MOCK_ORG_REFS: OrganizationRef[] = [
  { id: 'org-1', name: 'Acme Corp' },
  { id: 'org-2', name: 'Globex Inc' },
];

const MOCK_ORG: Organization = {
  id: 'org-new',
  name: 'New Org',
  website: 'https://neworg.com',
  status: 'active',
  notes: '',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_ASSET: Asset = {
  id: 'asset-1',
  name: 'Web App',
  client_id: 'org-1',
  client_name: 'Acme Corp',
  asset_type: 'webapp',
  environment: 'prod',
  criticality: 'high',
  target: 'https://example.com',
  notes: '',
  attributes: {},
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_ASSET_2: Asset = {
  id: 'asset-2',
  name: 'API Server',
  client_id: 'org-1',
  client_name: 'Acme Corp',
  asset_type: 'api',
  environment: 'prod',
  criticality: 'medium',
  target: 'https://api.example.com',
  notes: '',
  attributes: {},
  created_at: '2025-01-02T00:00:00Z',
  updated_at: '2025-01-02T00:00:00Z',
};

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-1',
  name: 'Test Engagement',
  client_id: 'org-1',
  client_name: 'Acme Corp',
  status: 'planned',
  description: '',
  notes: '',
  start_date: '2025-01-01',
  end_date: '2025-06-01',
  findings_summary: null,
  engagement_type: 'general',
  project_id: null,
  project_name: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_MALWARE_ENGAGEMENT: Engagement = {
  ...MOCK_ENGAGEMENT,
  id: 'eng-ma-1',
  name: 'Malware Analysis — 2025-01-01',
  engagement_type: 'malware_analysis',
};

const MOCK_SOW: Sow = {
  id: 'sow-1',
  title: 'Test SOW',
  status: 'draft',
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_APPROVED_SOW: Sow = {
  ...MOCK_SOW,
  status: 'approved',
};

const MOCK_SAMPLE: MalwareSample = {
  id: 'sample-1',
  original_filename: 'malware.exe',
  safe_filename: 'sample_abc123',
  sha256: 'abc123def456',
  content_type: 'application/octet-stream',
  size_bytes: 1024,
  notes: '',
  download_url: '/api/samples/sample-1/download/',
  created_at: '2025-01-01T00:00:00Z',
};

// ── Helper to build the test module ──────────────────────────────────

function buildTestBed(engagementType: string | null = 'general') {
  const engServiceSpy = jasmine.createSpyObj('EngagementsService', [
    'create', 'update',
  ]);
  const sowServiceSpy = jasmine.createSpyObj('SowService', [
    'get', 'update', 'addScope',
  ]);
  const orgServiceSpy = jasmine.createSpyObj('OrganizationsService', ['ref', 'create']);
  const assetServiceSpy = jasmine.createSpyObj('AssetsService', ['list', 'create']);
  const notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
  const locationSpy = jasmine.createSpyObj('Location', ['back']);

  // Default happy-path returns
  orgServiceSpy.ref.and.returnValue(of(MOCK_ORG_REFS));
  assetServiceSpy.list.and.returnValue(of([MOCK_ASSET, MOCK_ASSET_2]));

  return {
    engServiceSpy,
    sowServiceSpy,
    orgServiceSpy,
    assetServiceSpy,
    notifySpy,
    locationSpy,
    configure: async () => {
      await TestBed.configureTestingModule({
        imports: [EngagementWizardComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: EngagementsService, useValue: engServiceSpy },
          { provide: SowService, useValue: sowServiceSpy },
          { provide: OrganizationsService, useValue: orgServiceSpy },
          { provide: AssetsService, useValue: assetServiceSpy },
          { provide: NotificationService, useValue: notifySpy },
          { provide: Location, useValue: locationSpy },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                queryParamMap: convertToParamMap(
                  engagementType ? { type: engagementType } : {}
                ),
              },
            },
          },
        ],
      }).compileComponents();
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('EngagementWizardComponent', () => {

  // ────────────────────────────────────────────────────────────────────
  // DEFAULT (non-malware) FLOW
  // ────────────────────────────────────────────────────────────────────

  describe('default flow (general type)', () => {
    let component: EngagementWizardComponent;
    let fixture: ComponentFixture<EngagementWizardComponent>;
    let router: Router;
    let spies: ReturnType<typeof buildTestBed>;

    beforeEach(async () => {
      spies = buildTestBed('general');
      await spies.configure();

      fixture = TestBed.createComponent(EngagementWizardComponent);
      component = fixture.componentInstance;
      router = TestBed.inject(Router);
      spyOn(router, 'navigate');
      spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));
    });

    // -- Creation & initialization --

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('sets engagement type to "general" from query params', () => {
      expect(component.engagementType()).toBe('general');
    });

    it('loads organizations on construction', () => {
      expect(spies.orgServiceSpy.ref).toHaveBeenCalled();
    });

    it('populates organizations signal with loaded refs', fakeAsync(() => {
      tick();
      expect(component.organizations()).toEqual(MOCK_ORG_REFS);
    }));

    it('initializes orgForm with empty defaults', () => {
      expect(component.orgForm).toBeTruthy();
      expect(component.orgForm.get('name')?.value).toBe('');
      expect(component.orgForm.get('status')?.value).toBe('active');
    });

    it('initializes engForm with name validators', () => {
      expect(component.engForm).toBeTruthy();
      const nameCtrl = component.engForm.get('name');
      expect(nameCtrl?.value).toBe('');
      // Name is required
      nameCtrl?.setValue('');
      expect(nameCtrl?.valid).toBeFalse();
      // Name too short
      nameCtrl?.setValue('ab');
      expect(nameCtrl?.valid).toBeFalse();
      // Valid name
      nameCtrl?.setValue('Good Name');
      expect(nameCtrl?.valid).toBeTrue();
    });

    it('initializes engForm start_date to today', () => {
      const today = new Date().toISOString().slice(0, 10);
      expect(component.engForm.get('start_date')?.value).toBe(today);
    });

    it('starts on org step', () => {
      expect(component.currentStep()).toBe('org');
    });

    it('uses DEFAULT_STEP_ORDER for general type', () => {
      expect(component.stepOrder()).toEqual(['org', 'assets', 'details', 'sow', 'review']);
    });

    it('isMalwareFlow is false for general type', () => {
      expect(component.isMalwareFlow()).toBeFalse();
    });

    it('has correct engagement type label', () => {
      expect(component.engagementTypeLabel()).toBe('General / Other');
    });

    it('has correct engagement type icon', () => {
      expect(component.engagementTypeIcon()).toBe('bi-clipboard-check');
    });

    it('shows error notification when org load fails', fakeAsync(() => {
      spies.orgServiceSpy.ref.and.returnValue(throwError(() => new Error('fail')));
      // Re-create component to trigger constructor again
      const fix2 = TestBed.createComponent(EngagementWizardComponent);
      tick();
      expect(spies.notifySpy.error).toHaveBeenCalledWith('Failed to load organizations.');
    }));

    // -- Navigation --

    it('nextStep advances from org to assets', () => {
      component.nextStep();
      expect(component.currentStep()).toBe('assets');
    });

    it('nextStep does not advance past last step', () => {
      // Move to review (last step)
      component.currentStep.set('review');
      component.nextStep();
      expect(component.currentStep()).toBe('review');
    });

    it('prevStep does not go before first step', () => {
      component.prevStep();
      expect(component.currentStep()).toBe('org');
    });

    it('prevStep goes back from assets to org', () => {
      component.currentStep.set('assets');
      component.prevStep();
      expect(component.currentStep()).toBe('org');
    });

    it('nextStep clears error', () => {
      component.error.set('some error');
      component.nextStep();
      expect(component.error()).toBe('');
    });

    it('prevStep clears error', () => {
      component.currentStep.set('assets');
      component.error.set('some error');
      component.prevStep();
      expect(component.error()).toBe('');
    });

    it('isStepDone returns true for steps before current', () => {
      component.currentStep.set('details');
      expect(component.isStepDone('org')).toBeTrue();
      expect(component.isStepDone('assets')).toBeTrue();
      expect(component.isStepDone('details')).toBeFalse();
    });

    it('isStepActive returns true only for current step', () => {
      component.currentStep.set('assets');
      expect(component.isStepActive('org')).toBeFalse();
      expect(component.isStepActive('assets')).toBeTrue();
      expect(component.isStepActive('details')).toBeFalse();
    });

    it('currentStepIndex returns correct index', () => {
      component.currentStep.set('org');
      expect(component.currentStepIndex()).toBe(0);
      component.currentStep.set('details');
      expect(component.currentStepIndex()).toBe(2);
    });

    // -- Organization selection --

    it('selectOrg sets selected org id and name', () => {
      component.selectOrg('org-1', 'Acme Corp');
      expect(component.selectedOrgId()).toBe('org-1');
      expect(component.selectedOrgName()).toBe('Acme Corp');
    });

    it('onOrgDropdownChange selects org by id', fakeAsync(() => {
      tick(); // resolve orgs
      component.onOrgDropdownChange('org-1');
      expect(component.selectedOrgId()).toBe('org-1');
      expect(component.selectedOrgName()).toBe('Acme Corp');
    }));

    it('onOrgDropdownChange handles unknown org gracefully', fakeAsync(() => {
      tick();
      component.onOrgDropdownChange('unknown-id');
      expect(component.selectedOrgId()).toBe('unknown-id');
      expect(component.selectedOrgName()).toBe('');
    }));

    it('canProceedFromOrg returns false when no org selected', () => {
      expect(component.canProceedFromOrg()).toBeFalse();
    });

    it('canProceedFromOrg returns true when org selected', () => {
      component.selectedOrgId.set('org-1');
      expect(component.canProceedFromOrg()).toBeTrue();
    });

    it('proceedFromOrg does nothing if no org selected', () => {
      component.proceedFromOrg();
      expect(component.currentStep()).toBe('org');
    });

    it('proceedFromOrg advances to assets step', fakeAsync(() => {
      component.selectOrg('org-1', 'Acme Corp');
      component.proceedFromOrg();
      tick();
      expect(component.currentStep()).toBe('assets');
    }));

    // -- Organization form --

    it('toggleOrgForm toggles visibility', () => {
      expect(component.showOrgForm()).toBeFalse();
      component.toggleOrgForm();
      expect(component.showOrgForm()).toBeTrue();
      component.toggleOrgForm();
      expect(component.showOrgForm()).toBeFalse();
    });

    it('toggleOrgForm resets form when opening', () => {
      component.orgForm.get('name')?.setValue('Dirty');
      component.toggleOrgForm(); // open
      expect(component.orgForm.get('name')?.value).toBe('');
    });

    it('submitNewOrg marks touched if form invalid', () => {
      spyOn(component.orgForm, 'markAllAsTouched');
      component.submitNewOrg();
      expect(component.orgForm.markAllAsTouched).toHaveBeenCalled();
      expect(spies.orgServiceSpy.create).not.toHaveBeenCalled();
    });

    it('submitNewOrg creates org and selects it on success', fakeAsync(() => {
      spies.orgServiceSpy.create.and.returnValue(of(MOCK_ORG));
      component.orgForm.get('name')?.setValue('New Org');
      component.showOrgForm.set(true);

      component.submitNewOrg();
      tick();
      expect(component.orgSaving()).toBeFalse();
      expect(component.showOrgForm()).toBeFalse();
      expect(component.selectedOrgId()).toBe('org-new');
      expect(component.selectedOrgName()).toBe('New Org');
      // Verify the org was added to the list
      expect(component.organizations().some(o => o.id === 'org-new')).toBeTrue();
    }));

    it('submitNewOrg handles error with name field', fakeAsync(() => {
      spies.orgServiceSpy.create.and.returnValue(
        throwError(() => ({ error: { name: ['Name already exists'] } }))
      );
      component.orgForm.get('name')?.setValue('Dup Org');
      component.submitNewOrg();
      tick();
      expect(component.orgSaving()).toBeFalse();
      expect(spies.notifySpy.error).toHaveBeenCalledWith('Name already exists');
    }));

    it('submitNewOrg handles error with detail field', fakeAsync(() => {
      spies.orgServiceSpy.create.and.returnValue(
        throwError(() => ({ error: { detail: 'Server error' } }))
      );
      component.orgForm.get('name')?.setValue('Bad Org');
      component.submitNewOrg();
      tick();
      expect(spies.notifySpy.error).toHaveBeenCalledWith('Server error');
    }));

    it('submitNewOrg handles error with no specific detail', fakeAsync(() => {
      spies.orgServiceSpy.create.and.returnValue(
        throwError(() => ({ error: {} }))
      );
      component.orgForm.get('name')?.setValue('Bad Org');
      component.submitNewOrg();
      tick();
      expect(spies.notifySpy.error).toHaveBeenCalledWith('Failed to create organization.');
    }));

    // -- Asset loading --

    // -- Asset step component integration --

    it('onAssetStepProceed stores selected IDs and assets, then advances', () => {
      component.currentStep.set('assets');
      component.onAssetStepProceed({
        selectedIds: ['asset-1', 'asset-2'],
        selectedAssets: [MOCK_ASSET, MOCK_ASSET_2],
      });
      expect(component.selectedAssetIds()).toEqual(['asset-1', 'asset-2']);
      expect(component.selectedAssets()).toEqual([MOCK_ASSET, MOCK_ASSET_2]);
      expect(component.currentStep()).toBe('details');
    });

    it('selectedAssetsList returns stored selected assets', () => {
      component.selectedAssets.set([MOCK_ASSET]);
      expect(component.selectedAssetsList()).toEqual([MOCK_ASSET]);
    });

    // -- formatBytes --

    it('formatBytes returns 0 B for 0', () => {
      expect(component.formatBytes(0)).toBe('0 B');
    });

    it('formatBytes returns bytes for small values', () => {
      expect(component.formatBytes(500)).toBe('500 B');
    });

    it('formatBytes returns KB', () => {
      expect(component.formatBytes(1024)).toBe('1 KB');
      expect(component.formatBytes(1536)).toBe('1.5 KB');
    });

    it('formatBytes returns MB', () => {
      expect(component.formatBytes(1048576)).toBe('1 MB');
    });

    it('formatBytes returns GB', () => {
      expect(component.formatBytes(1073741824)).toBe('1 GB');
    });

    // -- isEngFormInvalid --

    it('isEngFormInvalid returns false for valid untouched control', () => {
      expect(component.isEngFormInvalid('name')).toBeFalse();
    });

    it('isEngFormInvalid returns true for invalid touched control', () => {
      const ctrl = component.engForm.get('name');
      ctrl?.setValue('');
      ctrl?.markAsTouched();
      expect(component.isEngFormInvalid('name')).toBeTrue();
    });

    it('isEngFormInvalid returns false for valid touched control', () => {
      const ctrl = component.engForm.get('name');
      ctrl?.setValue('Valid Name');
      ctrl?.markAsTouched();
      expect(component.isEngFormInvalid('name')).toBeFalse();
    });

    it('isEngFormInvalid returns true for invalid dirty control', () => {
      const ctrl = component.engForm.get('name');
      ctrl?.setValue('');
      ctrl?.markAsDirty();
      expect(component.isEngFormInvalid('name')).toBeTrue();
    });

    it('isEngFormInvalid returns false for non-existent control', () => {
      expect(component.isEngFormInvalid('nonexistent')).toBeFalse();
    });

    // -- proceedFromDetails (standard flow) --

    it('proceedFromDetails marks form touched when invalid', () => {
      spyOn(component.engForm, 'markAllAsTouched');
      component.engForm.get('name')?.setValue('');
      component.proceedFromDetails();
      expect(component.engForm.markAllAsTouched).toHaveBeenCalled();
      expect(spies.engServiceSpy.create).not.toHaveBeenCalled();
    });

    it('proceedFromDetails creates engagement and adds scope', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_ENGAGEMENT));
      spies.sowServiceSpy.addScope.and.returnValue(of(MOCK_ASSET));
      spies.sowServiceSpy.get.and.returnValue(of(MOCK_SOW));

      component.engForm.get('name')?.setValue('Test Engagement');
      component.selectedOrgId.set('org-1');
      component.selectedAssetIds.set(['asset-1']);
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();
      expect(spies.engServiceSpy.create).toHaveBeenCalled();
      expect(spies.sowServiceSpy.addScope).toHaveBeenCalledWith('eng-1', 'asset-1');
      expect(spies.sowServiceSpy.get).toHaveBeenCalledWith('eng-1');
      expect(component.createdEngagement()).toEqual(MOCK_ENGAGEMENT);
      expect(component.createdSow()).toEqual(MOCK_SOW);
      expect(component.submitting()).toBeFalse();
      expect(component.currentStep()).toBe('sow');
    }));

    it('proceedFromDetails with no assets skips scope and fetches SoW', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_ENGAGEMENT));
      spies.sowServiceSpy.get.and.returnValue(of(MOCK_SOW));

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      // No assets selected
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(spies.sowServiceSpy.addScope).not.toHaveBeenCalled();
      expect(spies.sowServiceSpy.get).toHaveBeenCalledWith('eng-1');
      expect(component.createdSow()).toEqual(MOCK_SOW);
      expect(component.currentStep()).toBe('sow');
    }));

    it('proceedFromDetails handles create error (non-402)', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(
        throwError(() => ({ status: 500, error: { message: 'Server down' } }))
      );

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.submitting()).toBeFalse();
      expect(component.error()).toBe('Server down');
      expect(spies.notifySpy.error).toHaveBeenCalledWith('Server down');
    }));

    it('proceedFromDetails handles create error with detail field', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(
        throwError(() => ({ status: 500, error: { detail: 'Not allowed' } }))
      );

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.error()).toBe('Not allowed');
    }));

    it('proceedFromDetails handles create error with name array', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(
        throwError(() => ({ status: 500, error: { name: ['Name is required'] } }))
      );

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.error()).toBe('Name is required');
    }));

    it('proceedFromDetails silently handles 402 error', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(
        throwError(() => ({ status: 402, error: { detail: 'Payment required' } }))
      );

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.submitting()).toBeFalse();
      // 402 does not set error or notify
      expect(component.error()).toBe('');
      expect(spies.notifySpy.error).not.toHaveBeenCalled();
    }));

    it('proceedFromDetails handles generic create error', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(
        throwError(() => ({ status: 500, error: {} }))
      );

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.error()).toBe('Failed to create engagement.');
    }));

    // -- addAssetsToScopeAndFetchSow error --

    it('addAssetsToScopeAndFetchSow handles scope add error', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_ENGAGEMENT));
      spies.sowServiceSpy.addScope.and.returnValue(
        throwError(() => ({ error: { detail: 'Scope error' } }))
      );

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      component.selectedAssetIds.set(['asset-1']);
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.submitting()).toBeFalse();
      expect(component.error()).toBe('Scope error');
      expect(spies.notifySpy.error).toHaveBeenCalledWith('Scope error');
    }));

    it('addAssetsToScopeAndFetchSow handles generic scope error', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_ENGAGEMENT));
      spies.sowServiceSpy.addScope.and.returnValue(
        throwError(() => ({ error: {} }))
      );

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      component.selectedAssetIds.set(['asset-1']);
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.error()).toBe('Failed to add assets to scope.');
    }));

    // -- fetchSowAndAdvance error --

    it('fetchSowAndAdvance still advances on SoW fetch error', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_ENGAGEMENT));
      spies.sowServiceSpy.get.and.returnValue(throwError(() => new Error('no sow')));

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      // Still advances to sow step even when getSow fails
      expect(component.submitting()).toBeFalse();
      expect(component.currentStep()).toBe('sow');
    }));

    // -- approveSow --

    it('approveSow does nothing when no engagement', () => {
      component.createdEngagement.set(null);
      component.approveSow();
      expect(spies.sowServiceSpy.update).not.toHaveBeenCalled();
    });

    it('approveSow updates SoW status and advances', fakeAsync(() => {
      spies.sowServiceSpy.update.and.returnValue(of(MOCK_APPROVED_SOW));
      component.createdEngagement.set(MOCK_ENGAGEMENT);
      component.currentStep.set('sow');

      component.approveSow();
      tick();
      expect(spies.sowServiceSpy.update).toHaveBeenCalledWith('eng-1', { status: 'approved' });
      expect(component.createdSow()).toEqual(MOCK_APPROVED_SOW);
      expect(component.submitting()).toBeFalse();
      expect(component.currentStep()).toBe('review');
    }));

    it('approveSow handles error', fakeAsync(() => {
      spies.sowServiceSpy.update.and.returnValue(
        throwError(() => ({ error: { detail: 'SoW locked' } }))
      );
      component.createdEngagement.set(MOCK_ENGAGEMENT);
      component.currentStep.set('sow');

      component.approveSow();
      tick();

      expect(component.submitting()).toBeFalse();
      expect(component.error()).toBe('SoW locked');
      expect(spies.notifySpy.error).toHaveBeenCalledWith('SoW locked');
    }));

    it('approveSow handles generic error', fakeAsync(() => {
      spies.sowServiceSpy.update.and.returnValue(
        throwError(() => ({ error: {} }))
      );
      component.createdEngagement.set(MOCK_ENGAGEMENT);
      component.currentStep.set('sow');

      component.approveSow();
      tick();

      expect(component.error()).toBe('Failed to approve Statement of Work.');
    }));

    // -- keepPlanned --

    it('keepPlanned does nothing if no engagement', () => {
      component.createdEngagement.set(null);
      component.keepPlanned();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keepPlanned navigates to engagement', () => {
      component.createdEngagement.set(MOCK_ENGAGEMENT);
      component.keepPlanned();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/engagements/eng-1');
    });

    // -- activateEngagement --

    it('activateEngagement does nothing if no engagement', () => {
      component.createdEngagement.set(null);
      component.activateEngagement();
      expect(spies.engServiceSpy.update).not.toHaveBeenCalled();
    });

    it('activateEngagement updates status and navigates', fakeAsync(() => {
      const activeEng = { ...MOCK_ENGAGEMENT, status: 'active' as const };
      spies.engServiceSpy.update.and.returnValue(of(activeEng));
      component.createdEngagement.set(MOCK_ENGAGEMENT);

      component.activateEngagement();
      tick();
      expect(spies.engServiceSpy.update).toHaveBeenCalledWith('eng-1', { status: 'active' });
      expect(component.createdEngagement()).toEqual(activeEng);
      expect(component.submitting()).toBeFalse();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/engagements/eng-1');
    }));

    it('activateEngagement handles error', fakeAsync(() => {
      spies.engServiceSpy.update.and.returnValue(
        throwError(() => ({ error: { detail: 'Cannot activate' } }))
      );
      component.createdEngagement.set(MOCK_ENGAGEMENT);

      component.activateEngagement();
      tick();

      expect(component.submitting()).toBeFalse();
      expect(component.error()).toBe('Cannot activate');
      expect(spies.notifySpy.error).toHaveBeenCalledWith('Cannot activate');
    }));

    it('activateEngagement handles generic error', fakeAsync(() => {
      spies.engServiceSpy.update.and.returnValue(
        throwError(() => ({ error: {} }))
      );
      component.createdEngagement.set(MOCK_ENGAGEMENT);

      component.activateEngagement();
      tick();

      expect(component.error()).toBe('Failed to activate engagement.');
    }));

    // -- goBack --

    it('goBack calls location.back()', () => {
      component.goBack();
      expect(spies.locationSpy.back).toHaveBeenCalled();
    });

    // -- toggleHelp --

    it('toggleHelp flips showHelp', () => {
      expect(component.showHelp).toBeFalse();
      component.toggleHelp();
      expect(component.showHelp).toBeTrue();
      component.toggleHelp();
      expect(component.showHelp).toBeFalse();
    });

    // -- Multiple assets added to scope in parallel --

    it('proceedFromDetails adds multiple assets to scope via forkJoin', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_ENGAGEMENT));
      spies.sowServiceSpy.addScope.and.returnValue(of(MOCK_ASSET));
      spies.sowServiceSpy.get.and.returnValue(of(MOCK_SOW));

      component.engForm.get('name')?.setValue('Test');
      component.selectedOrgId.set('org-1');
      component.selectedAssetIds.set(['asset-1', 'asset-2']);
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(spies.sowServiceSpy.addScope).toHaveBeenCalledTimes(2);
      expect(component.currentStep()).toBe('sow');
    }));
  });

  // ────────────────────────────────────────────────────────────────────
  // MALWARE ANALYSIS FLOW
  // ────────────────────────────────────────────────────────────────────

  describe('malware analysis flow', () => {
    let component: EngagementWizardComponent;
    let fixture: ComponentFixture<EngagementWizardComponent>;
    let router: Router;
    let spies: ReturnType<typeof buildTestBed>;

    beforeEach(async () => {
      spies = buildTestBed('malware_analysis');
      await spies.configure();

      fixture = TestBed.createComponent(EngagementWizardComponent);
      component = fixture.componentInstance;
      router = TestBed.inject(Router);
      spyOn(router, 'navigate');
    });

    it('sets engagement type to malware_analysis', () => {
      expect(component.engagementType()).toBe('malware_analysis');
    });

    it('isMalwareFlow is true', () => {
      expect(component.isMalwareFlow()).toBeTrue();
    });

    it('uses MALWARE_STEP_ORDER', () => {
      expect(component.stepOrder()).toEqual(['org', 'sample', 'details', 'sow', 'review']);
    });

    it('has correct type label', () => {
      expect(component.engagementTypeLabel()).toBe('Malware Analysis');
    });

    it('has correct type icon', () => {
      expect(component.engagementTypeIcon()).toBe('bi-bug');
    });

    // -- proceedFromOrg in malware flow --

    it('proceedFromOrg creates temp engagement and advances to sample step', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_MALWARE_ENGAGEMENT));
      component.selectOrg('org-1', 'Acme Corp');

      component.proceedFromOrg();
      tick();

      expect(spies.engServiceSpy.create).toHaveBeenCalled();
      const createArg = spies.engServiceSpy.create.calls.mostRecent().args[0];
      expect(createArg.engagement_type).toBe('malware_analysis');
      expect(createArg.client_id).toBe('org-1');
      expect(createArg.status).toBe('planned');
      expect(component.createdEngagement()).toEqual(MOCK_MALWARE_ENGAGEMENT);
      expect(component.currentStep()).toBe('sample');
    }));

    it('ensureEarlyEngagement does not create again if already created', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_MALWARE_ENGAGEMENT));
      component.selectOrg('org-1', 'Acme Corp');

      // First call
      component.ensureEarlyEngagement();
      tick();
      expect(spies.engServiceSpy.create).toHaveBeenCalledTimes(1);

      // Second call — should not create again
      component.ensureEarlyEngagement();
      tick();
      expect(spies.engServiceSpy.create).toHaveBeenCalledTimes(1);
    }));

    it('ensureEarlyEngagement handles non-402 error', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(
        throwError(() => ({ status: 500, error: { message: 'Server error' } }))
      );
      component.selectOrg('org-1', 'Acme Corp');

      component.ensureEarlyEngagement();
      tick();

      expect(component.submitting()).toBeFalse();
      expect(component.error()).toBe('Server error');
      expect(spies.notifySpy.error).toHaveBeenCalledWith('Server error');
    }));

    it('ensureEarlyEngagement handles 402 error silently', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(
        throwError(() => ({ status: 402, error: { detail: 'Payment required' } }))
      );
      component.selectOrg('org-1', 'Acme Corp');

      component.ensureEarlyEngagement();
      tick();

      expect(component.submitting()).toBeFalse();
      expect(component.error()).toBe('');
      expect(spies.notifySpy.error).not.toHaveBeenCalled();
    }));

    it('ensureEarlyEngagement handles error with detail fallback', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(
        throwError(() => ({ status: 500, error: { detail: 'Something wrong' } }))
      );
      component.selectOrg('org-1', 'Acme Corp');

      component.ensureEarlyEngagement();
      tick();

      expect(component.error()).toBe('Something wrong');
    }));

    it('ensureEarlyEngagement handles error with generic fallback', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(
        throwError(() => ({ status: 500, error: {} }))
      );
      component.selectOrg('org-1', 'Acme Corp');

      component.ensureEarlyEngagement();
      tick();

      expect(component.error()).toBe('Failed to create engagement for samples.');
    }));

    // -- Sample step component integration --

    it('onSampleStepProceed stores samples and advances', () => {
      component.currentStep.set('sample');
      component.onSampleStepProceed([MOCK_SAMPLE]);
      expect(component.uploadedSamples()).toEqual([MOCK_SAMPLE]);
      expect(component.currentStep()).toBe('details');
    });

    // -- proceedFromDetails (malware flow — update existing) --

    it('proceedFromDetails updates existing engagement in malware flow', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_MALWARE_ENGAGEMENT));
      spies.engServiceSpy.update.and.returnValue(of({
        ...MOCK_MALWARE_ENGAGEMENT,
        name: 'Updated MA',
      }));
      spies.sowServiceSpy.get.and.returnValue(of(MOCK_SOW));

      // First create temp engagement
      component.selectOrg('org-1', 'Acme Corp');
      component.ensureEarlyEngagement();
      tick();

      component.engForm.get('name')?.setValue('Updated MA');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(spies.engServiceSpy.update).toHaveBeenCalledWith(
        'eng-ma-1',
        jasmine.objectContaining({ name: 'Updated MA' })
      );
      // Should NOT call create again (the create call is from ensureEarlyEngagement)
      expect(spies.engServiceSpy.create).toHaveBeenCalledTimes(1);
      expect(component.createdEngagement()?.name).toBe('Updated MA');
      expect(component.currentStep()).toBe('sow');
    }));

    it('proceedFromDetails handles update error in malware flow', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_MALWARE_ENGAGEMENT));
      spies.engServiceSpy.update.and.returnValue(
        throwError(() => ({ error: { message: 'Update failed' } }))
      );

      component.selectOrg('org-1', 'Acme Corp');
      component.ensureEarlyEngagement();
      tick();

      component.engForm.get('name')?.setValue('Updated');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.submitting()).toBeFalse();
      expect(component.error()).toBe('Update failed');
      expect(spies.notifySpy.error).toHaveBeenCalledWith('Update failed');
    }));

    it('proceedFromDetails handles update error with detail fallback', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_MALWARE_ENGAGEMENT));
      spies.engServiceSpy.update.and.returnValue(
        throwError(() => ({ error: { detail: 'Not found' } }))
      );

      component.selectOrg('org-1', 'Acme Corp');
      component.ensureEarlyEngagement();
      tick();

      component.engForm.get('name')?.setValue('Updated');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.error()).toBe('Not found');
    }));

    it('proceedFromDetails handles update error with name array fallback', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_MALWARE_ENGAGEMENT));
      spies.engServiceSpy.update.and.returnValue(
        throwError(() => ({ error: { name: ['Name too long'] } }))
      );

      component.selectOrg('org-1', 'Acme Corp');
      component.ensureEarlyEngagement();
      tick();

      component.engForm.get('name')?.setValue('Updated');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.error()).toBe('Name too long');
    }));

    it('proceedFromDetails handles update generic error', fakeAsync(() => {
      spies.engServiceSpy.create.and.returnValue(of(MOCK_MALWARE_ENGAGEMENT));
      spies.engServiceSpy.update.and.returnValue(
        throwError(() => ({ error: {} }))
      );

      component.selectOrg('org-1', 'Acme Corp');
      component.ensureEarlyEngagement();
      tick();

      component.engForm.get('name')?.setValue('Updated');
      component.currentStep.set('details');

      component.proceedFromDetails();
      tick();

      expect(component.error()).toBe('Failed to update engagement.');
    }));
  });

  // ────────────────────────────────────────────────────────────────────
  // INVALID / MISSING ENGAGEMENT TYPE
  // ────────────────────────────────────────────────────────────────────

  describe('invalid engagement type', () => {
    it('navigates to /engagements/create when type param is invalid', async () => {
      const spies = buildTestBed('bogus_type');
      await spies.configure();

      const router = TestBed.inject(Router);
      spyOn(router, 'navigate');

      TestBed.createComponent(EngagementWizardComponent);
      expect(router.navigate).toHaveBeenCalledWith(['/engagements/create']);
    });

    it('navigates to /engagements/create when type param is missing', async () => {
      const spies = buildTestBed(null);
      await spies.configure();

      const router = TestBed.inject(Router);
      spyOn(router, 'navigate');

      TestBed.createComponent(EngagementWizardComponent);
      expect(router.navigate).toHaveBeenCalledWith(['/engagements/create']);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // SPECIFIC ENGAGEMENT TYPES (icon/label validation)
  // ────────────────────────────────────────────────────────────────────

  describe('web_app_pentest type', () => {
    it('sets correct label and icon', async () => {
      const spies = buildTestBed('web_app_pentest');
      await spies.configure();

      const fixture = TestBed.createComponent(EngagementWizardComponent);
      const component = fixture.componentInstance;

      expect(component.engagementType()).toBe('web_app_pentest');
      expect(component.engagementTypeLabel()).toBe('Web App Pen Testing');
      expect(component.engagementTypeIcon()).toBe('bi-globe');
      expect(component.isMalwareFlow()).toBeFalse();
      expect(component.stepOrder()).toEqual(['org', 'assets', 'details', 'sow', 'review']);
    });
  });

  describe('engForm validation rules', () => {
    let component: EngagementWizardComponent;
    let spies: ReturnType<typeof buildTestBed>;

    beforeEach(async () => {
      spies = buildTestBed('general');
      await spies.configure();
      const fixture = TestBed.createComponent(EngagementWizardComponent);
      component = fixture.componentInstance;
    });

    it('name maxLength is 200', () => {
      const ctrl = component.engForm.get('name');
      ctrl?.setValue('a'.repeat(201));
      expect(ctrl?.valid).toBeFalse();
      ctrl?.setValue('a'.repeat(200));
      expect(ctrl?.valid).toBeTrue();
    });

    it('description maxLength is 5000', () => {
      const ctrl = component.engForm.get('description');
      ctrl?.setValue('a'.repeat(5001));
      expect(ctrl?.valid).toBeFalse();
      ctrl?.setValue('a'.repeat(5000));
      expect(ctrl?.valid).toBeTrue();
    });

    it('notes maxLength is 5000', () => {
      const ctrl = component.engForm.get('notes');
      ctrl?.setValue('a'.repeat(5001));
      expect(ctrl?.valid).toBeFalse();
      ctrl?.setValue('a'.repeat(5000));
      expect(ctrl?.valid).toBeTrue();
    });

    it('start_date is required', () => {
      const ctrl = component.engForm.get('start_date');
      ctrl?.setValue('');
      expect(ctrl?.valid).toBeFalse();
    });

    it('end_date is optional', () => {
      const ctrl = component.engForm.get('end_date');
      ctrl?.setValue('');
      expect(ctrl?.valid).toBeTrue();
    });
  });
});
