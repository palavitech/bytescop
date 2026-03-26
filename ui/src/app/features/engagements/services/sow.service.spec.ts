import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SowService } from './sow.service';
import { Sow } from '../models/sow.model';
import { Asset } from '../../assets/models/asset.model';

const MOCK_SOW: Sow = {
  id: 'sow-1',
  title: 'Test SoW',
  status: 'draft',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_ASSET: Asset = {
  id: 'asset-1',
  name: 'WebApp Main',
  client_id: 'client-1',
  client_name: 'Acme Corp',
  asset_type: 'webapp',
  environment: 'prod',
  criticality: 'high',
  target: 'https://app.acme.com',
  notes: '',
  attributes: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('SowService', () => {
  let service: SowService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SowService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- get ---

  it('get() sends GET to /api/engagements/:id/sow/', () => {
    service.get('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_SOW);
  });

  it('get() returns the SoW', () => {
    let result: Sow | undefined;
    service.get('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/')).flush(MOCK_SOW);
    expect(result).toEqual(MOCK_SOW);
  });

  // --- create ---

  it('create() sends POST to /api/engagements/:id/sow/', () => {
    const payload = { title: 'New SoW' };
    service.create('eng-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_SOW);
  });

  it('create() returns the created SoW', () => {
    let result: Sow | undefined;
    service.create('eng-1', { title: 'New' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/')).flush(MOCK_SOW);
    expect(result).toEqual(MOCK_SOW);
  });

  // --- update ---

  it('update() sends PATCH to /api/engagements/:id/sow/', () => {
    const payload = { title: 'Updated SoW' };
    service.update('eng-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_SOW);
  });

  it('update() returns the updated SoW', () => {
    let result: Sow | undefined;
    service.update('eng-1', { status: 'approved' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/')).flush(MOCK_SOW);
    expect(result).toEqual(MOCK_SOW);
  });

  // --- delete ---

  it('delete() sends DELETE to /api/engagements/:id/sow/', () => {
    service.delete('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- listScope ---

  it('listScope() sends GET to /api/engagements/:id/scope/', () => {
    service.listScope('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/scope/'));
    expect(req.request.method).toBe('GET');
    req.flush([MOCK_ASSET]);
  });

  it('listScope() returns asset array', () => {
    let result: Asset[] | undefined;
    service.listScope('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/scope/')).flush([MOCK_ASSET]);
    expect(result).toEqual([MOCK_ASSET]);
  });

  // --- addScope ---

  it('addScope() sends POST with asset_id body to /api/engagements/:id/scope/', () => {
    service.addScope('eng-1', 'asset-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/scope/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ asset_id: 'asset-1' });
    req.flush(MOCK_ASSET);
  });

  it('addScope() returns the added asset', () => {
    let result: Asset | undefined;
    service.addScope('eng-1', 'asset-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/scope/')).flush(MOCK_ASSET);
    expect(result).toEqual(MOCK_ASSET);
  });

  // --- removeScope ---

  it('removeScope() sends DELETE to /api/engagements/:id/scope/:assetId/', () => {
    service.removeScope('eng-1', 'asset-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/scope/asset-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
