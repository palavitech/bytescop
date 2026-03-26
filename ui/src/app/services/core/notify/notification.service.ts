import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NotifyOptions, NotificationKind, ToastNotification } from './notification.types';

type ShowArgs = {
  kind: NotificationKind;
  message: string;
} & NotifyOptions;

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly toastsSubject = new BehaviorSubject<ToastNotification[]>([]);
  readonly toasts$ = this.toastsSubject.asObservable();

  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly maxToasts = 5;
  private readonly defaultDurations: Record<string, number> = {
    success: 3000,
    info: 3000,
    warning: 4500,
    error: 5500,
  };

  /** Set by ToastContainer to animate out before removing */
  onBeforeDismiss: ((id: string) => void) | null = null;

  success(message: string, options: NotifyOptions = {}): string {
    return this.show({ kind: 'success', message, ...options });
  }

  info(message: string, options: NotifyOptions = {}): string {
    return this.show({ kind: 'info', message, ...options });
  }

  warning(message: string, options: NotifyOptions = {}): string {
    return this.show({ kind: 'warning', message, ...options });
  }

  error(message: string, options: NotifyOptions = {}): string {
    return this.show({ kind: 'error', message, ...options });
  }

  show(args: ShowArgs): string {
    const id = this.newId();

    const toast: ToastNotification = {
      id,
      kind: args.kind,
      title: args.title,
      message: args.message,
      createdAt: Date.now(),
      durationMs: typeof args.durationMs === 'number' ? args.durationMs : (this.defaultDurations[args.kind] ?? 3000),
      dismissible: args.dismissible !== false
    };

    const current = this.toastsSubject.getValue();
    const next = [toast, ...current].slice(0, this.maxToasts);
    this.toastsSubject.next(next);

    if (toast.durationMs > 0) {
      const handle = setTimeout(() => {
        if (this.onBeforeDismiss) {
          this.onBeforeDismiss(toast.id);
        } else {
          this.dismiss(toast.id);
        }
      }, toast.durationMs);
      this.timers.set(toast.id, handle);
    }

    return toast.id;
  }

  dismiss(id: string): void {
    const handle = this.timers.get(id);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(id);
    }

    const current = this.toastsSubject.getValue();
    this.toastsSubject.next(current.filter(t => t.id !== id));
  }

  clearAll(): void {
    for (const handle of this.timers.values()) clearTimeout(handle);
    this.timers.clear();
    this.toastsSubject.next([]);
  }

  private newId(): string {
    const cryptoAny = globalThis as any;
    if (cryptoAny?.crypto?.randomUUID) return cryptoAny.crypto.randomUUID();
    return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}
