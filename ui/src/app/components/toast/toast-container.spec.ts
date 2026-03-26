import { TestBed, fakeAsync, tick, ComponentFixture } from '@angular/core/testing';
import { ToastContainer } from './toast-container';
import { NotificationService } from '../../services/core/notify/notification.service';
import { ToastNotification } from '../../services/core/notify/notification.types';

describe('ToastContainer', () => {
  let component: ToastContainer;
  let fixture: ComponentFixture<ToastContainer>;
  let notifyService: NotificationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastContainer]
    }).compileComponents();

    fixture = TestBed.createComponent(ToastContainer);
    component = fixture.componentInstance;
    notifyService = TestBed.inject(NotificationService);
  });

  afterEach(() => notifyService.clearAll());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('ngOnInit sets onBeforeDismiss callback on notification service', () => {
    expect(notifyService.onBeforeDismiss).toBeNull();
    component.ngOnInit();
    expect(notifyService.onBeforeDismiss).not.toBeNull();
    expect(typeof notifyService.onBeforeDismiss).toBe('function');
  });

  // --- ngOnDestroy ---

  it('ngOnDestroy clears onBeforeDismiss callback', () => {
    component.ngOnInit();
    expect(notifyService.onBeforeDismiss).not.toBeNull();

    component.ngOnDestroy();
    expect(notifyService.onBeforeDismiss).toBeNull();
  });

  // --- toasts$ ---

  it('toasts$ reflects service toasts', () => {
    notifyService.success('hello');
    let toasts: ToastNotification[] = [];
    component.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(1);
  });

  // --- trackById ---

  it('trackById returns the toast id', () => {
    const toast: ToastNotification = {
      id: 'toast-123',
      kind: 'success',
      message: 'test',
      createdAt: Date.now(),
      durationMs: 3000,
      dismissible: true,
    };
    expect(component.trackById(0, toast)).toBe('toast-123');
  });

  it('trackById works with different indices', () => {
    const toast: ToastNotification = {
      id: 'toast-456',
      kind: 'info',
      message: 'info msg',
      createdAt: Date.now(),
      durationMs: 3000,
      dismissible: true,
    };
    expect(component.trackById(5, toast)).toBe('toast-456');
  });

  // --- isExiting ---

  it('isExiting returns false for a non-exiting toast', () => {
    expect(component.isExiting('nonexistent')).toBeFalse();
  });

  it('isExiting returns true for a toast currently animating out', () => {
    const id = notifyService.info('test', { durationMs: 0 });
    component.dismiss(id);
    expect(component.isExiting(id)).toBeTrue();
  });

  // --- dismiss / animateOut ---

  it('dismiss() triggers animateOut and calls service.dismiss() after delay', fakeAsync(() => {
    spyOn(notifyService, 'dismiss').and.callThrough();
    const id = notifyService.info('test', { durationMs: 0 });

    component.dismiss(id);

    expect(component.isExiting(id)).toBeTrue();

    tick(280);

    expect(notifyService.dismiss).toHaveBeenCalledWith(id);
    expect(component.isExiting(id)).toBeFalse();
  }));

  it('animateOut is idempotent - calling dismiss twice does not double-add', fakeAsync(() => {
    spyOn(notifyService, 'dismiss').and.callThrough();
    const id = notifyService.info('test', { durationMs: 0 });

    component.dismiss(id);
    component.dismiss(id); // second call should be no-op (already exiting)

    tick(280);

    // dismiss should only be called once
    expect(notifyService.dismiss).toHaveBeenCalledTimes(1);
  }));

  // --- onBeforeDismiss integration ---

  it('onBeforeDismiss callback triggers animation before auto-dismiss', fakeAsync(() => {
    component.ngOnInit();

    const id = notifyService.success('auto-dismiss', { durationMs: 100 });

    // Wait for the auto-dismiss timer to fire
    tick(100);

    // The onBeforeDismiss callback should have started animation
    expect(component.isExiting(id)).toBeTrue();

    // Wait for animation to complete
    tick(280);

    let toasts: ToastNotification[] = [];
    component.toasts$.subscribe(t => toasts = t);
    expect(toasts.length).toBe(0);
  }));

  // --- Template rendering ---

  it('renders toast messages', fakeAsync(() => {
    notifyService.success('Hello world', { durationMs: 0 });
    fixture.detectChanges();

    const msg = fixture.nativeElement.querySelector('.bc-toastMsg');
    expect(msg?.textContent).toContain('Hello world');
  }));

  it('renders dismiss button for dismissible toasts', fakeAsync(() => {
    notifyService.info('dismissible toast', { durationMs: 0, dismissible: true });
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.bc-toastClose');
    expect(closeBtn).not.toBeNull();
  }));

  it('does not render dismiss button for non-dismissible toasts', fakeAsync(() => {
    notifyService.info('sticky toast', { durationMs: 0, dismissible: false });
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector('.bc-toastClose');
    expect(closeBtn).toBeNull();
  }));

  it('renders toast title when provided', fakeAsync(() => {
    notifyService.success('body', { title: 'My Title', durationMs: 0 });
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.bc-toastTitle');
    expect(title?.textContent).toContain('My Title');
  }));

  it('does not render toast title when not provided', fakeAsync(() => {
    notifyService.success('body only', { durationMs: 0 });
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.bc-toastTitle');
    expect(title).toBeNull();
  }));

  it('applies correct CSS class for each toast kind', fakeAsync(() => {
    notifyService.error('err', { durationMs: 0 });
    fixture.detectChanges();

    const toast = fixture.nativeElement.querySelector('.bc-toast--error');
    expect(toast).not.toBeNull();
  }));

  it('renders progress bar when durationMs > 0', fakeAsync(() => {
    notifyService.info('timed', { durationMs: 5000 });
    fixture.detectChanges();

    const progressBar = fixture.nativeElement.querySelector('.bc-toastProgress');
    expect(progressBar).not.toBeNull();

    notifyService.clearAll();
  }));

  it('does not render progress bar when durationMs is 0', fakeAsync(() => {
    notifyService.info('no timer', { durationMs: 0 });
    fixture.detectChanges();

    const progressBar = fixture.nativeElement.querySelector('.bc-toastProgress');
    expect(progressBar).toBeNull();
  }));

  it('applies bc-toast--exit class when toast is exiting', fakeAsync(() => {
    const id = notifyService.info('exiting', { durationMs: 0 });
    fixture.detectChanges();

    component.dismiss(id);
    fixture.detectChanges();

    const exitingToast = fixture.nativeElement.querySelector('.bc-toast--exit');
    expect(exitingToast).not.toBeNull();

    tick(280);
  }));
});
