import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PermissionsApiService } from './permissions-api.service';
import { PermissionItem } from '../models/group.model';

const MOCK_PERMISSIONS: PermissionItem[] = [
  { id: 'p-1', codename: 'view_engagement', name: 'View Engagement', category: 'engagements', resource: 'engagement' },
  { id: 'p-2', codename: 'edit_engagement', name: 'Edit Engagement', category: 'engagements', resource: 'engagement' },
];

describe('PermissionsApiService', () => {
  let service: PermissionsApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PermissionsApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- list ---

  it('list() sends GET to /api/authorization/permissions/', () => {
    service.list().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/permissions/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_PERMISSIONS);
  });

  it('list() returns the permissions array', () => {
    let result: PermissionItem[] | undefined;
    service.list().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/permissions/')).flush(MOCK_PERMISSIONS);
    expect(result).toEqual(MOCK_PERMISSIONS);
  });

  it('list() caches the result (shareReplay)', () => {
    // First call
    let result1: PermissionItem[] | undefined;
    service.list().subscribe(r => (result1 = r));
    const req1 = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/permissions/'));
    req1.flush(MOCK_PERMISSIONS);
    expect(result1).toEqual(MOCK_PERMISSIONS);

    // Second call should reuse cache — no new HTTP request
    let result2: PermissionItem[] | undefined;
    service.list().subscribe(r => (result2 = r));
    httpTesting.expectNone(r => r.url.endsWith('/api/authorization/permissions/'));
    expect(result2).toEqual(MOCK_PERMISSIONS);
  });

  // --- clearCache ---

  it('clearCache() clears the cached observable', () => {
    // First call - populates cache
    service.list().subscribe();
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/permissions/')).flush(MOCK_PERMISSIONS);

    // Clear cache
    service.clearCache();

    // Third call should make a new HTTP request
    service.list().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/permissions/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_PERMISSIONS);
  });

  it('clearCache() is safe to call when no cache exists', () => {
    expect(() => service.clearCache()).not.toThrow();
  });
});
