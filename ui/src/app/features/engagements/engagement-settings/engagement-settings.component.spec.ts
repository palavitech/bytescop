import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';

import { EngagementSettingsComponent } from './engagement-settings.component';
import { EngagementsService } from '../services/engagements.service';
import { MembersService } from '../../admin/users/services/members.service';
import { NotificationService } from '../../../services/core/notify/notification.service';
import { PermissionService } from '../../../services/core/auth/permission.service';
import { Engagement } from '../models/engagement.model';
import { EngagementSettingDef, EngagementStakeholder } from '../models/stakeholder.model';
import { TenantMember } from '../../admin/users/models/member.model';

const MOCK_ENGAGEMENT: Engagement = {
  id: 'eng-1',
  name: 'Test Engagement',
  client_id: 'client-1',
  client_name: 'Acme Corp',
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

const MOCK_SETTINGS: EngagementSettingDef[] = [
  {
    key: 'report.show_contacts',
    label: 'Show Contacts in Report',
    description: 'Include stakeholder contact info in PDF reports.',
    setting_type: 'boolean',
    default: 'true',
    group: 'Report',
    order: 1,
    value: 'true',
    has_value: true,
    updated_at: '2025-01-01T00:00:00Z',
    updated_by: 'user-1',
  },
  {
    key: 'report.cover_page',
    label: 'Cover Page',
    description: 'Include a cover page in PDF reports.',
    setting_type: 'boolean',
    default: 'true',
    group: 'Report',
    order: 2,
    value: 'false',
    has_value: true,
    updated_at: null,
    updated_by: null,
  },
  {
    key: 'default_severity_threshold',
    label: 'Default Severity Threshold',
    description: 'Minimum severity for findings to appear in reports.',
    setting_type: 'choice',
    choices: ['info', 'low', 'medium', 'high', 'critical'],
    default: 'low',
    group: 'Report',
    order: 3,
    value: 'low',
    has_value: false,
    updated_at: null,
    updated_by: null,
  },
  {
    key: 'report_footer_text',
    label: 'Report Footer Text',
    description: 'Custom text displayed in the footer of generated reports.',
    setting_type: 'text',
    default: '',
    group: 'Report',
    order: 4,
    value: '',
    has_value: false,
    updated_at: null,
    updated_by: null,
  },
];

const MOCK_STAKEHOLDER: EngagementStakeholder = {
  id: 'sh-1',
  member_id: 'mem-1',
  role: 'account_manager',
  user: {
    id: 'user-1',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    timezone: 'UTC',
    avatar_url: null,
  },
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

const MOCK_MEMBER: TenantMember = {
  id: 'mem-2',
  user: {
    id: 'user-2',
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Smith',
    phone: '',
    timezone: 'UTC',
    avatar_url: null,
    mfa_enabled: false,
  },
  role: 'MEMBER',
  is_active: true,
  invite_status: 'none' as const,
  groups: [],
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('EngagementSettingsComponent', () => {
  let component: EngagementSettingsComponent;
  let fixture: ComponentFixture<EngagementSettingsComponent>;

  let engagementsServiceSpy: jasmine.SpyObj<EngagementsService>;
  let membersServiceSpy: jasmine.SpyObj<MembersService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;

  beforeEach(async () => {
    engagementsServiceSpy = jasmine.createSpyObj('EngagementsService', [
      'getById', 'listSettings', 'upsertSetting',
      'listStakeholders', 'createStakeholder', 'updateStakeholder', 'deleteStakeholder',
    ]);
    membersServiceSpy = jasmine.createSpyObj('MembersService', ['list']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    engagementsServiceSpy.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    engagementsServiceSpy.listSettings.and.returnValue(of(MOCK_SETTINGS));
    engagementsServiceSpy.listStakeholders.and.returnValue(of([MOCK_STAKEHOLDER]));

    await TestBed.configureTestingModule({
      imports: [EngagementSettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EngagementsService, useValue: engagementsServiceSpy },
        { provide: MembersService, useValue: membersServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'eng-1' }, queryParams: {} },
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    })
    .overrideComponent(EngagementSettingsComponent, {
      set: { schemas: [NO_ERRORS_SCHEMA] },
    })
    .compileComponents();

    fixture = TestBed.createComponent(EngagementSettingsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('reads engagement id from route params', () => {
    fixture.detectChanges();
    expect(component.engagementId).toBe('eng-1');
  });

  it('calls getById and listSettings on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(engagementsServiceSpy.getById).toHaveBeenCalledWith('eng-1');
    expect(engagementsServiceSpy.listSettings).toHaveBeenCalledWith('eng-1');
  }));

  it('loads stakeholders on init', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(engagementsServiceSpy.listStakeholders).toHaveBeenCalledWith('eng-1');
    expect(component.stakeholders()).toEqual([MOCK_STAKEHOLDER]);
    expect(component.stakeholdersLoading()).toBe(false);
  }));

  it('vm$ emits ready state with grouped settings', fakeAsync(() => {
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('ready');
    expect(result.engagement).toEqual(MOCK_ENGAGEMENT);
    expect(result.groups.length).toBe(1);
    expect(result.totalCount).toBe(4);
  }));

  it('vm$ groups settings by group name and sorts by order', fakeAsync(() => {
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    // All settings are in Report group, sorted by order
    expect(result.groups[0].name).toBe('Report');
    expect(result.groups[0].settings.length).toBe(4);
    expect(result.groups[0].settings[0].key).toBe('report.show_contacts');
    expect(result.groups[0].settings[3].key).toBe('report_footer_text');
  }));

  it('vm$ emits ready with empty groups when listSettings fails', fakeAsync(() => {
    engagementsServiceSpy.listSettings.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('ready');
    expect(result.engagement).toEqual(MOCK_ENGAGEMENT);
    expect(result.groups).toEqual([]);
    expect(result.totalCount).toBe(0);
  }));

  it('vm$ emits error state when getById fails', fakeAsync(() => {
    engagementsServiceSpy.getById.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.state).toBe('error');
    expect(result.engagement).toBeNull();
  }));

  it('stakeholdersLoading is set to false on error', fakeAsync(() => {
    engagementsServiceSpy.listStakeholders.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    tick();
    expect(component.stakeholdersLoading()).toBe(false);
  }));

  // --- goBack ---

  it('goBack() calls location.back()', () => {
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

  // --- refresh ---

  it('refresh() triggers vm$ and reloads stakeholders', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    engagementsServiceSpy.getById.calls.reset();
    engagementsServiceSpy.listSettings.calls.reset();
    engagementsServiceSpy.listStakeholders.calls.reset();

    component.refresh();
    tick();

    expect(engagementsServiceSpy.getById).toHaveBeenCalled();
    expect(engagementsServiceSpy.listSettings).toHaveBeenCalled();
    expect(engagementsServiceSpy.listStakeholders).toHaveBeenCalled();
  }));

  // --- onEditValueChange ---

  it('onEditValueChange() sets dirty=true when value differs', () => {
    const row: any = {
      ...MOCK_SETTINGS[2], // choice setting
      editValue: 'high',
      value: 'low',
      dirty: false,
      saving: false,
    };
    component.onEditValueChange(row);
    expect(row.dirty).toBe(true);
  });

  it('onEditValueChange() sets dirty=false when value matches', () => {
    const row: any = {
      ...MOCK_SETTINGS[2],
      editValue: 'low',
      value: 'low',
      dirty: true,
      saving: false,
    };
    component.onEditValueChange(row);
    expect(row.dirty).toBe(false);
  });

  // --- resetSetting ---

  it('resetSetting() sets editValue to default and saves', fakeAsync(() => {
    engagementsServiceSpy.upsertSetting.and.returnValue(of({
      ...MOCK_SETTINGS[2],
      value: 'low',
      has_value: true,
      updated_at: '2025-02-01T00:00:00Z',
      updated_by: 'user-1',
    }));
    fixture.detectChanges();
    tick();

    const row: any = {
      ...MOCK_SETTINGS[2], // choice, default='low'
      editValue: 'high',
      value: 'high',
      dirty: false,
      saving: false,
    };
    component.resetSetting(row);
    tick();

    expect(row.editValue).toBe('low'); // reset to default
    expect(engagementsServiceSpy.upsertSetting).toHaveBeenCalledWith('eng-1', 'default_severity_threshold', 'low');
  }));

  // --- onToggleChange ---

  it('onToggleChange() sets dirty=true and calls saveSetting when value changed', fakeAsync(() => {
    engagementsServiceSpy.upsertSetting.and.returnValue(of({
      ...MOCK_SETTINGS[0],
      value: 'false',
      has_value: true,
      updated_at: '2025-02-01T00:00:00Z',
      updated_by: 'user-1',
    }));
    fixture.detectChanges();
    tick();

    const row: any = {
      ...MOCK_SETTINGS[0],
      editValue: 'false',
      dirty: false,
      saving: false,
    };

    component.onToggleChange(row);
    tick();

    expect(row.dirty).toBe(false); // reset after save
  }));

  it('onToggleChange() does not call saveSetting when value unchanged', () => {
    const row: any = {
      ...MOCK_SETTINGS[0],
      editValue: 'true', // same as value
      dirty: false,
      saving: false,
    };

    component.onToggleChange(row);
    expect(engagementsServiceSpy.upsertSetting).not.toHaveBeenCalled();
  });

  // --- saveSetting ---

  it('saveSetting() updates row on success', fakeAsync(() => {
    const subject = new Subject<any>();
    engagementsServiceSpy.upsertSetting.and.returnValue(subject.asObservable());
    fixture.detectChanges();
    tick();

    const row: any = {
      ...MOCK_SETTINGS[0],
      editValue: 'false',
      dirty: true,
      saving: false,
    };

    component.saveSetting(row);
    expect(row.saving).toBe(true);

    subject.next({
      ...MOCK_SETTINGS[0],
      value: 'false',
      has_value: true,
      updated_at: '2025-02-01T00:00:00Z',
      updated_by: 'user-2',
    });
    subject.complete();
    tick();

    expect(row.saving).toBe(false);
    expect(row.dirty).toBe(false);
    expect(row.value).toBe('false');
    expect(row.updated_by).toBe('user-2');
  }));

  it('saveSetting() shows error on failure', fakeAsync(() => {
    engagementsServiceSpy.upsertSetting.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    tick();

    const row: any = {
      ...MOCK_SETTINGS[0],
      editValue: 'false',
      dirty: true,
      saving: false,
    };

    component.saveSetting(row);
    tick();

    expect(row.saving).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to save Show Contacts in Report.');
  }));

  // --- openAddStakeholder ---

  it('openAddStakeholder() sets showAddStakeholder and loads members', fakeAsync(() => {
    const inactiveMember: TenantMember = {
      ...MOCK_MEMBER,
      id: 'mem-3',
      is_active: false,
    };
    const existingMember: TenantMember = {
      ...MOCK_MEMBER,
      id: 'mem-1', // same as MOCK_STAKEHOLDER.member_id
    };
    membersServiceSpy.list.and.returnValue(of([MOCK_MEMBER, inactiveMember, existingMember]));
    fixture.detectChanges();
    tick();

    component.openAddStakeholder();
    tick();

    expect(component.showAddStakeholder()).toBe(true);
    expect(component.addStakeholderMemberId).toBe('');
    expect(component.addStakeholderRole).toBe('account_manager');
    // Should exclude inactive and already-stakeholder members
    expect(component.availableMembers().length).toBe(1);
    expect(component.availableMembers()[0].id).toBe('mem-2');
  }));

  it('openAddStakeholder() shows error when members fail to load', fakeAsync(() => {
    membersServiceSpy.list.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    tick();

    component.openAddStakeholder();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to load members.');
  }));

  // --- saveNewStakeholder ---

  it('saveNewStakeholder() shows error when no member selected', () => {
    component.addStakeholderMemberId = '';
    component.saveNewStakeholder();
    expect(notifySpy.error).toHaveBeenCalledWith('Please select a member.');
  });

  it('saveNewStakeholder() creates stakeholder on success', fakeAsync(() => {
    const newStakeholder: EngagementStakeholder = {
      ...MOCK_STAKEHOLDER,
      id: 'sh-2',
      member_id: 'mem-2',
    };
    engagementsServiceSpy.createStakeholder.and.returnValue(of(newStakeholder));
    fixture.detectChanges();
    tick();

    component.addStakeholderMemberId = 'mem-2';
    component.addStakeholderRole = 'lead_tester';
    component.saveNewStakeholder();
    tick();

    expect(engagementsServiceSpy.createStakeholder).toHaveBeenCalledWith('eng-1', {
      member_id: 'mem-2',
      role: 'lead_tester',
    });
    expect(component.stakeholders().length).toBe(2);
    expect(component.showAddStakeholder()).toBe(false);
    expect(component.addingStakeholder()).toBe(false);
  }));

  it('saveNewStakeholder() shows error with detail on failure', fakeAsync(() => {
    engagementsServiceSpy.createStakeholder.and.returnValue(
      throwError(() => ({ error: { detail: 'Duplicate' } })),
    );
    fixture.detectChanges();
    tick();

    component.addStakeholderMemberId = 'mem-2';
    component.saveNewStakeholder();
    tick();

    expect(component.addingStakeholder()).toBe(false);
    expect(notifySpy.error).toHaveBeenCalledWith('Duplicate');
  }));

  it('saveNewStakeholder() shows generic error when no detail', fakeAsync(() => {
    engagementsServiceSpy.createStakeholder.and.returnValue(
      throwError(() => ({})),
    );
    fixture.detectChanges();
    tick();

    component.addStakeholderMemberId = 'mem-2';
    component.saveNewStakeholder();
    tick();

    expect(notifySpy.error).toHaveBeenCalledWith('Failed to add member.');
  }));

  // --- updateStakeholderRole ---

  it('updateStakeholderRole() updates role on success', fakeAsync(() => {
    const updated = { ...MOCK_STAKEHOLDER, role: 'lead_tester' };
    engagementsServiceSpy.updateStakeholder.and.returnValue(of(updated));
    fixture.detectChanges();
    tick();

    const sh = { ...MOCK_STAKEHOLDER };
    component.updateStakeholderRole(sh, 'lead_tester');
    tick();

    expect(sh.role).toBe('lead_tester');
  }));

  it('updateStakeholderRole() reverts role on error', fakeAsync(() => {
    const subject = new Subject<any>();
    engagementsServiceSpy.updateStakeholder.and.returnValue(subject.asObservable());
    fixture.detectChanges();
    tick();

    const sh = { ...MOCK_STAKEHOLDER, role: 'account_manager' };
    component.updateStakeholderRole(sh, 'lead_tester');

    // Optimistically set
    expect(sh.role).toBe('lead_tester');

    subject.error(new Error('fail'));
    tick();

    // Reverted
    expect(sh.role).toBe('account_manager');
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to update position.');
  }));

  // --- removeStakeholder ---

  it('removeStakeholder() removes from list on success', fakeAsync(() => {
    engagementsServiceSpy.deleteStakeholder.and.returnValue(of(undefined as any));
    fixture.detectChanges();
    tick();

    expect(component.stakeholders().length).toBe(1);
    component.removeStakeholder(MOCK_STAKEHOLDER);
    tick();

    expect(component.stakeholders().length).toBe(0);
  }));

  it('removeStakeholder() shows error on failure', fakeAsync(() => {
    engagementsServiceSpy.deleteStakeholder.and.returnValue(throwError(() => new Error('fail')));
    fixture.detectChanges();
    tick();

    component.removeStakeholder(MOCK_STAKEHOLDER);
    tick();

    expect(component.stakeholders().length).toBe(1);
    expect(notifySpy.error).toHaveBeenCalledWith('Failed to remove member.');
  }));

  // --- saveNewStakeholder (no role) ---

  it('saveNewStakeholder() shows error when no role selected', () => {
    component.addStakeholderMemberId = 'mem-2';
    component.addStakeholderRole = '';
    component.saveNewStakeholder();
    expect(notifySpy.error).toHaveBeenCalledWith('Please select a position.');
    expect(engagementsServiceSpy.createStakeholder).not.toHaveBeenCalled();
  });

  // --- getPositionsForMember ---

  it('getPositionsForMember() returns all roles when member not found', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    const result = component.getPositionsForMember('non-existent');
    expect(result.length).toBe(component.allRoles.length);
  }));

  it('getPositionsForMember() returns all roles for owner', fakeAsync(() => {
    const ownerMember: TenantMember = {
      ...MOCK_MEMBER,
      id: 'mem-owner',
      role: 'owner',
      groups: [],
    };
    component.availableMembers.set([ownerMember]);
    fixture.detectChanges();
    tick();

    const result = component.getPositionsForMember('mem-owner');
    expect(result.length).toBe(component.allRoles.length);
  }));

  it('getPositionsForMember() returns analyst positions for Analysts group', fakeAsync(() => {
    const analystMember: TenantMember = {
      ...MOCK_MEMBER,
      id: 'mem-analyst',
      role: 'MEMBER',
      groups: [{ id: 'g1', name: 'Analysts', is_default: false }],
    };
    component.availableMembers.set([analystMember]);
    fixture.detectChanges();
    tick();

    const result = component.getPositionsForMember('mem-analyst');
    const keys = result.map(r => r.value);
    expect(keys).toContain('security_engineer');
    expect(keys).toContain('lead_tester');
    expect(keys).toContain('qa_reviewer');
    expect(keys).toContain('technical_lead');
    expect(keys).not.toContain('account_manager');
  }));

  it('getPositionsForMember() returns collaborator positions for Collaborators group', fakeAsync(() => {
    const collabMember: TenantMember = {
      ...MOCK_MEMBER,
      id: 'mem-collab',
      role: 'MEMBER',
      groups: [{ id: 'g2', name: 'Collaborators', is_default: false }],
    };
    component.availableMembers.set([collabMember]);
    fixture.detectChanges();
    tick();

    const result = component.getPositionsForMember('mem-collab');
    const keys = result.map(r => r.value);
    expect(keys).toContain('account_manager');
    expect(keys).toContain('project_manager');
    expect(keys).toContain('client_poc');
    expect(keys).toContain('observer');
    expect(keys).not.toContain('security_engineer');
  }));

  it('getPositionsForMember() returns all roles for Administrators group', fakeAsync(() => {
    const adminMember: TenantMember = {
      ...MOCK_MEMBER,
      id: 'mem-admin',
      role: 'MEMBER',
      groups: [{ id: 'g3', name: 'Administrators', is_default: false }],
    };
    component.availableMembers.set([adminMember]);
    fixture.detectChanges();
    tick();

    const result = component.getPositionsForMember('mem-admin');
    expect(result.length).toBe(component.allRoles.length);
  }));

  it('getPositionsForMember() returns all roles when member has no matching groups', fakeAsync(() => {
    const otherMember: TenantMember = {
      ...MOCK_MEMBER,
      id: 'mem-other',
      role: 'MEMBER',
      groups: [{ id: 'g4', name: 'SomeOtherGroup', is_default: false }],
    };
    component.availableMembers.set([otherMember]);
    fixture.detectChanges();
    tick();

    const result = component.getPositionsForMember('mem-other');
    expect(result.length).toBe(component.allRoles.length);
  }));

  it('getPositionsForMember() merges Analysts and Collaborators positions', fakeAsync(() => {
    const dualMember: TenantMember = {
      ...MOCK_MEMBER,
      id: 'mem-dual',
      role: 'MEMBER',
      groups: [{ id: 'g1', name: 'Analysts', is_default: false }, { id: 'g2', name: 'Collaborators', is_default: false }],
    };
    component.availableMembers.set([dualMember]);
    fixture.detectChanges();
    tick();

    const result = component.getPositionsForMember('mem-dual');
    expect(result.length).toBe(component.allRoles.length);
  }));

  // --- vm$ with multiple setting groups ---

  it('buildViewModel sorts groups by first setting order', fakeAsync(() => {
    const multiGroupSettings: EngagementSettingDef[] = [
      { ...MOCK_SETTINGS[0], group: 'Zeta', order: 10 },
      { ...MOCK_SETTINGS[1], group: 'Alpha', order: 1 },
    ];
    engagementsServiceSpy.listSettings.and.returnValue(of(multiGroupSettings));
    fixture.detectChanges();
    let result: any;
    component.vm$.subscribe(vm => (result = vm));
    tick();

    expect(result.groups.length).toBe(2);
    expect(result.groups[0].name).toBe('Alpha');
    expect(result.groups[1].name).toBe('Zeta');
  }));

  // --- Route param fallback ---

  it('defaults engagementId to empty string when route param is null', async () => {
    await TestBed.resetTestingModule();
    engagementsServiceSpy.getById.and.returnValue(of(MOCK_ENGAGEMENT));
    engagementsServiceSpy.listSettings.and.returnValue(of([]));
    engagementsServiceSpy.listStakeholders.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [EngagementSettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: EngagementsService, useValue: engagementsServiceSpy },
        { provide: MembersService, useValue: membersServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => null }, queryParams: {} },
          },
        },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
      ],
    })
    .overrideComponent(EngagementSettingsComponent, {
      set: { schemas: [NO_ERRORS_SCHEMA] },
    })
    .compileComponents();

    const f = TestBed.createComponent(EngagementSettingsComponent);
    f.detectChanges();
    expect(f.componentInstance.engagementId).toBe('');
  });
});
