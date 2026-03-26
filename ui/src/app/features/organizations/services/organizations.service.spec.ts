import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OrganizationsService } from './organizations.service';
import { Organization, OrganizationRef } from '../models/organization.model';

const MOCK_ORG: Organization = {
  id: 'org-1',
  name: 'Acme Corp',
  website: 'https://acme.com',
  status: 'active',
  notes: 'Test org',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_ORG_2: Organization = {
  id: 'org-2',
  name: 'Wayne Enterprises',
  website: 'https://wayne.com',
  status: 'inactive',
  notes: '',
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        OrganizationsService,
      ],
    });

    service = TestBed.inject(OrganizationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- list() ---

  it('list() makes GET request to /api/clients/', () => {
    service.list().subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('/api/clients/'));
    expect(req.request.method).toBe('GET');
    req.flush([MOCK_ORG, MOCK_ORG_2]);
  });

  it('list() returns array of organizations', (done: DoneFn) => {
    service.list().subscribe(orgs => {
      expect(orgs.length).toBe(2);
      expect(orgs[0].name).toBe('Acme Corp');
      expect(orgs[1].name).toBe('Wayne Enterprises');
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/clients/'));
    req.flush([MOCK_ORG, MOCK_ORG_2]);
  });

  it('list() returns empty array when no organizations', (done: DoneFn) => {
    service.list().subscribe(orgs => {
      expect(orgs).toEqual([]);
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/clients/'));
    req.flush([]);
  });

  // --- getById() ---

  it('getById() makes GET request with id', (done: DoneFn) => {
    service.getById('org-1').subscribe(org => {
      expect(org.id).toBe('org-1');
      expect(org.name).toBe('Acme Corp');
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/clients/org-1/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_ORG);
  });

  // --- create() ---

  it('create() makes POST request with data', (done: DoneFn) => {
    const newOrg = { name: 'New Org', website: 'https://new.com' };

    service.create(newOrg).subscribe(org => {
      expect(org.name).toBe('Acme Corp');
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/clients/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(newOrg);
    req.flush(MOCK_ORG);
  });

  // --- update() ---

  it('update() makes PATCH request with id and data', (done: DoneFn) => {
    const updates = { name: 'Updated Acme' };

    service.update('org-1', updates).subscribe(org => {
      expect(org.name).toBe('Acme Corp');
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/clients/org-1/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(updates);
    req.flush(MOCK_ORG);
  });

  // --- delete() ---

  it('delete() makes DELETE request with id', (done: DoneFn) => {
    service.delete('org-1').subscribe(() => {
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/clients/org-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- ref() ---

  it('ref() makes GET request to /api/clients/ref/', (done: DoneFn) => {
    const refs: OrganizationRef[] = [
      { id: 'org-1', name: 'Acme Corp' },
      { id: 'org-2', name: 'Wayne Enterprises' },
    ];

    service.ref().subscribe(result => {
      expect(result.length).toBe(2);
      expect(result[0].name).toBe('Acme Corp');
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/clients/ref/'));
    expect(req.request.method).toBe('GET');
    req.flush(refs);
  });

  // --- error propagation ---

  it('list() propagates HTTP errors', (done: DoneFn) => {
    service.list().subscribe({
      error: (err: { status: number }) => {
        expect(err.status).toBe(500);
        done();
      },
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/clients/'));
    req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });
  });
});
