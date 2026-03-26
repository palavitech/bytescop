import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/core/auth/auth.service';

type VerifyState = 'loading' | 'success' | 'expired' | 'error';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './verify-email.component.html',
  styleUrls: ['../auth-shared.css'],
})
export class VerifyEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  state: VerifyState = 'loading';
  message = '';

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state = 'error';
      this.message = 'No verification token provided.';
      return;
    }

    this.auth.verifyEmail(token).subscribe({
      next: (res) => {
        this.state = 'success';
        this.message = res.detail;
      },
      error: (err) => {
        const data = err?.error;
        if (data?.code === 'token_expired') {
          this.state = 'expired';
          this.message = data.detail || 'This verification link has expired.';
        } else {
          this.state = 'error';
          this.message = data?.detail || 'Invalid or expired verification link.';
        }
      },
    });
  }
}
