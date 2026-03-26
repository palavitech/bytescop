import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardLayoutService } from './dashboard-layout.service';
import { WidgetPlacement } from '../models/dashboard.model';

describe('DashboardLayoutService', () => {
  let service: DashboardLayoutService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DashboardLayoutService,
      ],
    });

    service = TestBed.inject(DashboardLayoutService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- getCatalog ---

  it('getCatalog() makes GET to /api/dashboard/catalog/', () => {
    service.getCatalog().subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('/api/dashboard/catalog/'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ widgets: [] });
  });

  it('getCatalog() passes view param when provided', () => {
    service.getCatalog('analyst').subscribe();

    const req = httpMock.expectOne(r =>
      r.url.endsWith('/api/dashboard/catalog/') && r.params.get('view') === 'analyst',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ widgets: [] });
  });

  // --- getLayout ---

  it('getLayout() makes GET to /api/dashboard/layout/', () => {
    service.getLayout().subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('/api/dashboard/layout/'));
    expect(req.request.method).toBe('GET');
    req.flush({ view: 'default', widgets: [], customized: false });
  });

  it('getLayout() passes view param when provided', () => {
    service.getLayout('collaborator').subscribe();

    const req = httpMock.expectOne(r =>
      r.url.endsWith('/api/dashboard/layout/') && r.params.get('view') === 'collaborator',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ view: 'collaborator', widgets: [], customized: false });
  });

  // --- saveLayout ---

  it('saveLayout() makes PUT to /api/dashboard/layout/ with widgets', () => {
    const widgets: WidgetPlacement[] = [
      { widget_id: 'active_engagements', col: 0, row: 0 },
    ];

    service.saveLayout(widgets).subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('/api/dashboard/layout/'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ widgets });
    req.flush({ view: 'default', widgets, customized: true });
  });

  it('saveLayout() passes view param when provided', () => {
    const widgets: WidgetPlacement[] = [];

    service.saveLayout(widgets, 'analyst').subscribe();

    const req = httpMock.expectOne(r =>
      r.url.endsWith('/api/dashboard/layout/') && r.params.get('view') === 'analyst',
    );
    expect(req.request.method).toBe('PUT');
    req.flush({ view: 'analyst', widgets: [], customized: true });
  });

  // --- resetLayout ---

  it('resetLayout() makes DELETE to /api/dashboard/layout/', () => {
    service.resetLayout().subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('/api/dashboard/layout/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('resetLayout() passes view param when provided', () => {
    service.resetLayout('analyst').subscribe();

    const req = httpMock.expectOne(r =>
      r.url.endsWith('/api/dashboard/layout/') && r.params.get('view') === 'analyst',
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
