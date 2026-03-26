export type NotificationKind = 'success' | 'info' | 'warning' | 'error';

export interface ToastNotification {
  id: string;
  kind: NotificationKind;
  title?: string;
  message: string;
  createdAt: number;
  durationMs: number;
  dismissible: boolean;
}

export interface NotifyOptions {
  title?: string;
  durationMs?: number;
  dismissible?: boolean;
}
