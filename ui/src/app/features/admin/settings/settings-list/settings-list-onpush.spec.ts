import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { Subject, of } from 'rxjs';

import { SettingsListComponent } from './settings-list.component';
import { SettingsService } from '../services/settings.service';
import { NotificationService } from '../../../../services/core/notify/notification.service';
import { PermissionService } from '../../../../services/core/auth/permission.service';
import { DateFormatService } from '../../../../services/core/date-format.service';
import { AuthService } from '../../../../services/core/auth/auth.service';
import { TokenService } from '../../../../services/core/auth/token.service';
import { UserProfileService } from '../../../../services/core/profile/user-profile.service';
import { Router } from '@angular/router';
import { SettingDefinition } from '../models/setting.model';

describe('SettingsListComponent OnPush', () => {
  let fixture: ComponentFixture<SettingsListComponent>;
  let component: SettingsListComponent;
  let markSpy: jasmine.Spy;

  let settingsServiceSpy: jasmine.SpyObj<SettingsService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let locationSpy: jasmine.SpyObj<Location>;

  const mockSetting: SettingDefinition = {
    key: 'test_key',
    label: 'Test Setting',
    description: 'A test setting',
    setting_type: 'text',
    choices: [],
    default: 'default_val',
    group: 'General',
    order: 1,
    value: 'current_val',
    has_value: true,
    updated_at: '2025-01-01T00:00:00Z',
    updated_by: 'admin',
  };

  beforeEach(async () => {
    settingsServiceSpy = jasmine.createSpyObj('SettingsService', [
      'list', 'upsert', 'reset', 'hasLogo',
      'deleteLogo', 'getLogoBlob', 'uploadLogo',
      'getLicenseStatus', 'activateLicense', 'removeLicense',
      'verifyClosureMfa', 'executeClosure',
    ]);
    notifySpy = jasmine.createSpyObj('NotificationService', ['success', 'error']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    // Default stubs for initial render
    settingsServiceSpy.list.and.returnValue(of([mockSetting]));
    settingsServiceSpy.hasLogo.and.returnValue(of({ has_logo: false }));
    settingsServiceSpy.getLicenseStatus.and.returnValue(of({ plan: 'community', features: [], max_users: 3, max_workspaces: 1, expired: false, expires_at: null, customer: '', has_key: false }));

    await TestBed.configureTestingModule({
      imports: [SettingsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: settingsServiceSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: Location, useValue: locationSpy },
        { provide: PermissionService, useValue: { hasAny$: () => of(true), has: () => true } },
        { provide: DateFormatService, useValue: jasmine.createSpyObj('DateFormatService', ['setFormat']) },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['setUser']) },
        { provide: TokenService, useValue: jasmine.createSpyObj('TokenService', ['clear']) },
        { provide: UserProfileService, useValue: { profile$: of(null), currentSubscription: () => ({ limits: {} }), refreshProfile: () => of({}) } },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigateByUrl']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function getMarkSpy(): jasmine.Spy {
    return spyOn((component as any).cdr, 'markForCheck');
  }

  it('save should call markForCheck after successful upsert', () => {
    markSpy = getMarkSpy();

    const upsertSubject = new Subject<SettingDefinition>();
    settingsServiceSpy.upsert.and.returnValue(upsertSubject.asObservable());

    const row: any = {
      ...mockSetting,
      editValue: 'new_val',
      dirty: true,
      saving: false,
    };

    component.save(row);

    upsertSubject.next({
      ...mockSetting,
      value: 'new_val',
      has_value: true,
      updated_at: '2025-06-01T00:00:00Z',
      updated_by: 'admin',
    });
    upsertSubject.complete();

    expect(markSpy).toHaveBeenCalled();
  });

  it('resetSetting should call markForCheck after successful reset', () => {
    markSpy = getMarkSpy();

    const resetSubject = new Subject<SettingDefinition>();
    settingsServiceSpy.reset.and.returnValue(resetSubject.asObservable());

    const row: any = {
      ...mockSetting,
      editValue: 'current_val',
      dirty: false,
      saving: false,
    };

    component.resetSetting(row);

    resetSubject.next({
      ...mockSetting,
      value: 'default_val',
      has_value: false,
      updated_at: null,
      updated_by: null,
    });
    resetSubject.complete();

    expect(markSpy).toHaveBeenCalled();
  });
});
