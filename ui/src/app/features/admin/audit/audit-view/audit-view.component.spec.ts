import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { AuditViewComponent } from './audit-view.component';
import { AuditService } from '../services/audit.service';
import { AuditLogDetail } from '../models/audit-log.model';

const MOCK_ENTRY: AuditLogDetail = {
  id: 42,
  action: 'update',
  resource_type: 'engagement',
  resource_id: 'eng-1',
  resource_repr: 'Test Engagement',
  actor_email: 'admin@example.com',
  ip_address: '192.168.1.1',
  timestamp: '2025-03-01T12:00:00Z',
  user_agent: 'Mozilla/5.0',
  request_id: 'req-abc',
  request_path: '/api/engagements/eng-1/',
  before: { name: 'Old Name', status: 'active' },
  after: { name: 'New Name', status: 'active' },
  diff: { name: { old: 'Old Name', new: 'New Name' } },
};

const MOCK_ENTRY_NO_DIFF: AuditLogDetail = {
  ...MOCK_ENTRY,
  action: 'create',
  before: null,
  after: { name: 'Created Thing' },
  diff: null,
};

describe('AuditViewComponent', () => {
  let component: AuditViewComponent;
  let fixture: ComponentFixture<AuditViewComponent>;

  let auditServiceSpy: jasmine.SpyObj<AuditService>;
  let locationSpy: jasmine.SpyObj<Location>;

  beforeEach(async () => {
    auditServiceSpy = jasmine.createSpyObj('AuditService', ['getById']);
    locationSpy = jasmine.createSpyObj('Location', ['back']);

    auditServiceSpy.getById.and.returnValue(of(MOCK_ENTRY));

    await TestBed.configureTestingModule({
      imports: [AuditViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuditService, useValue: auditServiceSpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => '42' } },
            root: { firstChild: null } as any,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditViewComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('loads entry on init and sets state to ready', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(auditServiceSpy.getById).toHaveBeenCalledWith(42);
    expect(vm.state).toBe('ready');
    expect(vm.entry).toEqual(MOCK_ENTRY);
  }));

  it('builds annotated lines when entry has diff', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.vm$.subscribe();
    tick();

    expect(component.beforeLines.length).toBeGreaterThan(0);
    expect(component.afterLines.length).toBeGreaterThan(0);
    // The 'name' key should be highlighted
    const nameLineBefore = component.beforeLines.find(l => l.text.includes('"name"'));
    expect(nameLineBefore?.highlighted).toBe(true);
    // The 'status' key should not be highlighted
    const statusLineBefore = component.beforeLines.find(l => l.text.includes('"status"'));
    expect(statusLineBefore?.highlighted).toBe(false);
  }));

  it('sets state to missing on 404 error', fakeAsync(() => {
    auditServiceSpy.getById.and.returnValue(throwError(() => ({ status: 404 })));
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('missing');
    expect(vm.entry).toBeNull();
  }));

  it('sets state to error on non-404 error', fakeAsync(() => {
    auditServiceSpy.getById.and.returnValue(throwError(() => ({ status: 500 })));
    fixture.detectChanges();
    tick();

    let vm: any;
    component.vm$.subscribe(v => (vm = v));
    tick();

    expect(vm.state).toBe('error');
    expect(vm.entry).toBeNull();
  }));

  it('parses id from route snapshot (defaults to 0 when missing)', fakeAsync(() => {
    TestBed.resetTestingModule();

    auditServiceSpy = jasmine.createSpyObj('AuditService', ['getById']);
    auditServiceSpy.getById.and.returnValue(of(MOCK_ENTRY));

    TestBed.configureTestingModule({
      imports: [AuditViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuditService, useValue: auditServiceSpy },
        { provide: Location, useValue: locationSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => null } },
            root: { firstChild: null } as any,
          },
        },
      ],
    });

    const fix = TestBed.createComponent(AuditViewComponent);
    const comp = fix.componentInstance;
    fix.detectChanges();
    tick();

    comp.vm$.subscribe();
    tick();

    expect(auditServiceSpy.getById).toHaveBeenCalledWith(0);
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

  it('refresh() triggers reload', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    component.vm$.subscribe();
    tick();

    auditServiceSpy.getById.calls.reset();
    component.refresh();
    tick();

    component.vm$.subscribe();
    tick();

    expect(auditServiceSpy.getById).toHaveBeenCalledWith(42);
  }));

  // --- toggleBefore / toggleAfter ---

  it('toggleBefore() toggles showBefore flag', () => {
    expect(component.showBefore).toBe(false);
    component.toggleBefore();
    expect(component.showBefore).toBe(true);
    component.toggleBefore();
    expect(component.showBefore).toBe(false);
  });

  it('toggleAfter() toggles showAfter flag', () => {
    expect(component.showAfter).toBe(false);
    component.toggleAfter();
    expect(component.showAfter).toBe(true);
    component.toggleAfter();
    expect(component.showAfter).toBe(false);
  });

  // --- getActionLabel ---

  it('getActionLabel() returns label for known action', () => {
    expect(component.getActionLabel('create')).toBe('Create');
    expect(component.getActionLabel('update')).toBe('Update');
    expect(component.getActionLabel('delete')).toBe('Delete');
    expect(component.getActionLabel('login_success')).toBe('Login');
  });

  it('getActionLabel() returns raw action for unknown action', () => {
    expect(component.getActionLabel('unknown_action')).toBe('unknown_action');
  });

  // --- getActionColor ---

  it('getActionColor() returns color for known action', () => {
    expect(component.getActionColor('create')).toBe('success');
    expect(component.getActionColor('delete')).toBe('danger');
    expect(component.getActionColor('update')).toBe('info');
  });

  it('getActionColor() returns secondary for unknown action', () => {
    expect(component.getActionColor('unknown_action')).toBe('secondary');
  });

  // --- formatJson ---

  it('formatJson() returns (empty) for null/undefined', () => {
    expect(component.formatJson(null)).toBe('(empty)');
    expect(component.formatJson(undefined)).toBe('(empty)');
  });

  it('formatJson() returns formatted JSON string', () => {
    expect(component.formatJson({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  // --- getDiffKeys ---

  it('getDiffKeys() returns empty array for null diff', () => {
    expect(component.getDiffKeys(null)).toEqual([]);
  });

  it('getDiffKeys() returns keys from diff object', () => {
    const diff = { name: { old: 'a', new: 'b' }, status: { old: 'x', new: 'y' } };
    expect(component.getDiffKeys(diff)).toEqual(['name', 'status']);
  });

  // --- formatValue ---

  it('formatValue() returns em dash for null/undefined', () => {
    expect(component.formatValue(null)).toBe('\u2014');
    expect(component.formatValue(undefined)).toBe('\u2014');
  });

  it('formatValue() returns JSON string for objects', () => {
    expect(component.formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it('formatValue() returns string representation for primitives', () => {
    expect(component.formatValue('hello')).toBe('hello');
    expect(component.formatValue(42)).toBe('42');
    expect(component.formatValue(true)).toBe('true');
  });

  // --- buildAnnotatedJson ---

  it('buildAnnotatedJson() returns empty array for null obj', () => {
    expect(component.buildAnnotatedJson(null, null)).toEqual([]);
  });

  it('buildAnnotatedJson() returns annotated lines with highlighted diff keys', () => {
    const obj = { name: 'Test', status: 'active' };
    const diff = { name: { old: 'Old', new: 'Test' } };
    const lines = component.buildAnnotatedJson(obj, diff as any);

    expect(lines.length).toBe(4); // { + 2 fields + }
    expect(lines[0]).toEqual({ text: '{', highlighted: false });
    expect(lines[1].highlighted).toBe(true);  // name is in diff
    expect(lines[2].highlighted).toBe(false);  // status is not in diff
    expect(lines[3]).toEqual({ text: '}', highlighted: false });
  });

  it('buildAnnotatedJson() handles no diff (all lines unhighlighted)', () => {
    const obj = { name: 'Test' };
    const lines = component.buildAnnotatedJson(obj, null);

    expect(lines.length).toBe(3);
    expect(lines[1].highlighted).toBe(false);
  });

  it('buildAnnotatedJson() includes comma for non-last entries', () => {
    const obj = { a: 1, b: 2 };
    const lines = component.buildAnnotatedJson(obj, null);

    expect(lines[1].text).toContain(',');
    expect(lines[2].text).not.toContain(',');
  });
});
