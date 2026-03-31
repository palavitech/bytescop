import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FindingsService, UploadImageResponse } from './findings.service';
import { Finding } from '../models/finding.model';

const MOCK: Finding = {
  id: 'find-1',
  engagement_id: 'eng-1',
  asset_id: 'asset-1',
  asset_name: 'WebApp Main',
  title: 'XSS in Search',
  severity: 'medium',
  assessment_area: 'application_security',
  owasp_category: 'A03:2021',
  cwe_id: 'CWE-79',
  status: 'open',
  description_md: '',
  recommendation_md: '',
  is_draft: false,
  sample_id: null,
  sample_name: '',
  analysis_type: '',
  analysis_check_key: '',
  execution_status: '',
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

describe('FindingsService', () => {
  let service: FindingsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FindingsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- list ---

  it('list() sends GET to /api/engagements/:id/findings/', () => {
    service.list('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush([MOCK]);
  });

  it('list() sends asset_id filter', () => {
    service.list('eng-1', { asset_id: 'a1' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/'));
    expect(req.request.params.get('asset_id')).toBe('a1');
    req.flush([MOCK]);
  });

  it('list() sends severity filter', () => {
    service.list('eng-1', { severity: 'high' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/'));
    expect(req.request.params.get('severity')).toBe('high');
    req.flush([MOCK]);
  });

  it('list() sends status filter', () => {
    service.list('eng-1', { status: 'open' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/'));
    expect(req.request.params.get('status')).toBe('open');
    req.flush([MOCK]);
  });

  it('list() sends all filters together', () => {
    service.list('eng-1', { asset_id: 'a1', severity: 'critical', status: 'triage' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/'));
    expect(req.request.params.get('asset_id')).toBe('a1');
    expect(req.request.params.get('severity')).toBe('critical');
    expect(req.request.params.get('status')).toBe('triage');
    req.flush([MOCK]);
  });

  it('list() sends include_drafts filter', () => {
    service.list('eng-1', { include_drafts: true }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/'));
    expect(req.request.params.get('include_drafts')).toBe('true');
    req.flush([MOCK]);
  });

  it('list() does not send include_drafts when false', () => {
    service.list('eng-1', { include_drafts: false }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/'));
    expect(req.request.params.has('include_drafts')).toBe(false);
    req.flush([]);
  });

  it('list() ignores empty string filters', () => {
    service.list('eng-1', { asset_id: '', severity: '', status: '' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/'));
    expect(req.request.params.keys().length).toBe(0);
    req.flush([]);
  });

  it('list() returns finding array', () => {
    let result: Finding[] | undefined;
    service.list('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/')).flush([MOCK]);
    expect(result).toEqual([MOCK]);
  });

  // --- getById ---

  it('getById() sends GET to /api/engagements/:id/findings/:fid/', () => {
    service.getById('eng-1', 'find-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/find-1/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK);
  });

  it('getById() returns the finding', () => {
    let result: Finding | undefined;
    service.getById('eng-1', 'find-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/find-1/')).flush(MOCK);
    expect(result).toEqual(MOCK);
  });

  // --- create ---

  it('create() sends POST to /api/engagements/:id/findings/', () => {
    const payload = { title: 'New', severity: 'high' as const };
    service.create('eng-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK);
  });

  it('create() returns the created finding', () => {
    let result: Finding | undefined;
    service.create('eng-1', { title: 'New' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/')).flush(MOCK);
    expect(result).toEqual(MOCK);
  });

  // --- update ---

  it('update() sends PATCH to /api/engagements/:id/findings/:fid/', () => {
    const payload = { title: 'Updated' };
    service.update('eng-1', 'find-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/find-1/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK);
  });

  it('update() returns the updated finding', () => {
    let result: Finding | undefined;
    service.update('eng-1', 'find-1', { title: 'Updated' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/find-1/')).flush(MOCK);
    expect(result).toEqual(MOCK);
  });

  // --- delete ---

  it('delete() sends DELETE to /api/engagements/:id/findings/:fid/', () => {
    service.delete('eng-1', 'find-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/find-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- uploadImage ---

  it('uploadImage() sends multipart POST to /attachments/images/', () => {
    const file = new File(['pixels'], 'screenshot.png', { type: 'image/png' });
    let result: UploadImageResponse | undefined;
    service.uploadImage('eng-1', file).subscribe(r => (result = r));

    const req = httpTesting.expectOne(r => r.url.endsWith('/attachments/images/') && r.method === 'POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('file')).toBeTruthy();
    req.flush({ token: 'tok-1', url: '/media/image.png' });

    expect(result).toEqual({ token: 'tok-1', url: '/media/image.png' });
  });
});