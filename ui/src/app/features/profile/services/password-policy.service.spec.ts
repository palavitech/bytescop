import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PasswordPolicyService, PasswordPolicy } from './password-policy.service';

const MOCK_POLICY: PasswordPolicy = {
  min_length: 12,
  require_uppercase: true,
  require_special: true,
  require_number: true,
  expiry_days: 90,
};

describe('PasswordPolicyService', () => {
  let service: PasswordPolicyService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PasswordPolicyService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- getPolicy ---

  it('getPolicy() sends GET to /api/me/password-policy/', () => {
    service.getPolicy().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/password-policy/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_POLICY);
  });

  it('getPolicy() returns the policy', () => {
    let result: PasswordPolicy | undefined;
    service.getPolicy().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/password-policy/')).flush(MOCK_POLICY);
    expect(result).toEqual(MOCK_POLICY);
  });

  // --- changePassword ---

  it('changePassword() sends POST to /api/me/profile/password/', () => {
    service.changePassword('oldPass', 'newPass').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/password/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      current_password: 'oldPass',
      new_password: 'newPass',
    });
    req.flush({ detail: 'Password changed' });
  });

  it('changePassword() returns the response', () => {
    let result: { detail: string } | undefined;
    service.changePassword('old', 'new').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/password/')).flush({ detail: 'ok' });
    expect(result).toEqual({ detail: 'ok' });
  });

  it('changePassword() includes mfa_code when provided', () => {
    service.changePassword('old', 'new', '123456').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/password/'));
    expect(req.request.body).toEqual({
      current_password: 'old',
      new_password: 'new',
      mfa_code: '123456',
    });
    req.flush({ detail: 'ok' });
  });

  it('changePassword() does not include mfa_code when not provided', () => {
    service.changePassword('old', 'new').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/password/'));
    expect(req.request.body).toEqual({
      current_password: 'old',
      new_password: 'new',
    });
    expect(req.request.body.mfa_code).toBeUndefined();
    req.flush({ detail: 'ok' });
  });

  it('changePassword() does not include mfa_code when empty string', () => {
    service.changePassword('old', 'new', '').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/password/'));
    // Empty string is falsy, so mfa_code should not be included
    expect(req.request.body.mfa_code).toBeUndefined();
    req.flush({ detail: 'ok' });
  });
});
