import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NotificationService } from './notification.service';
import { ToastNotification } from './notification.types';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => service.clearAll());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- success / info / warning / error ---

  it('success() creates a toast with kind "success"', () => {
    service.success('done');
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);
    expect(toasts[0].kind).toBe('success');
    expect(toasts[0].message).toBe('done');
  });

  it('info() creates a toast with kind "info"', () => {
    service.info('fyi');
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].kind).toBe('info');
  });

  it('warning() creates a toast with kind "warning"', () => {
    service.warning('watch out');
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].kind).toBe('warning');
  });

  it('error() creates a toast with kind "error"', () => {
    service.error('oops');
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].kind).toBe('error');
  });

  // --- show() with options ---

  it('show() sets custom title', () => {
    service.show({ kind: 'info', message: 'body', title: 'My Title' });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].title).toBe('My Title');
  });

  it('show() uses custom durationMs when provided', () => {
    service.show({ kind: 'info', message: 'timed', durationMs: 9999 });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].durationMs).toBe(9999);
  });

  it('show() uses default duration when durationMs is not provided', () => {
    service.success('test');
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].durationMs).toBe(3000); // success default
  });

  it('show() uses warning default duration of 4500ms', () => {
    service.warning('warn');
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].durationMs).toBe(4500);
  });

  it('show() uses error default duration of 5500ms', () => {
    service.error('err');
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].durationMs).toBe(5500);
  });

  it('show() defaults dismissible to true', () => {
    service.info('test');
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].dismissible).toBeTrue();
  });

  it('show() respects dismissible: false', () => {
    service.info('sticky', { dismissible: false });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].dismissible).toBeFalse();
  });

  it('show() with durationMs=0 does not create a timer', fakeAsync(() => {
    service.info('persistent', { durationMs: 0 });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);

    tick(10000);
    expect(toasts.length).toBe(1); // still there
  }));

  // --- max toasts ---

  it('enforces max 5 toasts', () => {
    for (let i = 0; i < 7; i++) {
      service.info(`msg ${i}`, { durationMs: 0 });
    }
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(5);
  });

  it('newest toast appears first in the list', () => {
    service.info('first', { durationMs: 0 });
    service.info('second', { durationMs: 0 });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].message).toBe('second');
    expect(toasts[1].message).toBe('first');
  });

  // --- auto-dismiss ---

  it('auto-dismisses after durationMs', fakeAsync(() => {
    service.success('bye', { durationMs: 1000 });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);

    tick(1000);
    expect(toasts.length).toBe(0);
  }));

  it('auto-dismiss calls onBeforeDismiss when set', fakeAsync(() => {
    const beforeDismissSpy = jasmine.createSpy('onBeforeDismiss');
    service.onBeforeDismiss = beforeDismissSpy;

    const id = service.success('animate', { durationMs: 500 });

    tick(500);

    expect(beforeDismissSpy).toHaveBeenCalledWith(id);

    // Toast should still be present (onBeforeDismiss doesn't remove it)
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);

    // Clean up
    service.onBeforeDismiss = null;
  }));

  it('auto-dismiss calls dismiss directly when onBeforeDismiss is null', fakeAsync(() => {
    service.onBeforeDismiss = null;

    service.success('direct', { durationMs: 500 });

    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);

    tick(500);
    expect(toasts.length).toBe(0);
  }));

  // --- dismiss ---

  it('dismiss() removes a toast and clears its timer', fakeAsync(() => {
    const id = service.success('temp', { durationMs: 5000 });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);

    service.dismiss(id);
    expect(toasts.length).toBe(0);

    // timer should not cause errors after manual dismiss
    tick(5000);
  }));

  it('dismiss() is safe for non-existent id', () => {
    expect(() => service.dismiss('nonexistent')).not.toThrow();
  });

  it('dismiss() handles toast with no timer (durationMs=0)', () => {
    const id = service.info('no-timer', { durationMs: 0 });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);

    service.dismiss(id);
    expect(toasts.length).toBe(0);
  });

  // --- clearAll ---

  it('clearAll() empties all toasts and timers', fakeAsync(() => {
    service.success('a', { durationMs: 5000 });
    service.error('b', { durationMs: 5000 });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(2);

    service.clearAll();
    expect(toasts.length).toBe(0);

    tick(5000);
  }));

  // --- show() returns id ---

  it('show() returns a string id', () => {
    const id = service.show({ kind: 'info', message: 'test' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('each toast gets a unique id', () => {
    const id1 = service.info('one', { durationMs: 0 });
    const id2 = service.info('two', { durationMs: 0 });
    expect(id1).not.toBe(id2);
  });

  // --- options passed through convenience methods ---

  it('success() passes options through', () => {
    service.success('msg', { title: 'Title', durationMs: 9000, dismissible: false });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].title).toBe('Title');
    expect(toasts[0].durationMs).toBe(9000);
    expect(toasts[0].dismissible).toBeFalse();
  });

  it('error() passes options through', () => {
    service.error('msg', { title: 'Error Title', durationMs: 1000 });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].title).toBe('Error Title');
    expect(toasts[0].durationMs).toBe(1000);
  });

  // --- Branch: unknown kind falls back to 3000ms default ---

  it('show() falls back to 3000ms for unknown kind', () => {
    service.show({ kind: 'custom' as any, message: 'unknown kind' });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts[0].durationMs).toBe(3000);
  });

  it('show() with durationMs 0 does not set auto-dismiss timer', fakeAsync(() => {
    service.show({ kind: 'info', message: 'sticky', durationMs: 0 });
    let toasts: ToastNotification[] = [];
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);

    tick(10000);

    // Still present — no auto-dismiss
    service.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);
  }));

  it('auto-dismiss calls onBeforeDismiss when set', fakeAsync(() => {
    const dismissed: string[] = [];
    service.onBeforeDismiss = (id: string) => dismissed.push(id);

    const id = service.success('will animate out', { durationMs: 100 });
    tick(200);

    expect(dismissed).toContain(id);

    service.onBeforeDismiss = null;
  }));
});
