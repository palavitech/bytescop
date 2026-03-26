import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, UrlTree } from '@angular/router';
import { MfaSetupGuard } from './mfa-setup.guard';
import { UserProfileService } from '../profile/user-profile.service';
import { Observable } from 'rxjs';

describe('MfaSetupGuard', () => {
  let profileService: UserProfileService;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
    profileService = TestBed.inject(UserProfileService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  function runGuard(): Observable<boolean | UrlTree> {
    return TestBed.runInInjectionContext(() => MfaSetupGuard({} as any, {} as any)) as Observable<boolean | UrlTree>;
  }

  it('returns true when MFA setup is not required', (done) => {
    // Default profile has mfaSetupRequired = false
    profileService.setFromAuthResponse({
      user: { id: 1, email: 'a@b.com', first_name: 'A', last_name: 'B' },
      mfa_setup_required: false,
    });

    runGuard().subscribe(result => {
      expect(result).toBe(true);
      done();
    });
  });

  it('redirects to /mfa/setup when MFA setup is required', (done) => {
    profileService.setFromAuthResponse({
      user: { id: 1, email: 'a@b.com', first_name: 'A', last_name: 'B' },
      mfa_setup_required: true,
    });

    runGuard().subscribe(result => {
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/mfa/setup');
      done();
    });
  });

  it('returns true when no profile is set (mfaSetupRequired defaults to false)', (done) => {
    runGuard().subscribe(result => {
      expect(result).toBe(true);
      done();
    });
  });
});
