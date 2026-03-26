import { TestBed } from '@angular/core/testing';
import { TokenService, TokenState } from './token.service';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TokenService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('isAuthenticated() returns false initially', () => {
    expect(service.isAuthenticated()).toBe(false);
  });

  it('isAuthenticated() returns true after setAuthenticated()', () => {
    service.setAuthenticated();
    expect(service.isAuthenticated()).toBe(true);
  });

  it('clear() resets authenticated to false', () => {
    service.setAuthenticated();
    service.clear();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('state$ emits initial state with authenticated false', () => {
    let state: TokenState | undefined;
    service.state$.subscribe(s => state = s);
    expect(state).toEqual({ authenticated: false });
  });

  it('state$ emits after setAuthenticated()', () => {
    const states: TokenState[] = [];
    service.state$.subscribe(s => states.push(s));

    service.setAuthenticated();

    expect(states.length).toBe(2);
    expect(states[1]).toEqual({ authenticated: true });
  });

  it('state$ emits after clear()', () => {
    service.setAuthenticated();

    const states: TokenState[] = [];
    service.state$.subscribe(s => states.push(s));

    service.clear();

    expect(states.length).toBe(2);
    expect(states[1]).toEqual({ authenticated: false });
  });

  it('setAuthenticated() is idempotent', () => {
    service.setAuthenticated();
    service.setAuthenticated();
    expect(service.isAuthenticated()).toBe(true);
  });
});
