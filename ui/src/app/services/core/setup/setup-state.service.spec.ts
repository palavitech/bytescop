import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SetupStateService, SetupProbe } from './setup-state.service';

describe('SetupStateService', () => {
  let service: SetupStateService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SetupStateService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('initial probe is loading with null setupRequired', () => {
    const probe = service.probeSnapshot;
    expect(probe.status).toBe('loading');
    expect(probe.setupRequired).toBeNull();
  });

  it('probe$ emits the initial state', (done) => {
    service.probe$.subscribe(p => {
      expect(p.status).toBe('loading');
      done();
    });
  });

  // --- refresh ---

  it('refresh() sets status=ok and setupRequired=true when API says setup_required=true', async () => {
    const promise = service.refresh();

    const req = httpTesting.expectOne(r => r.url.includes('/api/setup/status/'));
    expect(req.request.method).toBe('GET');
    req.flush({ setup_required: true });

    await promise;

    expect(service.probeSnapshot.status).toBe('ok');
    expect(service.probeSnapshot.setupRequired).toBe(true);
  });

  it('refresh() sets status=ok and setupRequired=false when API says setup_required=false', async () => {
    const promise = service.refresh();

    const req = httpTesting.expectOne(r => r.url.includes('/api/setup/status/'));
    req.flush({ setup_required: false });

    await promise;

    expect(service.probeSnapshot.status).toBe('ok');
    expect(service.probeSnapshot.setupRequired).toBe(false);
  });

  it('refresh() sets status=unreachable when HTTP request fails', async () => {
    const promise = service.refresh();

    const req = httpTesting.expectOne(r => r.url.includes('/api/setup/status/'));
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Network Error' });

    await promise;

    expect(service.probeSnapshot.status).toBe('unreachable');
    expect(service.probeSnapshot.setupRequired).toBeNull();
  });

  // --- markSetupComplete ---

  it('markSetupComplete() sets status=ok and setupRequired=false', () => {
    service.markSetupComplete();
    expect(service.probeSnapshot.status).toBe('ok');
    expect(service.probeSnapshot.setupRequired).toBe(false);
  });

  it('markSetupComplete() emits via probe$', (done) => {
    const values: SetupProbe[] = [];
    service.probe$.subscribe(p => {
      values.push(p);
      if (values.length === 2) {
        expect(values[1].status).toBe('ok');
        expect(values[1].setupRequired).toBe(false);
        done();
      }
    });
    service.markSetupComplete();
  });

  // --- probeSnapshot ---

  it('probeSnapshot reflects latest state after refresh', async () => {
    const promise = service.refresh();
    httpTesting.expectOne(r => r.url.includes('/api/setup/status/')).flush({ setup_required: true });
    await promise;

    expect(service.probeSnapshot.status).toBe('ok');

    service.markSetupComplete();
    expect(service.probeSnapshot.setupRequired).toBe(false);
  });
});
