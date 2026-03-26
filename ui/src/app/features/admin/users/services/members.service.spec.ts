import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MembersService } from './members.service';
import { EngagementAssignment, TenantMember, ToggleActiveResponse } from '../models/member.model';

const MOCK_MEMBER: TenantMember = {
  id: 'm-1',
  user: {
    id: 'u-1',
    email: 'user@example.com',
    first_name: 'Test',
    last_name: 'User',
    phone: '+1234567890',
    timezone: 'UTC',
    avatar_url: null,
    mfa_enabled: false,
  },
  role: 'MEMBER',
  is_active: true,
  invite_status: 'none' as const,
  groups: [{ id: 'g-1', name: 'Analysts', is_default: false }],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('MembersService', () => {
  let service: MembersService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MembersService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- list ---

  it('list() sends GET to /api/authorization/members/', () => {
    service.list().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/'));
    expect(req.request.method).toBe('GET');
    req.flush([MOCK_MEMBER]);
  });

  it('list() returns the members array', () => {
    let result: TenantMember[] | undefined;
    service.list().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/')).flush([MOCK_MEMBER]);
    expect(result).toEqual([MOCK_MEMBER]);
  });

  // --- getById ---

  it('getById() sends GET to /api/authorization/members/:id/', () => {
    service.getById('m-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_MEMBER);
  });

  it('getById() returns the member', () => {
    let result: TenantMember | undefined;
    service.getById('m-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/')).flush(MOCK_MEMBER);
    expect(result).toEqual(MOCK_MEMBER);
  });

  // --- create ---

  it('create() sends POST to /api/authorization/members/', () => {
    const payload = {
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
    };
    service.create(payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_MEMBER);
  });

  it('create() returns the created member', () => {
    let result: TenantMember | undefined;
    service.create({ email: 'x@test.com', first_name: 'X', last_name: 'Y' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/')).flush(MOCK_MEMBER);
    expect(result).toEqual(MOCK_MEMBER);
  });

  // --- update ---

  it('update() sends PATCH to /api/authorization/members/:id/', () => {
    const payload = { first_name: 'Updated' };
    service.update('m-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_MEMBER);
  });

  it('update() returns the updated member', () => {
    let result: TenantMember | undefined;
    service.update('m-1', { last_name: 'New' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/')).flush(MOCK_MEMBER);
    expect(result).toEqual(MOCK_MEMBER);
  });

  // --- delete ---

  it('delete() sends DELETE to /api/authorization/members/:id/', () => {
    service.delete('m-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- toggleActive ---

  it('toggleActive() sends POST to /api/authorization/members/:id/toggle-active/', () => {
    service.toggleActive('m-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/toggle-active/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ id: 'm-1', is_active: false });
  });

  it('toggleActive() returns the response', () => {
    let result: ToggleActiveResponse | undefined;
    service.toggleActive('m-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/toggle-active/')).flush({ id: 'm-1', is_active: true });
    expect(result).toEqual({ id: 'm-1', is_active: true });
  });

  // --- resetMfa ---

  it('resetMfa() sends POST to /api/authorization/members/:id/reset-mfa/', () => {
    service.resetMfa('m-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/reset-mfa/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ detail: 'MFA reset' });
  });

  it('resetMfa() returns the response', () => {
    let result: { detail: string } | undefined;
    service.resetMfa('m-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/reset-mfa/')).flush({ detail: 'ok' });
    expect(result).toEqual({ detail: 'ok' });
  });

  // --- promote ---

  it('promote() sends POST to /api/authorization/members/:id/promote/', () => {
    service.promote('m-1', '123456').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/promote/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ mfa_code: '123456' });
    req.flush(MOCK_MEMBER);
  });

  it('promote() returns the promoted member', () => {
    let result: TenantMember | undefined;
    service.promote('m-1', '654321').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/promote/')).flush(MOCK_MEMBER);
    expect(result).toEqual(MOCK_MEMBER);
  });

  // --- demote ---

  it('demote() sends POST to /api/authorization/members/:id/demote/', () => {
    service.demote('m-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/demote/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(MOCK_MEMBER);
  });

  it('demote() returns the demoted member', () => {
    let result: TenantMember | undefined;
    service.demote('m-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/demote/')).flush(MOCK_MEMBER);
    expect(result).toEqual(MOCK_MEMBER);
  });

  // --- getEngagements ---

  it('getEngagements() sends GET to /api/authorization/members/:id/engagements/', () => {
    service.getEngagements('m-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/engagements/'));
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('getEngagements() returns the engagement assignments', () => {
    const mockAssignment: EngagementAssignment = {
      id: 'ea-1',
      engagement_id: 'eng-1',
      engagement_name: 'Test Engagement',
      client_name: 'Acme Corp',
      engagement_status: 'active',
      role: 'lead_tester',
      created_at: '2026-01-01T00:00:00Z',
    };
    let result: EngagementAssignment[] | undefined;
    service.getEngagements('m-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/engagements/')).flush([mockAssignment]);
    expect(result).toEqual([mockAssignment]);
  });

  // --- addEngagement ---

  it('addEngagement() sends POST to /api/authorization/members/:id/engagements/', () => {
    service.addEngagement('m-1', 'eng-1', 'lead_tester').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/engagements/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ engagement_id: 'eng-1', role: 'lead_tester' });
    req.flush({});
  });

  it('addEngagement() returns the created assignment', () => {
    const mockAssignment: EngagementAssignment = {
      id: 'ea-2',
      engagement_id: 'eng-2',
      engagement_name: 'New Engagement',
      client_name: 'Corp Inc',
      engagement_status: 'planned',
      role: 'observer',
      created_at: '2026-02-01T00:00:00Z',
    };
    let result: EngagementAssignment | undefined;
    service.addEngagement('m-1', 'eng-2', 'observer').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/engagements/')).flush(mockAssignment);
    expect(result).toEqual(mockAssignment);
  });

  // --- removeEngagement ---

  it('removeEngagement() sends DELETE to /api/authorization/members/:id/engagements/:stakeholderId/', () => {
    service.removeEngagement('m-1', 'sh-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/engagements/sh-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
