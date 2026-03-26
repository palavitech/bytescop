import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { VersionService } from './version.service';

describe('VersionService', () => {
  let service: VersionService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(VersionService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- uiVersion$ ---

  it('uiVersion$ emits version from assets/version.json', () => {
    let version: string | undefined;
    service.uiVersion$.subscribe(v => version = v);

    const req = httpTesting.expectOne('assets/version.json');
    expect(req.request.method).toBe('GET');
    req.flush({ version: '1.2.3' });

    expect(version).toBe('1.2.3');
  });

  it('uiVersion$ emits "unknown" when request fails', () => {
    let version: string | undefined;
    service.uiVersion$.subscribe(v => version = v);

    httpTesting.expectOne('assets/version.json')
      .flush('Not Found', { status: 404, statusText: 'Not Found' });

    expect(version).toBe('unknown');
  });

  // --- apiVersion$ ---

  it('apiVersion$ emits version from /api/health/', () => {
    let version: string | undefined;
    service.apiVersion$.subscribe(v => version = v);

    const req = httpTesting.expectOne(r => r.url.includes('/api/health/'));
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'ok', version: '0.5.0' });

    expect(version).toBe('0.5.0');
  });

  it('apiVersion$ emits "unknown" when request fails', () => {
    let version: string | undefined;
    service.apiVersion$.subscribe(v => version = v);

    httpTesting.expectOne(r => r.url.includes('/api/health/'))
      .flush('Error', { status: 500, statusText: 'Internal Server Error' });

    expect(version).toBe('unknown');
  });
});
