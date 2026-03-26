import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GroupsService } from './groups.service';
import { TenantGroupDetail, TenantGroupListItem } from '../models/group.model';

const MOCK_LIST_ITEM: TenantGroupListItem = {
  id: 'g-1',
  name: 'Analysts',
  description: 'Security analysts group',
  is_default: false,
  member_count: 3,
  created_at: '2026-01-01T00:00:00Z',
};

const MOCK_DETAIL: TenantGroupDetail = {
  id: 'g-1',
  name: 'Analysts',
  description: 'Security analysts group',
  is_default: false,
  permissions: [{ id: 'p-1', codename: 'view_engagement', name: 'View Engagement', category: 'engagements', resource: 'engagement' }],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('GroupsService', () => {
  let service: GroupsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GroupsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- list ---

  it('list() sends GET to /api/authorization/groups/', () => {
    service.list().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/'));
    expect(req.request.method).toBe('GET');
    req.flush([MOCK_LIST_ITEM]);
  });

  it('list() returns the groups array', () => {
    let result: TenantGroupListItem[] | undefined;
    service.list().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/')).flush([MOCK_LIST_ITEM]);
    expect(result).toEqual([MOCK_LIST_ITEM]);
  });

  // --- getById ---

  it('getById() sends GET to /api/authorization/groups/:id/', () => {
    service.getById('g-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/g-1/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_DETAIL);
  });

  it('getById() returns the group detail', () => {
    let result: TenantGroupDetail | undefined;
    service.getById('g-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/g-1/')).flush(MOCK_DETAIL);
    expect(result).toEqual(MOCK_DETAIL);
  });

  // --- create ---

  it('create() sends POST to /api/authorization/groups/', () => {
    const payload = { name: 'New Group', description: 'Desc', permission_ids: ['p-1'] };
    service.create(payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_DETAIL);
  });

  it('create() returns the created group', () => {
    let result: TenantGroupDetail | undefined;
    service.create({ name: 'G', description: '', permission_ids: [] }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/')).flush(MOCK_DETAIL);
    expect(result).toEqual(MOCK_DETAIL);
  });

  // --- update ---

  it('update() sends PATCH to /api/authorization/groups/:id/', () => {
    const payload = { name: 'Updated' };
    service.update('g-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/g-1/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_DETAIL);
  });

  it('update() returns the updated group', () => {
    let result: TenantGroupDetail | undefined;
    service.update('g-1', { description: 'New desc' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/g-1/')).flush(MOCK_DETAIL);
    expect(result).toEqual(MOCK_DETAIL);
  });

  // --- delete ---

  it('delete() sends DELETE to /api/authorization/groups/:id/', () => {
    service.delete('g-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/g-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- addMember ---

  it('addMember() sends POST to /api/authorization/groups/:gid/members/', () => {
    service.addMember('g-1', 'm-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/g-1/members/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ member_id: 'm-1' });
    req.flush({ detail: 'Member added' });
  });

  it('addMember() returns the response', () => {
    let result: { detail: string } | undefined;
    service.addMember('g-1', 'm-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/g-1/members/')).flush({ detail: 'ok' });
    expect(result).toEqual({ detail: 'ok' });
  });

  // --- removeMember ---

  it('removeMember() sends DELETE to /api/authorization/groups/:gid/members/:mid/', () => {
    service.removeMember('g-1', 'm-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/groups/g-1/members/m-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
