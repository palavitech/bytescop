import { TestBed } from '@angular/core/testing';
import { PermissionService, AuthorizationPayload } from './permission.service';

describe('PermissionService', () => {
  let service: PermissionService;

  const mockPayload: AuthorizationPayload = {
    is_root: false,
    permissions: ['client.view', 'client.create', 'engagement.view'],
    groups: [
      { id: '1', name: 'Analysts', is_default: true },
    ],
  };

  const rootPayload: AuthorizationPayload = {
    is_root: true,
    permissions: ['client.view', 'client.create', 'client.update', 'client.delete'],
    groups: [
      { id: '2', name: 'Administrators', is_default: true },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PermissionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- Initial state ---

  it('starts with empty state', () => {
    expect(service.has('client.view')).toBe(false);
  });

  it('loaded$ emits false initially', () => {
    let loaded: boolean | undefined;
    service.loaded$.subscribe(v => loaded = v);
    expect(loaded).toBe(false);
  });

  // --- setFromAuthResponse ---

  it('setFromAuthResponse sets permissions', () => {
    service.setFromAuthResponse(mockPayload);
    expect(service.has('client.view')).toBe(true);
    expect(service.has('client.create')).toBe(true);
    expect(service.has('client.delete')).toBe(false);
  });

  it('setFromAuthResponse sets loaded to true', () => {
    let loaded: boolean | undefined;
    service.loaded$.subscribe(v => loaded = v);
    service.setFromAuthResponse(mockPayload);
    expect(loaded).toBe(true);
  });

  it('setFromAuthResponse with null is a no-op', () => {
    service.setFromAuthResponse(null);
    expect(service.has('client.view')).toBe(false);
  });

  it('setFromAuthResponse with undefined is a no-op', () => {
    service.setFromAuthResponse(undefined);
    expect(service.has('client.view')).toBe(false);
  });

  // --- Root user ---

  it('root user has() always returns true', () => {
    service.setFromAuthResponse(rootPayload);
    expect(service.has('anything.nonexistent')).toBe(true);
  });

  it('root user hasAll() always returns true', () => {
    service.setFromAuthResponse(rootPayload);
    expect(service.hasAll('a', 'b', 'c')).toBe(true);
  });

  it('root user hasAny() always returns true', () => {
    service.setFromAuthResponse(rootPayload);
    expect(service.hasAny('x', 'y')).toBe(true);
  });

  it('isRoot$ emits true for root user', () => {
    let isRoot: boolean | undefined;
    service.isRoot$.subscribe(v => isRoot = v);
    service.setFromAuthResponse(rootPayload);
    expect(isRoot).toBe(true);
  });

  // --- has / hasAll / hasAny ---

  it('has() returns true for assigned permission', () => {
    service.setFromAuthResponse(mockPayload);
    expect(service.has('client.view')).toBe(true);
  });

  it('has() returns false for unassigned permission', () => {
    service.setFromAuthResponse(mockPayload);
    expect(service.has('user.delete')).toBe(false);
  });

  it('hasAll() returns true when all permissions present', () => {
    service.setFromAuthResponse(mockPayload);
    expect(service.hasAll('client.view', 'client.create')).toBe(true);
  });

  it('hasAll() returns false when one permission missing', () => {
    service.setFromAuthResponse(mockPayload);
    expect(service.hasAll('client.view', 'client.delete')).toBe(false);
  });

  it('hasAny() returns true when at least one permission present', () => {
    service.setFromAuthResponse(mockPayload);
    expect(service.hasAny('client.view', 'client.delete')).toBe(true);
  });

  it('hasAny() returns false when none present', () => {
    service.setFromAuthResponse(mockPayload);
    expect(service.hasAny('user.delete', 'group.delete')).toBe(false);
  });

  // --- Observable methods ---

  it('has$() emits true for assigned permission', () => {
    let result: boolean | undefined;
    service.has$('client.view').subscribe(v => result = v);
    service.setFromAuthResponse(mockPayload);
    expect(result).toBe(true);
  });

  it('has$() emits false for unassigned permission', () => {
    let result: boolean | undefined;
    service.has$('user.delete').subscribe(v => result = v);
    service.setFromAuthResponse(mockPayload);
    expect(result).toBe(false);
  });

  it('hasAny$() emits correctly', () => {
    let result: boolean | undefined;
    service.hasAny$('client.view', 'user.delete').subscribe(v => result = v);
    service.setFromAuthResponse(mockPayload);
    expect(result).toBe(true);
  });

  // --- clear ---

  it('clear() resets all state', () => {
    service.setFromAuthResponse(mockPayload);
    service.clear();
    expect(service.has('client.view')).toBe(false);

    let loaded: boolean | undefined;
    service.loaded$.subscribe(v => loaded = v);
    expect(loaded).toBe(false);
  });

  // --- setFromAuthResponse with missing groups ---

  it('setFromAuthResponse handles payload without groups', () => {
    service.setFromAuthResponse({
      is_root: false,
      permissions: ['x.y'],
      groups: undefined as any,
    });
    expect(service.has('x.y')).toBe(true);
  });

  // --- hasAny$() reactive ---

  it('hasAny$() emits false when none match', () => {
    let result: boolean | undefined;
    service.hasAny$('a.b', 'c.d').subscribe(v => result = v);
    service.setFromAuthResponse(mockPayload);
    expect(result).toBe(false);
  });

  // --- has$() for root ---

  it('has$() emits true for root user regardless of codename', () => {
    let result: boolean | undefined;
    service.has$('nonexistent.perm').subscribe(v => result = v);
    service.setFromAuthResponse(rootPayload);
    expect(result).toBe(true);
  });

  // --- hasAny$() for root ---

  it('hasAny$() emits true for root user', () => {
    let result: boolean | undefined;
    service.hasAny$('a', 'b').subscribe(v => result = v);
    service.setFromAuthResponse(rootPayload);
    expect(result).toBe(true);
  });

  // --- isRoot$ emits false for non-root ---

  it('isRoot$ emits false for non-root user', () => {
    let isRoot: boolean | undefined;
    service.isRoot$.subscribe(v => isRoot = v);
    service.setFromAuthResponse(mockPayload);
    expect(isRoot).toBe(false);
  });

  // --- defaultGroupNames$ ---

  it('defaultGroupNames$ emits default group names', () => {
    let names: string[] | undefined;
    service.defaultGroupNames$.subscribe(v => names = v);
    service.setFromAuthResponse(mockPayload);
    expect(names).toEqual(['Analysts']);
  });

  it('defaultGroupNames$ emits empty array initially', () => {
    let names: string[] | undefined;
    service.defaultGroupNames$.subscribe(v => names = v);
    expect(names).toEqual([]);
  });
});
