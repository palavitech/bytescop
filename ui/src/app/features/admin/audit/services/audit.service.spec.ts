import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuditService } from './audit.service';
import { AuditListResponse, AuditLogDetail, AuditSummary } from '../models/audit-log.model';

const MOCK_LIST_RESPONSE: AuditListResponse = {
  results: [
    {
      id: 1,
      action: 'create',
      resource_type: 'engagement',
      resource_id: 'eng-1',
      resource_repr: 'Test Engagement',
      actor_email: 'user@example.com',
      ip_address: '127.0.0.1',
      timestamp: '2026-03-01T00:00:00Z',
    },
  ],
  count: 1,
  page: 1,
  page_size: 50,
  num_pages: 1,
};

const MOCK_DETAIL: AuditLogDetail = {
  id: 1,
  action: 'create',
  resource_type: 'engagement',
  resource_id: 'eng-1',
  resource_repr: 'Test Engagement',
  actor_email: 'user@example.com',
  ip_address: '127.0.0.1',
  timestamp: '2026-03-01T00:00:00Z',
  user_agent: 'Mozilla/5.0',
  request_id: 'req-abc',
  request_path: '/api/engagements/',
  before: null,
  after: { name: 'Test Engagement' },
  diff: null,
};

const MOCK_SUMMARY: AuditSummary = {
  total: 10,
  by_action: { create: 5, update: 3, delete: 2 },
  by_resource_type: { engagement: 6, finding: 4 },
  by_actor: [{ actor_email: 'user@example.com', count: 10 }],
  by_date: [{ date: '2026-03-01', count: 10 }],
  findings_by_user_eng: { actors: [], engagements: [], matrix: [] },
  disruptive_by_user_eng: { actors: [], engagements: [], matrix: [] },
  engagement_actions_by_user: { actors: [], actions: [], matrix: [] },
  finding_actions_by_user: { actors: [], actions: [], matrix: [] },
  actions_by_ip: { ips: [], counts: [] },
  eng_id_map: {},
};

describe('AuditService', () => {
  let service: AuditService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuditService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- list ---

  it('list() sends GET to /api/audit/ with no params by default', () => {
    service.list().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() returns the response', () => {
    let result: AuditListResponse | undefined;
    service.list().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/audit/')).flush(MOCK_LIST_RESPONSE);
    expect(result).toEqual(MOCK_LIST_RESPONSE);
  });

  it('list() sends action filter', () => {
    service.list({ action: 'create' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('action')).toBe('create');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends resource_type filter', () => {
    service.list({ resource_type: 'engagement' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('resource_type')).toBe('engagement');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends actor filter', () => {
    service.list({ actor: 'user@example.com' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('actor')).toBe('user@example.com');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends resource_id filter', () => {
    service.list({ resource_id: 'eng-1' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('resource_id')).toBe('eng-1');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends date_from filter', () => {
    service.list({ date_from: '2026-01-01' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('date_from')).toBe('2026-01-01');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends date_to filter', () => {
    service.list({ date_to: '2026-12-31' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('date_to')).toBe('2026-12-31');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends engagement filter', () => {
    service.list({ engagement: 'eng-1' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('engagement')).toBe('eng-1');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends ip_address filter', () => {
    service.list({ ip_address: '192.168.1.1' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('ip_address')).toBe('192.168.1.1');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends all filters together', () => {
    const filters = {
      action: 'create',
      resource_type: 'engagement',
      actor: 'user@example.com',
      resource_id: 'eng-1',
      date_from: '2026-01-01',
      date_to: '2026-12-31',
      engagement: 'eng-1',
      ip_address: '127.0.0.1',
    };
    service.list(filters).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('action')).toBe('create');
    expect(req.request.params.get('resource_type')).toBe('engagement');
    expect(req.request.params.get('actor')).toBe('user@example.com');
    expect(req.request.params.get('resource_id')).toBe('eng-1');
    expect(req.request.params.get('date_from')).toBe('2026-01-01');
    expect(req.request.params.get('date_to')).toBe('2026-12-31');
    expect(req.request.params.get('engagement')).toBe('eng-1');
    expect(req.request.params.get('ip_address')).toBe('127.0.0.1');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends page param when page > 1', () => {
    service.list(undefined, 2).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('page')).toBe('2');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() does not send page param when page is 1', () => {
    service.list(undefined, 1).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.has('page')).toBe(false);
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends page_size param when not 50', () => {
    service.list(undefined, 1, 25).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('page_size')).toBe('25');
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() does not send page_size param when it is 50', () => {
    service.list(undefined, 1, 50).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.has('page_size')).toBe(false);
    req.flush(MOCK_LIST_RESPONSE);
  });

  it('list() sends both page and page_size', () => {
    service.list(undefined, 3, 10).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/'));
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('page_size')).toBe('10');
    req.flush(MOCK_LIST_RESPONSE);
  });

  // --- getById ---

  it('getById() sends GET to /api/audit/:id/', () => {
    service.getById(1).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/1/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_DETAIL);
  });

  it('getById() returns the audit detail', () => {
    let result: AuditLogDetail | undefined;
    service.getById(1).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/audit/1/')).flush(MOCK_DETAIL);
    expect(result).toEqual(MOCK_DETAIL);
  });

  // --- summary ---

  it('summary() sends GET to /api/audit/summary/ with no params by default', () => {
    service.summary().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(MOCK_SUMMARY);
  });

  it('summary() returns the summary', () => {
    let result: AuditSummary | undefined;
    service.summary().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/')).flush(MOCK_SUMMARY);
    expect(result).toEqual(MOCK_SUMMARY);
  });

  it('summary() sends action filter', () => {
    service.summary({ action: 'delete' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.params.get('action')).toBe('delete');
    req.flush(MOCK_SUMMARY);
  });

  it('summary() sends resource_type filter', () => {
    service.summary({ resource_type: 'finding' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.params.get('resource_type')).toBe('finding');
    req.flush(MOCK_SUMMARY);
  });

  it('summary() sends actor filter', () => {
    service.summary({ actor: 'admin@test.com' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.params.get('actor')).toBe('admin@test.com');
    req.flush(MOCK_SUMMARY);
  });

  it('summary() sends resource_id filter', () => {
    service.summary({ resource_id: 'res-1' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.params.get('resource_id')).toBe('res-1');
    req.flush(MOCK_SUMMARY);
  });

  it('summary() sends date_from filter', () => {
    service.summary({ date_from: '2026-01-01' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.params.get('date_from')).toBe('2026-01-01');
    req.flush(MOCK_SUMMARY);
  });

  it('summary() sends date_to filter', () => {
    service.summary({ date_to: '2026-12-31' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.params.get('date_to')).toBe('2026-12-31');
    req.flush(MOCK_SUMMARY);
  });

  it('summary() sends engagement filter', () => {
    service.summary({ engagement: 'eng-99' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.params.get('engagement')).toBe('eng-99');
    req.flush(MOCK_SUMMARY);
  });

  it('summary() sends ip_address filter', () => {
    service.summary({ ip_address: '10.0.0.1' }).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.params.get('ip_address')).toBe('10.0.0.1');
    req.flush(MOCK_SUMMARY);
  });

  it('summary() sends all filters together', () => {
    const filters = {
      action: 'update',
      resource_type: 'finding',
      actor: 'admin@test.com',
      resource_id: 'f-1',
      date_from: '2026-01-01',
      date_to: '2026-06-01',
      engagement: 'eng-2',
      ip_address: '10.0.0.1',
    };
    service.summary(filters).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/audit/summary/'));
    expect(req.request.params.get('action')).toBe('update');
    expect(req.request.params.get('resource_type')).toBe('finding');
    expect(req.request.params.get('actor')).toBe('admin@test.com');
    expect(req.request.params.get('resource_id')).toBe('f-1');
    expect(req.request.params.get('date_from')).toBe('2026-01-01');
    expect(req.request.params.get('date_to')).toBe('2026-06-01');
    expect(req.request.params.get('engagement')).toBe('eng-2');
    expect(req.request.params.get('ip_address')).toBe('10.0.0.1');
    req.flush(MOCK_SUMMARY);
  });
});
