import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardService, DashboardResponse } from './dashboard.service';
import { DashboardWidget } from '../models/dashboard.model';

const MOCK_WIDGETS: DashboardWidget[] = [
  {
    id: 'active_engagements',
    title: 'Active Engagements',
    type: 'stat',
    size: 'sm',
    col: 0, row: 0, col_span: 1,
    data: { value: 5 },
  },
  {
    id: 'severity_chart',
    title: 'Severity',
    type: 'chart',
    size: 'md',
    col: 1, row: 0, col_span: 1,
    data: { chart_type: 'doughnut', labels: ['High'], values: [3], colors: ['red'] },
  },
];

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DashboardService,
      ],
    });

    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getDashboard() makes GET request to dashboard endpoint', () => {
    service.getDashboard().subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('/api/dashboard/'));
    expect(req.request.method).toBe('GET');
    req.flush({ widgets: MOCK_WIDGETS, alerts: [] });
  });

  it('getDashboard() extracts widgets array from response', (done: DoneFn) => {
    service.getDashboard().subscribe((resp: DashboardResponse) => {
      expect(resp.widgets).toEqual(MOCK_WIDGETS);
      expect(resp.widgets.length).toBe(2);
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/dashboard/'));
    req.flush({ widgets: MOCK_WIDGETS, alerts: [] });
  });

  it('getDashboard() returns empty arrays when API returns no data', (done: DoneFn) => {
    service.getDashboard().subscribe((resp: DashboardResponse) => {
      expect(resp.widgets).toEqual([]);
      expect(resp.alerts).toEqual([]);
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/dashboard/'));
    req.flush({ widgets: [], alerts: [] });
  });

  it('getDashboard() defaults widgets and alerts to empty arrays when missing', (done: DoneFn) => {
    service.getDashboard().subscribe((resp: DashboardResponse) => {
      expect(resp.widgets).toEqual([]);
      expect(resp.alerts).toEqual([]);
      done();
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/dashboard/'));
    req.flush({} as any);
  });

  it('getDashboard() propagates HTTP errors', (done: DoneFn) => {
    service.getDashboard().subscribe({
      error: (err: { status: number }) => {
        expect(err.status).toBe(500);
        done();
      },
    });

    const req = httpMock.expectOne(r => r.url.endsWith('/api/dashboard/'));
    req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });
  });

  // --- Branch: getDashboard with view parameter ---

  it('getDashboard() passes view param when provided', () => {
    service.getDashboard('analyst').subscribe();

    const req = httpMock.expectOne(r =>
      r.url.endsWith('/api/dashboard/') && r.params.get('view') === 'analyst',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ widgets: [], alerts: [] });
  });
});
