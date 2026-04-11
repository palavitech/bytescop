import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EngagementsService } from './engagements.service';
import { Engagement, MalwareSample, Sow } from '../models/engagement.model';
import { EngagementSettingDef } from '../models/stakeholder.model';

const MOCK: Engagement = {
  id: 'eng-1',
  name: 'Test Engagement',
  client_id: 'client-1',
  client_name: 'Acme Corp',
  status: 'active',
  description: 'desc',
  notes: '',
  start_date: '2026-01-01',
  end_date: '2026-03-01',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  findings_summary: null,
  engagement_type: 'general',
};

describe('EngagementsService', () => {
  let service: EngagementsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EngagementsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- list ---

  it('list() sends GET without params when no filters', () => {
    service.list().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush([MOCK]);
  });

  it('list() sends GET with client filter', () => {
    service.list({ client: 'client-1' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/'));
    expect(req.request.params.get('client')).toBe('client-1');
    expect(req.request.params.has('status')).toBe(false);
    req.flush([MOCK]);
  });

  it('list() sends GET with status filter', () => {
    service.list({ status: 'active' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/'));
    expect(req.request.params.get('status')).toBe('active');
    expect(req.request.params.has('client')).toBe(false);
    req.flush([MOCK]);
  });

  it('list() sends GET with both filters', () => {
    service.list({ client: 'c1', status: 'active' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/'));
    expect(req.request.params.get('client')).toBe('c1');
    expect(req.request.params.get('status')).toBe('active');
    req.flush([MOCK]);
  });

  it('list() returns engagement array', () => {
    let result: Engagement[] | undefined;
    service.list().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/')).flush([MOCK]);
    expect(result).toEqual([MOCK]);
  });

  it('list() ignores empty string filters', () => {
    service.list({ client: '', status: '' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/'));
    expect(req.request.params.keys().length).toBe(0);
    req.flush([]);
  });

  // --- getById ---

  it('getById() sends GET to /api/engagements/:id/', () => {
    service.getById('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK);
  });

  it('getById() returns the engagement', () => {
    let result: Engagement | undefined;
    service.getById('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/')).flush(MOCK);
    expect(result).toEqual(MOCK);
  });

  // --- create ---

  it('create() sends POST to /api/engagements/', () => {
    const payload = { name: 'New', client_id: 'c1' };
    service.create(payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK);
  });

  it('create() returns the created engagement', () => {
    let result: Engagement | undefined;
    service.create({ name: 'New' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/')).flush(MOCK);
    expect(result).toEqual(MOCK);
  });

  // --- update ---

  it('update() sends PATCH to /api/engagements/:id/', () => {
    const payload = { name: 'Updated' };
    service.update('eng-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK);
  });

  it('update() returns the updated engagement', () => {
    let result: Engagement | undefined;
    service.update('eng-1', { name: 'Updated' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/')).flush(MOCK);
    expect(result).toEqual(MOCK);
  });

  // --- delete ---

  it('delete() sends DELETE to /api/engagements/:id/', () => {
    service.delete('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- Stakeholders ---

  it('listStakeholders() sends GET to /api/engagements/:id/stakeholders/', () => {
    service.listStakeholders('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/stakeholders/'));
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('createStakeholder() sends POST to /api/engagements/:id/stakeholders/', () => {
    const body = { member_id: 'm-1', role: 'lead_tester' };
    service.createStakeholder('eng-1', body).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/stakeholders/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('updateStakeholder() sends PATCH to /api/engagements/:id/stakeholders/:shId/', () => {
    service.updateStakeholder('eng-1', 'sh-1', { role: 'observer' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/stakeholders/sh-1/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role: 'observer' });
    req.flush({});
  });

  it('deleteStakeholder() sends DELETE to /api/engagements/:id/stakeholders/:shId/', () => {
    service.deleteStakeholder('eng-1', 'sh-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/stakeholders/sh-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- Settings ---

  it('listSettings() sends GET to /api/engagements/:id/settings/', () => {
    service.listSettings('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/settings/'));
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('upsertSetting() sends PUT to /api/engagements/:id/settings/', () => {
    service.upsertSetting('eng-1', 'theme', 'dark').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/settings/'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ key: 'theme', value: 'dark' });
    req.flush({});
  });

  it('upsertSetting() returns the upserted setting', () => {
    const mockSetting: EngagementSettingDef = {
      key: 'theme',
      label: 'Theme',
      description: 'UI theme',
      setting_type: 'choice',
      choices: ['dark', 'light'],
      default: 'dark',
      group: 'display',
      order: 1,
      value: 'dark',
      has_value: true,
      updated_at: '2026-01-01T00:00:00Z',
      updated_by: 'u-1',
    };
    let result: EngagementSettingDef | undefined;
    service.upsertSetting('eng-1', 'theme', 'dark').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/settings/')).flush(mockSetting);
    expect(result).toEqual(mockSetting);
  });

  it('listSettings() returns the settings array', () => {
    let result: EngagementSettingDef[] | undefined;
    service.listSettings('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/settings/')).flush([]);
    expect(result).toEqual([]);
  });

  // --- SoW ---

  it('getSow() sends GET to /api/engagements/:id/sow/', () => {
    service.getSow('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/'));
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('getSow() returns the SoW', () => {
    const mockSow: Sow = {
      id: 'sow-1',
      engagement: 'eng-1',
      title: 'Test SoW',
      status: 'draft',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    let result: Sow | undefined;
    service.getSow('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/')).flush(mockSow);
    expect(result).toEqual(mockSow);
  });

  it('updateSow() sends PATCH to /api/engagements/:id/sow/', () => {
    service.updateSow('eng-1', { title: 'Updated SoW' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'Updated SoW' });
    req.flush({});
  });

  it('updateSow() returns the updated SoW', () => {
    const mockSow: Sow = {
      id: 'sow-1',
      engagement: 'eng-1',
      title: 'Updated SoW',
      status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    };
    let result: Sow | undefined;
    service.updateSow('eng-1', { title: 'Updated SoW', status: 'approved' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/sow/')).flush(mockSow);
    expect(result).toEqual(mockSow);
  });

  // --- Scope ---

  it('listScope() sends GET to /api/engagements/:id/scope/', () => {
    service.listScope('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/scope/'));
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('listScope() returns the assets array', () => {
    let result: any[] | undefined;
    service.listScope('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/scope/')).flush([]);
    expect(result).toEqual([]);
  });

  it('addToScope() sends POST to /api/engagements/:id/scope/', () => {
    service.addToScope('eng-1', 'asset-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/scope/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ asset_id: 'asset-1' });
    req.flush({});
  });

  it('removeFromScope() sends DELETE to /api/engagements/:id/scope/:assetId/', () => {
    service.removeFromScope('eng-1', 'asset-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/scope/asset-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- Stakeholder return values ---

  it('listStakeholders() returns the stakeholders array', () => {
    let result: any[] | undefined;
    service.listStakeholders('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/stakeholders/')).flush([]);
    expect(result).toEqual([]);
  });

  it('createStakeholder() returns the created stakeholder', () => {
    const mockStakeholder = { id: 'sh-1', member_id: 'm-1', role: 'lead_tester' };
    let result: any;
    service.createStakeholder('eng-1', { member_id: 'm-1', role: 'lead_tester' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/stakeholders/')).flush(mockStakeholder);
    expect(result).toEqual(mockStakeholder);
  });

  it('updateStakeholder() returns the updated stakeholder', () => {
    const mockStakeholder = { id: 'sh-1', member_id: 'm-1', role: 'observer' };
    let result: any;
    service.updateStakeholder('eng-1', 'sh-1', { role: 'observer' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/stakeholders/sh-1/')).flush(mockStakeholder);
    expect(result).toEqual(mockStakeholder);
  });

  // --- Malware Samples ---

  it('listSamples() sends GET to /api/engagements/:id/samples/', () => {
    service.listSamples('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/samples/'));
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('listSamples() returns sample array', () => {
    const mockSample: MalwareSample = {
      id: 's-1',
      original_filename: 'malware.exe',
      safe_filename: 'safe_malware.exe',
      sha256: 'abc123',
      content_type: 'application/octet-stream',
      size_bytes: 1024,
      notes: 'test sample',
      download_url: '/api/samples/s-1/download/',
      created_at: '2026-01-01T00:00:00Z',
    };
    let result: MalwareSample[] | undefined;
    service.listSamples('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/samples/')).flush([mockSample]);
    expect(result).toEqual([mockSample]);
  });

  it('uploadSample() sends POST with FormData to /api/engagements/:id/samples/upload/', () => {
    const file = new File(['content'], 'test.exe', { type: 'application/octet-stream' });
    service.uploadSample('eng-1', file, 'some notes').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/samples/upload/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush({});
  });

  it('uploadSample() sends FormData without notes when notes is empty', () => {
    const file = new File(['content'], 'test.exe', { type: 'application/octet-stream' });
    service.uploadSample('eng-1', file).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/samples/upload/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    req.flush({});
  });

  it('deleteSample() sends DELETE to /api/engagements/:id/samples/:sampleId/', () => {
    service.deleteSample('eng-1', 's-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/samples/s-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- Analysis Checks ---

  it('initializeAnalysis() sends POST to /api/engagements/:id/initialize-analysis/', () => {
    service.initializeAnalysis('eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/initialize-analysis/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ created: 5 });
  });

  it('initializeAnalysis() returns the created count', () => {
    let result: { created: number } | undefined;
    service.initializeAnalysis('eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/initialize-analysis/')).flush({ created: 3 });
    expect(result).toEqual({ created: 3 });
  });

  it('executeFinding() sends POST to /api/engagements/:id/findings/:fid/execute/', () => {
    service.executeFinding('eng-1', 'f-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/f-1/execute/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ status: 'running' });
  });

  it('executeFinding() returns the status', () => {
    let result: { status: string } | undefined;
    service.executeFinding('eng-1', 'f-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/findings/f-1/execute/')).flush({ status: 'running' });
    expect(result).toEqual({ status: 'running' });
  });
});
