import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-mfa-setup-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './mfa-setup-card.component.html',
  styleUrl: './mfa-setup-card.component.css',
})
export class MfaSetupCardComponent {
  /** Base64-encoded QR code image (omit for backup-codes-only mode) */
  @Input() qrCode: string | null = null;

  /** TOTP manual entry secret */
  @Input() secret = '';

  /** Backup codes to display */
  @Input() backupCodes: string[] = [];

  /** Whether the confirm action is loading */
  @Input() loading = false;

  /** Label for the confirm button */
  @Input() confirmLabel = 'Confirm';

  /** Label shown while loading */
  @Input() confirmLoadingLabel = 'Confirming...';

  /** Description text shown at the top */
  @Input() subtitle = 'Scan this QR code with your authenticator app.';

  /** Label for the code input */
  @Input() codeLabel = 'Enter code from your app to confirm';

  /** Max length for the code input */
  @Input() codeMaxLength = 6;

  /** Min length to enable confirm button */
  @Input() codeMinLength = 6;

  /** Require backup codes download before showing code input */
  @Input() requireDownload = false;

  /** Display-only mode — hide code input and confirm, show only codes + cancel */
  @Input() displayOnly = false;

  @Output() readonly confirm = new EventEmitter<string>();
  @Output() readonly cancel = new EventEmitter<void>();
  @Output() readonly download = new EventEmitter<void>();

  code = '';
  codesDownloaded = false;

  /** Whether the code input section should be visible */
  get showCodeInput(): boolean {
    if (!this.requireDownload) return true;
    if (this.backupCodes.length === 0) return true;
    return this.codesDownloaded;
  }

  onConfirm(): void {
    if (this.code.length >= this.codeMinLength) {
      this.confirm.emit(this.code);
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onDownload(): void {
    this.codesDownloaded = true;
    this.download.emit();
  }
}
