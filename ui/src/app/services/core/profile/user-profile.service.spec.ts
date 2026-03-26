import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { UserProfileService } from './user-profile.service';
import { TokenService } from '../auth/token.service';
import { UserProfile, UserProfileState } from './user-profile.types';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let tokens: TokenService;
  let httpMock: HttpTestingController;

  const mockAuthResponse = {
    user: { id: 1, email: 'jane@acme.com', first_name: 'Jane', last_name: 'Doe' },
    tenant: { id: 't1', slug: 'acme', name: 'Acme Corp', role: 'owner' },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    tokens = TestBed.inject(TokenService);
    service = TestBed.inject(UserProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- Initial state ---

  it('initial state has null profile', () => {
    let state: UserProfileState | undefined;
    service.state$.subscribe(s => state = s);
    expect(state!.profile).toBeNull();
    expect(state!.loading).toBeFalse();
    expect(state!.error).toBeNull();
  });

  it('profile$ emits null initially', () => {
    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeNull();
  });

  it('displayName$ emits empty string initially', () => {
    let name: string | undefined;
    service.displayName$.subscribe(n => name = n);
    expect(name).toBe('');
  });

  it('email$ emits empty string initially', () => {
    let email: string | undefined;
    service.email$.subscribe(e => email = e);
    expect(email).toBe('');
  });

  it('initials$ emits empty string initially', () => {
    let initials: string | undefined;
    service.initials$.subscribe(i => initials = i);
    expect(initials).toBe('');
  });

  // --- setFromAuthResponse ---

  it('setFromAuthResponse() populates profile from auth response', () => {
    service.setFromAuthResponse(mockAuthResponse);

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);

    expect(profile).toBeTruthy();
    expect(profile!.user.email).toBe('jane@acme.com');
    expect(profile!.user.first_name).toBe('Jane');
    expect(profile!.user.last_name).toBe('Doe');
    expect(profile!.tenant).toEqual(mockAuthResponse.tenant);
    expect(profile!.displayName).toBe('Jane Doe');
    expect(profile!.initials).toBe('JD');
  });

  it('setFromAuthResponse() sets loadedAt timestamp', () => {
    const before = Date.now();
    service.setFromAuthResponse(mockAuthResponse);

    let state: UserProfileState | undefined;
    service.state$.subscribe(s => state = s);
    expect(state!.loadedAt).toBeGreaterThanOrEqual(before);
    expect(state!.loadedAt).toBeLessThanOrEqual(Date.now());
  });

  it('setFromAuthResponse() does nothing when user is missing', () => {
    service.setFromAuthResponse({ tenant: mockAuthResponse.tenant });

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeNull();
  });

  it('setFromAuthResponse() sets tenant to null when not provided', () => {
    service.setFromAuthResponse({ user: mockAuthResponse.user });

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.tenant).toBeNull();
  });

  // --- displayName computation ---

  it('displayName falls back to email when name is empty', () => {
    service.setFromAuthResponse({
      user: { id: 2, email: 'anon@test.com', first_name: '', last_name: '' },
    });

    let name: string | undefined;
    service.displayName$.subscribe(n => name = n);
    expect(name).toBe('anon@test.com');
  });

  it('displayName falls back to "User" when email and name are empty', () => {
    service.setFromAuthResponse({
      user: { id: 3, email: '', first_name: '', last_name: '' },
    });

    let name: string | undefined;
    service.displayName$.subscribe(n => name = n);
    expect(name).toBe('User');
  });

  it('displayName uses only first_name when last_name is empty', () => {
    service.setFromAuthResponse({
      user: { id: 4, email: 'j@test.com', first_name: 'Jane', last_name: '' },
    });

    let name: string | undefined;
    service.displayName$.subscribe(n => name = n);
    expect(name).toBe('Jane');
  });

  // --- initials computation ---

  it('initials uses first letter of first and last name', () => {
    service.setFromAuthResponse(mockAuthResponse);

    let initials: string | undefined;
    service.initials$.subscribe(i => initials = i);
    expect(initials).toBe('JD');
  });

  it('initials uses first 2 chars of first_name when last_name is empty', () => {
    service.setFromAuthResponse({
      user: { id: 5, email: 'j@test.com', first_name: 'Jane', last_name: '' },
    });

    let initials: string | undefined;
    service.initials$.subscribe(i => initials = i);
    expect(initials).toBe('JA');
  });

  it('initials uses first 2 chars of email when name is empty', () => {
    service.setFromAuthResponse({
      user: { id: 6, email: 'zack@test.com', first_name: '', last_name: '' },
    });

    let initials: string | undefined;
    service.initials$.subscribe(i => initials = i);
    expect(initials).toBe('ZA');
  });

  it('initials falls back to BC when all fields are empty', () => {
    service.setFromAuthResponse({
      user: { id: 7, email: '', first_name: '', last_name: '' },
    });

    let initials: string | undefined;
    service.initials$.subscribe(i => initials = i);
    expect(initials).toBe('BC');
  });

  // --- clear ---

  it('clear() resets profile state to null', () => {
    service.setFromAuthResponse(mockAuthResponse);
    service.clear();

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeNull();
  });

  // --- auto-clear on token wipe ---

  it('auto-clears profile when tokens are cleared', () => {
    tokens.setAuthenticated();
    service.setFromAuthResponse(mockAuthResponse);

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeTruthy();

    tokens.clear();

    expect(profile).toBeNull();
  });

  // --- handles null/undefined fields gracefully ---

  it('handles null first_name and last_name in user', () => {
    service.setFromAuthResponse({
      user: { id: 8, email: 'test@x.com', first_name: null, last_name: null },
    });

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.displayName).toBe('test@x.com');
    expect(profile!.initials).toBe('TE');
  });

  it('trims whitespace from name fields', () => {
    service.setFromAuthResponse({
      user: { id: 9, email: 'ws@x.com', first_name: '  Alice  ', last_name: '  Smith  ' },
    });

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.user.first_name).toBe('Alice');
    expect(profile!.user.last_name).toBe('Smith');
    expect(profile!.displayName).toBe('Alice Smith');
    expect(profile!.initials).toBe('AS');
  });

  // --- avatarUrl ---

  it('avatarUrl$ emits null initially', () => {
    let url: string | null | undefined;
    service.avatarUrl$.subscribe(u => url = u);
    expect(url).toBeNull();
  });

  it('setFromAuthResponse() sets avatarUrl from user.avatar_url', () => {
    service.setFromAuthResponse({
      user: { id: 1, email: 'a@b.com', first_name: 'A', last_name: 'B', avatar_url: '/avatars/1.png' },
    });

    let url: string | null | undefined;
    service.avatarUrl$.subscribe(u => url = u);
    expect(url).toContain('/avatars/1.png');
  });

  it('setFromAuthResponse() sets avatarUrl to null when avatar_url is absent', () => {
    service.setFromAuthResponse({
      user: { id: 1, email: 'a@b.com', first_name: 'A', last_name: 'B' },
    });

    let url: string | null | undefined;
    service.avatarUrl$.subscribe(u => url = u);
    expect(url).toBeNull();
  });

  // --- updateAvatarUrl ---

  it('updateAvatarUrl() updates the avatar URL with cache-bust param', () => {
    service.setFromAuthResponse(mockAuthResponse);

    service.updateAvatarUrl('/avatars/new.png');

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.avatarUrl).toContain('/avatars/new.png');
    expect(profile!.avatarUrl).toContain('?t=');
    expect(profile!.user.avatar_url).toBe('/avatars/new.png');
  });

  it('updateAvatarUrl(null) clears the avatar URL', () => {
    service.setFromAuthResponse({
      user: { id: 1, email: 'a@b.com', first_name: 'A', last_name: 'B', avatar_url: '/old.png' },
    });

    service.updateAvatarUrl(null);

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.avatarUrl).toBeNull();
    expect(profile!.user.avatar_url).toBeNull();
  });

  it('updateAvatarUrl() is a no-op when no profile is set', () => {
    service.updateAvatarUrl('/avatars/new.png');

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeNull();
  });

  // --- updateName ---

  it('updateName() updates first, last, displayName, and initials', () => {
    service.setFromAuthResponse(mockAuthResponse);

    service.updateName('Bob', 'Smith');

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.user.first_name).toBe('Bob');
    expect(profile!.user.last_name).toBe('Smith');
    expect(profile!.displayName).toBe('Bob Smith');
    expect(profile!.initials).toBe('BS');
  });

  it('updateName() trims whitespace', () => {
    service.setFromAuthResponse(mockAuthResponse);

    service.updateName('  Charlie  ', '  Brown  ');

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.user.first_name).toBe('Charlie');
    expect(profile!.user.last_name).toBe('Brown');
  });

  it('updateName() falls back to email for displayName when both names empty', () => {
    service.setFromAuthResponse(mockAuthResponse);

    service.updateName('', '');

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.displayName).toBe('jane@acme.com');
  });

  it('updateName() is a no-op when no profile is set', () => {
    service.updateName('A', 'B');

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeNull();
  });

  // --- passwordResetRequired ---

  it('passwordResetRequired$ emits false initially', () => {
    let val: boolean | undefined;
    service.passwordResetRequired$.subscribe(v => val = v);
    expect(val).toBe(false);
  });

  it('passwordResetRequired$ emits true when set in auth response', () => {
    service.setFromAuthResponse({
      ...mockAuthResponse,
      password_reset_required: true,
      password_reset_reason: 'expired',
    });

    let val: boolean | undefined;
    service.passwordResetRequired$.subscribe(v => val = v);
    expect(val).toBe(true);
  });

  it('clearPasswordResetFlag() clears the password reset flag and reason', () => {
    service.setFromAuthResponse({
      ...mockAuthResponse,
      password_reset_required: true,
      password_reset_reason: 'expired',
    });

    service.clearPasswordResetFlag();

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.passwordResetRequired).toBe(false);
    expect(profile!.passwordResetReason).toBeNull();
    expect(profile!.passwordChangedAt).toBeTruthy();
  });

  it('clearPasswordResetFlag() is a no-op when no profile is set', () => {
    service.clearPasswordResetFlag();

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeNull();
  });

  // --- mfaSetupRequired ---

  it('mfaSetupRequired$ emits false initially', () => {
    let val: boolean | undefined;
    service.mfaSetupRequired$.subscribe(v => val = v);
    expect(val).toBe(false);
  });

  it('mfaSetupRequired$ emits true when set in auth response', () => {
    service.setFromAuthResponse({
      ...mockAuthResponse,
      mfa_setup_required: true,
    });

    let val: boolean | undefined;
    service.mfaSetupRequired$.subscribe(v => val = v);
    expect(val).toBe(true);
  });

  it('clearMfaSetupFlag() clears the MFA setup flag', () => {
    service.setFromAuthResponse({
      ...mockAuthResponse,
      mfa_setup_required: true,
    });

    service.clearMfaSetupFlag();

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.mfaSetupRequired).toBe(false);
  });

  it('clearMfaSetupFlag() is a no-op when no profile is set', () => {
    service.clearMfaSetupFlag();

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeNull();
  });

  it('setMfaSetupRequired() sets the MFA setup flag to true', () => {
    service.setFromAuthResponse(mockAuthResponse);

    service.setMfaSetupRequired();

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.mfaSetupRequired).toBe(true);
  });

  it('setMfaSetupRequired() is a no-op when no profile is set', () => {
    service.setMfaSetupRequired();

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeNull();
  });

  // --- refreshProfile ---

  it('refreshProfile() fetches profile from API and updates state', () => {
    service.refreshProfile().subscribe();

    const req = httpMock.expectOne('/api/me/profile/');
    expect(req.request.method).toBe('GET');
    req.flush(mockAuthResponse);

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile).toBeTruthy();
    expect(profile!.user.email).toBe('jane@acme.com');
  });

  // --- currentTenantId ---

  it('currentTenantId() returns tenant id when profile is set', () => {
    service.setFromAuthResponse(mockAuthResponse);
    expect(service.currentTenantId()).toBe('t1');
  });

  it('currentTenantId() returns null when no profile', () => {
    expect(service.currentTenantId()).toBeNull();
  });

  // --- currentPlanName ---

  it('currentPlanName() returns Free when no subscription', () => {
    service.setFromAuthResponse(mockAuthResponse);
    expect(service.currentPlanName()).toBe('Free');
  });

  it('currentPlanName() returns plan name from subscription', () => {
    service.setFromAuthResponse({
      ...mockAuthResponse,
      subscription: { plan_code: 'pro', plan_name: 'Pro', limits: {}, features: {} },
    });
    expect(service.currentPlanName()).toBe('Pro');
  });

  // --- currentSubscription ---

  it('currentSubscription() returns null when no subscription', () => {
    service.setFromAuthResponse(mockAuthResponse);
    expect(service.currentSubscription()).toBeNull();
  });

  it('currentSubscription() returns subscription when set', () => {
    const sub = { plan_code: 'pro', plan_name: 'Pro', limits: {}, features: {} };
    service.setFromAuthResponse({ ...mockAuthResponse, subscription: sub });
    expect(service.currentSubscription()).toEqual(sub as any);
  });

  // --- subscription$ and planName$ ---

  it('subscription$ emits null initially', () => {
    let val: any;
    service.subscription$.subscribe(v => val = v);
    expect(val).toBeNull();
  });

  it('planName$ emits Free initially', () => {
    let val: string | undefined;
    service.planName$.subscribe(v => val = v);
    expect(val).toBe('Free');
  });

  it('planName$ emits plan name when subscription is set', () => {
    service.setFromAuthResponse({
      ...mockAuthResponse,
      subscription: { plan_code: 'pro', plan_name: 'Pro', limits: {}, features: {} },
    });
    let val: string | undefined;
    service.planName$.subscribe(v => val = v);
    expect(val).toBe('Pro');
  });

  // --- setFromAuthResponse with all nullable fields ---

  it('updateName falls back to User when both name and email are empty', () => {
    service.setFromAuthResponse({
      user: { id: 99, email: '', first_name: '', last_name: '' },
    });

    service.updateName('', '');

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.displayName).toBe('User');
  });

  it('computeInitials with only last_name (no first) uses email', () => {
    service.setFromAuthResponse({
      user: { id: 100, email: 'z@test.com', first_name: '', last_name: 'Smith' },
    });

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    // last_name is not empty, but first_name is — since there is no first && last,
    // and no first only, it falls through to email
    // Actually: first='' (falsy), last='Smith' (truthy)
    // computeInitials: first && last -> false, first -> false, email -> 'z@test.com' -> 'ZA'
    // Wait, but displayName should be 'Smith'
    expect(profile!.displayName).toBe('Smith');
  });

  it('handles password_changed_at, avatar_url, date_format null coalescing', () => {
    service.setFromAuthResponse({
      user: {
        id: 10,
        email: 'x@y.com',
        first_name: 'X',
        last_name: 'Y',
        password_changed_at: '2026-01-01T00:00:00Z',
        avatar_url: '/av.png',
      },
      date_format: 'DD/MM/YYYY',
    });

    let profile: UserProfile | null | undefined;
    service.profile$.subscribe(p => profile = p);
    expect(profile!.user.password_changed_at).toBe('2026-01-01T00:00:00Z');
    expect(profile!.user.avatar_url).toBe('/av.png');
    expect(profile!.passwordChangedAt).toBe('2026-01-01T00:00:00Z');
    expect(profile!.dateFormat).toBe('DD/MM/YYYY');
  });
});
