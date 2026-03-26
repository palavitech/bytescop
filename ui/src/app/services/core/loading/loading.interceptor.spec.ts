import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { loadingInterceptor } from './loading.interceptor';
import { LoadingService } from './loading.service';

describe('loadingInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let loading: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([loadingInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    loading = TestBed.inject(LoadingService);
  });

  afterEach(() => httpTesting.verify());

  it('calls start() before the request and stop() after completion', () => {
    spyOn(loading, 'start').and.callThrough();
    spyOn(loading, 'stop').and.callThrough();

    http.get('/api/test').subscribe();

    expect(loading.start).toHaveBeenCalledTimes(1);
    expect(loading.stop).not.toHaveBeenCalled();

    httpTesting.expectOne('/api/test').flush({ ok: true });

    expect(loading.stop).toHaveBeenCalledTimes(1);
  });
});
