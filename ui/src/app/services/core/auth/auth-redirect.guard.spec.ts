import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthDefaultRedirectGuard } from './auth-redirect.guard';
import { TokenService } from './token.service';

describe('AuthDefaultRedirectGuard', () => {
  let tokens: TokenService;
  let router: Router;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { createUrlTree: jasmine.createSpy('createUrlTree').and.callFake((commands: string[]) => ({ toString: () => commands.join('/') } as any)) } },
      ]
    });
    tokens = TestBed.inject(TokenService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('redirects to /home when authenticated', () => {
    tokens.setAuthenticated();
    TestBed.runInInjectionContext(() => AuthDefaultRedirectGuard({} as any, {} as any));
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });

  it('redirects to /login when not authenticated', () => {
    TestBed.runInInjectionContext(() => AuthDefaultRedirectGuard({} as any, {} as any));
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
