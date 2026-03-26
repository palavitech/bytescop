import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProfileService } from './profile.service';
import { AvatarResponse, ProfileResponse } from '../models/profile.model';

const MOCK_PROFILE: ProfileResponse = {
  user: {
    id: 'u-1',
    email: 'user@example.com',
    first_name: 'Test',
    last_name: 'User',
    phone: '+1234567890',
    timezone: 'UTC',
    avatar_url: null,
  },
  role: 'MEMBER',
  member_since: '2026-01-01T00:00:00Z',
};

const MOCK_AVATAR: AvatarResponse = {
  avatar_url: '/media/avatars/user.png',
};

describe('ProfileService', () => {
  let service: ProfileService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProfileService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- getProfile ---

  it('getProfile() sends GET to /api/me/profile/', () => {
    service.getProfile().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_PROFILE);
  });

  it('getProfile() returns the profile', () => {
    let result: ProfileResponse | undefined;
    service.getProfile().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/')).flush(MOCK_PROFILE);
    expect(result).toEqual(MOCK_PROFILE);
  });

  // --- updateProfile ---

  it('updateProfile() sends PATCH to /api/me/profile/', () => {
    const payload = { first_name: 'Updated' };
    service.updateProfile(payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_PROFILE);
  });

  it('updateProfile() returns the updated profile', () => {
    let result: ProfileResponse | undefined;
    service.updateProfile({ last_name: 'New' }).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/')).flush(MOCK_PROFILE);
    expect(result).toEqual(MOCK_PROFILE);
  });

  it('updateProfile() sends all fields', () => {
    const payload = { first_name: 'A', last_name: 'B', phone: '+0', timezone: 'US/Eastern' };
    service.updateProfile(payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/'));
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_PROFILE);
  });

  // --- uploadAvatar ---

  it('uploadAvatar() sends multipart POST to /api/me/profile/avatar/', () => {
    const file = new File(['img'], 'avatar.png', { type: 'image/png' });
    let result: AvatarResponse | undefined;
    service.uploadAvatar(file).subscribe(r => (result = r));

    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/avatar/') && r.method === 'POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('avatar')).toBeTruthy();
    req.flush(MOCK_AVATAR);

    expect(result).toEqual(MOCK_AVATAR);
  });

  // --- deleteAvatar ---

  it('deleteAvatar() sends DELETE to /api/me/profile/avatar/', () => {
    service.deleteAvatar().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/me/profile/avatar/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
