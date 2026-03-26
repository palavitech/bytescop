import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  MfaService,
  MfaVerifyResponse,
  MfaSetupResponse,
  MfaStatusResponse,
  MfaEnrollResponse,
  MfaReEnrollResponse,
} from './mfa.service';

const MOCK_VERIFY: MfaVerifyResponse = {
  user: { id: 'u-1', email: 'user@test.com' },
  tenant: { id: 't-1', slug: 'acme' },
  authorization: { permissions: [] },
  subscription: null,
  password_reset_required: false,
  password_reset_reason: null,
};

const MOCK_SETUP: MfaSetupResponse = {
  secret: 'JBSWY3DPEHPK3PXP',
  qr_code: 'data:image/png;base64,abc',
  backup_codes: ['code1', 'code2', 'code3'],
  mfa_token: 'mfa-tok-1',
};

const MOCK_STATUS: MfaStatusResponse = {
  mfa_enabled: true,
  mfa_enrolled_at: '2026-01-01T00:00:00Z',
  mfa_required: false,
  backup_codes_remaining: 5,
  policy: {
    required_all: false,
    required_for_owners: true,
    required_for_admins: false,
  },
};

const MOCK_ENROLL: MfaEnrollResponse = {
  secret: 'JBSWY3DPEHPK3PXP',
  qr_code: 'data:image/png;base64,xyz',
  backup_codes: ['a', 'b', 'c'],
};

const MOCK_RE_ENROLL: MfaReEnrollResponse = {
  secret: 'NEWSECRET',
  qr_code: 'data:image/png;base64,new',
  backup_codes: ['x', 'y'],
  re_enroll_token: 're-tok-1',
};

describe('MfaService', () => {
  let service: MfaService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MfaService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- verify ---

  it('verify() sends POST to /api/auth/mfa/verify/', () => {
    service.verify('mfa-tok', '123456', false).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/auth/mfa/verify/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ mfa_token: 'mfa-tok', code: '123456', remember: false });
    req.flush(MOCK_VERIFY);
  });

  it('verify() returns the verify response', () => {
    let result: MfaVerifyResponse | undefined;
    service.verify('tok', '000000', false).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/auth/mfa/verify/')).flush(MOCK_VERIFY);
    expect(result).toEqual(MOCK_VERIFY);
  });

  // --- setup ---

  it('setup() sends POST to /api/auth/mfa/setup/', () => {
    service.setup('mfa-tok').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/auth/mfa/setup/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ mfa_token: 'mfa-tok' });
    req.flush(MOCK_SETUP);
  });

  it('setup() returns the setup response', () => {
    let result: MfaSetupResponse | undefined;
    service.setup('tok').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/auth/mfa/setup/')).flush(MOCK_SETUP);
    expect(result).toEqual(MOCK_SETUP);
  });

  // --- setupConfirm ---

  it('setupConfirm() sends POST to /api/auth/mfa/setup/confirm/', () => {
    service.setupConfirm('mfa-tok', '123456', false).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/auth/mfa/setup/confirm/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ mfa_token: 'mfa-tok', code: '123456', remember: false });
    req.flush(MOCK_VERIFY);
  });

  it('setupConfirm() returns the verify response', () => {
    let result: MfaVerifyResponse | undefined;
    service.setupConfirm('tok', '000000', false).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/auth/mfa/setup/confirm/')).flush(MOCK_VERIFY);
    expect(result).toEqual(MOCK_VERIFY);
  });

  // --- getStatus ---

  it('getStatus() sends GET to /api/me/mfa/status/', () => {
    service.getStatus().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/status/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_STATUS);
  });

  it('getStatus() returns the status', () => {
    let result: MfaStatusResponse | undefined;
    service.getStatus().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/status/')).flush(MOCK_STATUS);
    expect(result).toEqual(MOCK_STATUS);
  });

  // --- enroll ---

  it('enroll() sends POST to /api/me/mfa/enroll/', () => {
    service.enroll().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/enroll/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(MOCK_ENROLL);
  });

  it('enroll() returns the enroll response', () => {
    let result: MfaEnrollResponse | undefined;
    service.enroll().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/enroll/')).flush(MOCK_ENROLL);
    expect(result).toEqual(MOCK_ENROLL);
  });

  // --- enrollConfirm ---

  it('enrollConfirm() sends POST to /api/me/mfa/enroll/confirm/', () => {
    service.enrollConfirm('654321').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/enroll/confirm/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: '654321' });
    req.flush({ detail: 'MFA enabled' });
  });

  it('enrollConfirm() returns the response with optional tokens', () => {
    let result: { detail: string; access?: string; refresh?: string } | undefined;
    service.enrollConfirm('000000').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/enroll/confirm/')).flush({
      detail: 'MFA enabled',
      access: 'new-access',
      refresh: 'new-refresh',
    });
    expect(result?.detail).toBe('MFA enabled');
    expect(result?.access).toBe('new-access');
    expect(result?.refresh).toBe('new-refresh');
  });

  // --- disable ---

  it('disable() sends POST to /api/me/mfa/disable/', () => {
    service.disable('123456').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/disable/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: '123456' });
    req.flush({ detail: 'MFA disabled' });
  });

  it('disable() returns the response', () => {
    let result: { detail: string } | undefined;
    service.disable('000000').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/disable/')).flush({ detail: 'ok' });
    expect(result).toEqual({ detail: 'ok' });
  });

  // --- regenerateBackupCodes ---

  it('regenerateBackupCodes() sends POST to /api/me/mfa/regenerate-backup-codes/', () => {
    service.regenerateBackupCodes('123456').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/regenerate-backup-codes/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: '123456' });
    req.flush({ backup_codes: ['new1', 'new2'] });
  });

  it('regenerateBackupCodes() returns the backup codes', () => {
    let result: { backup_codes: string[] } | undefined;
    service.regenerateBackupCodes('000000').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/regenerate-backup-codes/')).flush({ backup_codes: ['a'] });
    expect(result).toEqual({ backup_codes: ['a'] });
  });

  // --- reEnroll ---

  it('reEnroll() sends POST to /api/me/mfa/re-enroll/', () => {
    service.reEnroll('123456').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/re-enroll/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: '123456' });
    req.flush(MOCK_RE_ENROLL);
  });

  it('reEnroll() returns the re-enroll response', () => {
    let result: MfaReEnrollResponse | undefined;
    service.reEnroll('000000').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/re-enroll/')).flush(MOCK_RE_ENROLL);
    expect(result).toEqual(MOCK_RE_ENROLL);
  });

  // --- reEnrollConfirm ---

  it('reEnrollConfirm() sends POST to /api/me/mfa/re-enroll/confirm/', () => {
    service.reEnrollConfirm('654321', 're-tok-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/re-enroll/confirm/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: '654321', re_enroll_token: 're-tok-1' });
    req.flush({ detail: 'Re-enrolled' });
  });

  it('reEnrollConfirm() returns the response', () => {
    let result: { detail: string } | undefined;
    service.reEnrollConfirm('000', 'tok').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/mfa/re-enroll/confirm/')).flush({ detail: 'ok' });
    expect(result).toEqual({ detail: 'ok' });
  });

  // --- resetMfa (admin) ---

  it('resetMfa() sends POST to /api/authorization/members/:id/reset-mfa/', () => {
    service.resetMfa('m-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-1/reset-mfa/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ detail: 'MFA reset' });
  });

  it('resetMfa() returns the response', () => {
    let result: { detail: string } | undefined;
    service.resetMfa('m-2').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/m-2/reset-mfa/')).flush({ detail: 'ok' });
    expect(result).toEqual({ detail: 'ok' });
  });
});
