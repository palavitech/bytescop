import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RequireAuthGuard, RequireAuthChildGuard } from './auth-gate.guard';
import { TokenService } from './token.service';

describe('RequireAuthGuard', () => {
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

  it('returns true when access token is present', () => {
    tokens.setAuthenticated();
    const result = TestBed.runInInjectionContext(() => RequireAuthGuard({} as any, {} as any));
    expect(result).toBe(true);
  });

  it('returns UrlTree to /login when no access token', () => {
    const result = TestBed.runInInjectionContext(() => RequireAuthGuard({} as any, {} as any));
    expect(result).not.toBe(true);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});

describe('RequireAuthChildGuard', () => {
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

  it('returns true when access token is present', () => {
    tokens.setAuthenticated();
    const result = TestBed.runInInjectionContext(() => RequireAuthChildGuard({} as any, {} as any));
    expect(result).toBe(true);
  });

  it('returns UrlTree to /login when no access token', () => {
    const result = TestBed.runInInjectionContext(() => RequireAuthChildGuard({} as any, {} as any));
    expect(result).not.toBe(true);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});
