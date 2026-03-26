import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoadingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('isLoading$ starts as false', () => {
    let value = true;
    service.isLoading$.subscribe(v => value = v);
    expect(value).toBe(false);
  });

  it('isLoading$ emits true after 150ms delay on start()', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    service.start();
    expect(value).toBe(false);

    tick(150);
    expect(value).toBe(true);

    service.stop();
    tick(180);
  }));

  it('isLoading$ emits false after last stop() + 180ms', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    service.start();
    tick(150);
    expect(value).toBe(true);

    service.stop();
    expect(value).toBe(true);

    tick(180);
    expect(value).toBe(false);
  }));

  it('handles multiple start/stop ref counting', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    service.start();
    service.start();
    tick(150);
    expect(value).toBe(true);

    service.stop(); // active = 1, still loading
    tick(180);
    expect(value).toBe(true);

    service.stop(); // active = 0
    tick(180);
    expect(value).toBe(false);
  }));

  it('start() cancels pending hideTimer', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    // get into loading state
    service.start();
    tick(150);
    expect(value).toBe(true);

    // trigger stop (starts hideTimer)
    service.stop();
    // before hideTimer fires, start again — should cancel hideTimer
    service.start();

    tick(180);
    // should still be loading because start() cancelled the hide
    expect(value).toBe(true);

    service.stop();
    tick(180);
    expect(value).toBe(false);
  }));

  it('start() is no-op when already showing (loadingSubject is true)', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    service.start();
    tick(150);
    expect(value).toBe(true);

    // second start while already loading — should not create new timer
    service.start();
    tick(150);
    expect(value).toBe(true);

    service.stop();
    service.stop();
    tick(180);
    expect(value).toBe(false);
  }));

  it('stop() cancels pending showTimer if called before it fires', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    service.start();
    // stop before the 150ms showTimer fires
    service.stop();
    tick(150);
    expect(value).toBe(false);

    tick(180);
    expect(value).toBe(false);
  }));

  it('stop() replaces existing hideTimer on repeated stops', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    service.start();
    service.start();
    tick(150);
    expect(value).toBe(true);

    // first stop brings active to 1 — no hideTimer yet
    service.stop();
    // second stop brings active to 0 — sets hideTimer
    service.stop();

    // start and stop again to set another hideTimer (covers the hideTimer replacement branch in stop)
    service.start();
    tick(150);
    service.stop();
    tick(180);
    expect(value).toBe(false);
  }));

  it('stop() does not go below zero', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    // Stop without start — active should stay at 0
    service.stop();
    service.stop();

    tick(180);
    expect(value).toBe(false);

    // Should still work correctly after
    service.start();
    tick(150);
    expect(value).toBe(true);

    service.stop();
    tick(180);
    expect(value).toBe(false);
  }));

  it('start() replaces existing showTimer on rapid calls', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    service.start();
    tick(50); // 50ms into the 150ms delay
    expect(value).toBe(false);

    // Stop and immediately start again — this goes through the path where
    // active=0 → stop clears showTimer, then start sets a new one
    service.stop();
    tick(180);
    service.start();

    tick(150);
    expect(value).toBe(true);

    service.stop();
    tick(180);
    expect(value).toBe(false);
  }));

  it('showTimer callback does nothing if active is 0 when it fires', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    // This edge case: start then stop within 150ms, but somehow showTimer still fires
    // The code guards with `if (this.active > 0)` in the showTimer callback
    service.start();
    // We cannot easily test the internal guard directly, but we can verify
    // the overall behavior: after start+stop within the delay, loading stays false
    service.stop();
    tick(150);
    expect(value).toBe(false);
    tick(180);
  }));

  it('multiple rapid start/stop cycles work correctly', fakeAsync(() => {
    let value = false;
    service.isLoading$.subscribe(v => value = v);

    // Rapid start/stop cycle 1
    service.start();
    service.stop();
    tick(50);

    // Rapid start/stop cycle 2
    service.start();
    service.stop();
    tick(50);

    // Rapid start/stop cycle 3
    service.start();
    tick(150);
    expect(value).toBe(true);

    service.stop();
    tick(180);
    expect(value).toBe(false);
  }));
});
