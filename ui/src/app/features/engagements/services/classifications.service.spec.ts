import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClassificationsService } from './classifications.service';
import { ClassificationEntry } from '../models/classification-data';

const MOCK_AREAS: ClassificationEntry[] = [
  { code: 'app_sec', name: 'Application Security', description: 'App sec testing' },
  { code: 'net_sec', name: 'Network Security', description: 'Net sec testing' },
];

const MOCK_OWASP: ClassificationEntry[] = [
  { code: 'A01', name: 'Broken Access Control', description: 'BAC desc' },
];

const MOCK_CWE: ClassificationEntry[] = [
  { code: 'CWE-79', name: 'Cross-site Scripting', description: 'XSS desc' },
  { code: 'CWE-89', name: 'SQL Injection', description: 'SQLi desc' },
];

describe('ClassificationsService', () => {
  let service: ClassificationsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClassificationsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- assessmentAreas$ ---

  it('assessmentAreas$ fetches with type=assessment_area', () => {
    service.assessmentAreas$.subscribe();
    const req = httpTesting.expectOne(r =>
      r.url.includes('/api/classifications/') && r.params.get('type') === 'assessment_area',
    );
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_AREAS);
  });

  it('assessmentAreas$ returns the entries', () => {
    let result: ClassificationEntry[] | undefined;
    service.assessmentAreas$.subscribe(r => (result = r));
    httpTesting.expectOne(r => r.params.get('type') === 'assessment_area').flush(MOCK_AREAS);
    expect(result).toEqual(MOCK_AREAS);
  });

  // --- owaspCategories$ ---

  it('owaspCategories$ fetches with type=owasp', () => {
    service.owaspCategories$.subscribe();
    const req = httpTesting.expectOne(r =>
      r.url.includes('/api/classifications/') && r.params.get('type') === 'owasp',
    );
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_OWASP);
  });

  it('owaspCategories$ returns the entries', () => {
    let result: ClassificationEntry[] | undefined;
    service.owaspCategories$.subscribe(r => (result = r));
    httpTesting.expectOne(r => r.params.get('type') === 'owasp').flush(MOCK_OWASP);
    expect(result).toEqual(MOCK_OWASP);
  });

  // --- cweEntries$ ---

  it('cweEntries$ fetches with type=cwe', () => {
    service.cweEntries$.subscribe();
    const req = httpTesting.expectOne(r =>
      r.url.includes('/api/classifications/') && r.params.get('type') === 'cwe',
    );
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_CWE);
  });

  it('cweEntries$ returns the entries', () => {
    let result: ClassificationEntry[] | undefined;
    service.cweEntries$.subscribe(r => (result = r));
    httpTesting.expectOne(r => r.params.get('type') === 'cwe').flush(MOCK_CWE);
    expect(result).toEqual(MOCK_CWE);
  });

  // --- assessmentAreaMap$ ---

  it('assessmentAreaMap$ creates a Map keyed by code', () => {
    let result: Map<string, ClassificationEntry> | undefined;
    service.assessmentAreaMap$.subscribe(r => (result = r));
    httpTesting.expectOne(r => r.params.get('type') === 'assessment_area').flush(MOCK_AREAS);
    expect(result).toBeDefined();
    expect(result!.get('app_sec')).toEqual(MOCK_AREAS[0]);
    expect(result!.get('net_sec')).toEqual(MOCK_AREAS[1]);
    expect(result!.has('nonexistent')).toBe(false);
  });

  // --- owaspMap$ ---

  it('owaspMap$ creates a Map keyed by code', () => {
    let result: Map<string, ClassificationEntry> | undefined;
    service.owaspMap$.subscribe(r => (result = r));
    httpTesting.expectOne(r => r.params.get('type') === 'owasp').flush(MOCK_OWASP);
    expect(result).toBeDefined();
    expect(result!.get('A01')).toEqual(MOCK_OWASP[0]);
  });

  // --- cweMap$ ---

  it('cweMap$ creates a Map keyed by code', () => {
    let result: Map<string, ClassificationEntry> | undefined;
    service.cweMap$.subscribe(r => (result = r));
    httpTesting.expectOne(r => r.params.get('type') === 'cwe').flush(MOCK_CWE);
    expect(result).toBeDefined();
    expect(result!.get('CWE-79')).toEqual(MOCK_CWE[0]);
    expect(result!.get('CWE-89')).toEqual(MOCK_CWE[1]);
  });

  // --- shareReplay caching ---

  it('assessmentAreas$ shares the same HTTP request across multiple subscribers', () => {
    service.assessmentAreas$.subscribe();
    service.assessmentAreas$.subscribe();
    // Only one HTTP request should be made
    const reqs = httpTesting.match(r => r.params.get('type') === 'assessment_area');
    expect(reqs.length).toBe(1);
    reqs[0].flush(MOCK_AREAS);
  });

  it('cweEntries$ shares the same HTTP request across multiple subscribers', () => {
    service.cweEntries$.subscribe();
    service.cweEntries$.subscribe();
    const reqs = httpTesting.match(r => r.params.get('type') === 'cwe');
    expect(reqs.length).toBe(1);
    reqs[0].flush(MOCK_CWE);
  });
});
