import { AfterViewInit, Component, ElementRef, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SetupStateService } from '../../services/core/setup/setup-state.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup.component.html',
  styleUrls: ['../auth-shared.css'],
})
export class SetupComponent implements AfterViewInit {
  @ViewChild('workspaceInput') private readonly workspaceInput!: ElementRef<HTMLInputElement>;

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly setupState = inject(SetupStateService);

  form = {
    workspace_name: '',
    admin_first_name: '',
    admin_last_name: '',
    admin_email: '',
    admin_password: '',
    password_confirm: '',
  };

  submitting = false;
  apiError = '';
  setupComplete = false;
  workspaceSlug = '';

  ngAfterViewInit(): void {
    this.workspaceInput?.nativeElement.focus();
  }

  get passwordMismatch(): boolean {
    return !!this.form.admin_password && !!this.form.password_confirm
      && this.form.admin_password !== this.form.password_confirm;
  }

  get canSubmit(): boolean {
    return !this.submitting
      && !!this.form.workspace_name.trim()
      && !!this.form.admin_first_name.trim()
      && !!this.form.admin_email.trim()
      && this.form.admin_password.length >= 12
      && this.form.admin_password === this.form.password_confirm;
  }

  onSubmit(): void {
    if (!this.canSubmit) return;
    this.submitting = true;
    this.apiError = '';

    const url = `${environment.apiUrl}/api/setup/complete/`;
    this.http.post<{ ok: boolean; workspace_slug: string }>(url, this.form).subscribe({
      next: (res) => {
        this.submitting = false;
        this.setupComplete = true;
        this.workspaceSlug = res.workspace_slug;
        this.setupState.markSetupComplete();
      },
      error: (err) => {
        this.submitting = false;
        this.apiError = this.extractError(err);
      },
    });
  }

  goToLogin(): void {
    this.router.navigateByUrl('/login');
  }

  private extractError(err: any): string {
    const data = err?.error;
    if (!data) return 'Something went wrong. Please try again.';
    if (typeof data === 'string') return data;
    if (data.detail && typeof data.detail === 'string') return data.detail;
    if (data.detail && typeof data.detail === 'object') {
      const msgs: string[] = [];
      for (const val of Object.values(data.detail)) {
        if (typeof val === 'string') msgs.push(val);
      }
      return msgs.join(' ') || 'Validation failed.';
    }
    return data.message || 'Something went wrong. Please try again.';
  }
}
