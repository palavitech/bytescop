import { Component, ChangeDetectionStrategy, inject, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { NotificationService } from '../../services/core/notify/notification.service';
import { ToastNotification } from '../../services/core/notify/notification.types';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgFor, NgIf, AsyncPipe],
  templateUrl: './toast-container.html',
  styleUrl: './toast-container.css'
})
export class ToastContainer implements OnInit, OnDestroy {
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly toasts$ = this.notify.toasts$;

  readonly exiting = new Set<string>();

  ngOnInit(): void {
    this.notify.onBeforeDismiss = (id: string) => this.animateOut(id);
  }

  ngOnDestroy(): void {
    this.notify.onBeforeDismiss = null;
  }

  dismiss(id: string): void {
    this.animateOut(id);
  }

  trackById(_: number, t: ToastNotification): string {
    return t.id;
  }

  isExiting(id: string): boolean {
    return this.exiting.has(id);
  }

  private animateOut(id: string): void {
    if (this.exiting.has(id)) return;
    this.exiting.add(id);
    this.cdr.markForCheck();
    setTimeout(() => {
      this.exiting.delete(id);
      this.notify.dismiss(id);
    }, 280);
  }
}
