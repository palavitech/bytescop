import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { SecureImagePipe } from './secure-image.pipe';

describe('SecureImagePipe', () => {
  let pipe: SecureImagePipe;
  let httpMock: HttpTestingController;
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SecureImagePipe,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    pipe = TestBed.inject(SecureImagePipe);
    httpMock = TestBed.inject(HttpTestingController);
    sanitizer = TestBed.inject(DomSanitizer);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(pipe).toBeTruthy();
  });

  // --- null / empty input ---

  it('returns null observable when url is null', (done: DoneFn) => {
    pipe.transform(null).subscribe(result => {
      expect(result).toBeNull();
      done();
    });
  });

  it('returns null observable when url is empty string', (done: DoneFn) => {
    pipe.transform('' as any).subscribe(result => {
      expect(result).toBeNull();
      done();
    });
  });

  // --- successful image fetch ---

  it('fetches image as blob and returns sanitized URL', (done: DoneFn) => {
    const fakeBlob = new Blob(['fake-image-data'], { type: 'image/png' });

    pipe.transform('https://api.example.com/image.png').subscribe(result => {
      expect(result).not.toBeNull();
      done();
    });

    const req = httpMock.expectOne('https://api.example.com/image.png');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(fakeBlob);
  });

  // --- error handling ---

  it('returns null on HTTP error', (done: DoneFn) => {
    pipe.transform('https://api.example.com/missing.png').subscribe(result => {
      expect(result).toBeNull();
      done();
    });

    const req = httpMock.expectOne('https://api.example.com/missing.png');
    req.error(new ProgressEvent('error'), { status: 404, statusText: 'Not Found' });
  });

  it('returns null on network error', (done: DoneFn) => {
    pipe.transform('https://api.example.com/broken.png').subscribe(result => {
      expect(result).toBeNull();
      done();
    });

    const req = httpMock.expectOne('https://api.example.com/broken.png');
    req.error(new ProgressEvent('error'));
  });
});
