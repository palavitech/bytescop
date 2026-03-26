import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, UrlTree } from '@angular/router';
import { PasswordResetGuard } from './password-reset.guard';
import { UserProfileService } from '../profile/user-profile.service';
import { Observable } from 'rxjs';

describe('PasswordResetGuard', () => {
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
    return TestBed.runInInjectionContext(() => PasswordResetGuard({} as any, {} as any)) as Observable<boolean | UrlTree>;
  }

  it('returns true when password reset is not required', (done) => {
    profileService.setFromAuthResponse({
      user: { id: 1, email: 'a@b.com', first_name: 'A', last_name: 'B' },
      password_reset_required: false,
    });

    runGuard().subscribe(result => {
      expect(result).toBe(true);
      done();
    });
  });

  it('redirects to /profile when password reset is required', (done) => {
    profileService.setFromAuthResponse({
      user: { id: 1, email: 'a@b.com', first_name: 'A', last_name: 'B' },
      password_reset_required: true,
    });

    runGuard().subscribe(result => {
      expect(result).toBeInstanceOf(UrlTree);
      expect((result as UrlTree).toString()).toBe('/profile');
      done();
    });
  });

  it('returns true when no profile is set (passwordResetRequired defaults to false)', (done) => {
    runGuard().subscribe(result => {
      expect(result).toBe(true);
      done();
    });
  });
});
