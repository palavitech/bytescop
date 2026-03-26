import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/core/auth/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['../auth-shared.css'],
})
export class ForgotPasswordComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  email = '';
  submitting = false;
  emailSent = false;
  apiError = '';

  // SMTP check state
  checkingSmtp = true;
  smtpConfigured = true; // assume true until proven otherwise

  get canSubmit(): boolean {
    return !this.submitting && !!this.email.trim();
  }

  ngOnInit(): void {
    const base = (environment.apiUrl || '').replace(/\/$/, '');
    this.http.get<{ checks: { smtp: string } }>(`${base}/api/health/`).subscribe({
      next: (res) => {
        this.smtpConfigured = res.checks?.smtp !== 'not configured';
        this.checkingSmtp = false;
      },
      error: () => {
        // If health check fails, assume SMTP is configured and let the flow proceed
        this.smtpConfigured = true;
        this.checkingSmtp = false;
      },
    });
  }

  onSubmit(): void {
    if (!this.canSubmit) return;
    this.submitting = true;
    this.apiError = '';

    this.auth.forgotPassword(this.email.trim()).subscribe({
      next: () => {
        this.submitting = false;
        this.emailSent = true;
      },
      error: (err) => {
        this.submitting = false;
        if (err?.status === 429) {
          this.apiError = 'Too many attempts. Please try again later.';
        } else {
          const data = err?.error;
          this.apiError = data?.detail || 'Something went wrong. Please try again.';
        }
      },
    });
  }
}
