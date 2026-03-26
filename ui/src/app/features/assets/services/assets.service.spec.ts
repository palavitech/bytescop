import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AssetsService } from './assets.service';
import { Asset } from '../models/asset.model';

const MOCK_ASSET: Asset = {
  id: 'a-1',
  name: 'WebApp Main',
  client_id: 'c-1',
  client_name: 'ACME Corp',
  asset_type: 'webapp',
  environment: 'prod',
  criticality: 'high',
  target: 'https://app.example.com',
  notes: '',
  attributes: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('AssetsService', () => {
  let service: AssetsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssetsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- list ---

  it('list() sends GET to /api/assets/ without clientId', () => {
    service.list().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/assets/'));
    expect(req.request.method).toBe('GET');
    req.flush([MOCK_ASSET]);
  });

  it('list() returns the assets array', () => {
    let result: Asset[] | undefined;
    service.list().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/assets/')).flush([MOCK_ASSET]);
    expect(result).toEqual([MOCK_ASSET]);
  });

  it('list() sends client filter when clientId is provided', () => {
    service.list('c-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.includes('/api/assets/?client=c-1'));
    expect(req.request.method).toBe('GET');
    req.flush([MOCK_ASSET]);
  });

  // --- getById ---

  it('getById() sends GET to /api/assets/:id/', () => {
    service.getById('a-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/assets/a-1/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_ASSET);
  });

  it('getById() returns the asset', () => {
    let result: Asset | undefined;
    service.getById('a-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/assets/a-1/')).flush(MOCK_ASSET);
    expect(result).toEqual(MOCK_ASSET);
  });

  // --- create ---

  it('create() sends POST to /api/assets/', () => {
    const payload: Partial<Asset> = { name: 'New Asset', asset_type: 'host' };
    service.create(payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/assets/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_ASSET);
  });

  it('create() returns the created asset', () => {
    let result: Asset | undefined;
    service.create({ name: 'New' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/assets/')).flush(MOCK_ASSET);
    expect(result).toEqual(MOCK_ASSET);
  });

  // --- update ---

  it('update() sends PATCH to /api/assets/:id/', () => {
    const payload: Partial<Asset> = { name: 'Updated' };
    service.update('a-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/assets/a-1/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_ASSET);
  });

  it('update() returns the updated asset', () => {
    let result: Asset | undefined;
    service.update('a-1', { name: 'Updated' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/assets/a-1/')).flush(MOCK_ASSET);
    expect(result).toEqual(MOCK_ASSET);
  });

  // --- delete ---

  it('delete() sends DELETE to /api/assets/:id/', () => {
    service.delete('a-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/assets/a-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- scopeUsage ---

  it('scopeUsage() sends GET to /api/assets/:id/scope-usage/', () => {
    service.scopeUsage('a-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/assets/a-1/scope-usage/'));
    expect(req.request.method).toBe('GET');
    req.flush({ count: 3 });
  });

  it('scopeUsage() returns the count', () => {
    let result: { count: number } | undefined;
    service.scopeUsage('a-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/assets/a-1/scope-usage/')).flush({ count: 5 });
    expect(result).toEqual({ count: 5 });
  });
});
