import { Component, OnInit, OnDestroy, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, interval, switchMap, takeWhile, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

interface ClosureStep {
  name: string;
  status: 'pending' | 'in_progress' | 'done';
}

interface ClosureStatusResponse {
  status: 'processing' | 'completed' | 'failed';
  tenant_name: string;
  steps: ClosureStep[];
  error: string | null;
  workers_healthy: boolean | null;
  remaining_tenants: number;
  started_at: string | null;
  completed_at: string | null;
}

@Component({
  selector: 'app-closing',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './closing.component.html',
  styleUrls: ['../auth-shared.css', './closing.component.css'],
})
export class ClosingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  closureId = '';
  state = signal<'loading' | 'processing' | 'completed' | 'failed' | 'invalid'>('loading');
  tenantName = signal('');
  steps = signal<ClosureStep[]>([]);
  error = signal<string | null>(null);
  workersHealthy = signal<boolean | null>(null);
  remainingTenants = signal(0);
  countdown = signal(30);

  private pollSub?: Subscription;
  private countdownInterval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.closureId = this.route.snapshot.queryParamMap.get('closure_id') ?? '';
    if (!this.closureId) {
      this.state.set('invalid');
      return;
    }
    this.startPolling();
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  private startPolling(): void {
    const baseUrl = (environment.apiUrl || '').replace(/\/$/, '');
    const url = `${baseUrl}/api/tenant/close/status/?closure_id=${this.closureId}`;

    // Immediately fetch once, then poll every 3s
    this.pollSub = interval(3000).pipe(
      switchMap(() => this.http.get<ClosureStatusResponse>(url)),
      tap(res => this.updateFromResponse(res)),
      takeWhile(res => res.status === 'processing'),
    ).subscribe({
      error: () => {
        // If poll fails, keep current state — don't crash
      },
    });

    // Also fetch immediately (interval waits first tick)
    this.http.get<ClosureStatusResponse>(url).subscribe({
      next: res => this.updateFromResponse(res),
      error: () => this.state.set('failed'),
    });
  }

  private updateFromResponse(res: ClosureStatusResponse): void {
    this.tenantName.set(res.tenant_name);
    this.steps.set(res.steps);
    this.error.set(res.error);
    this.workersHealthy.set(res.workers_healthy);
    this.remainingTenants.set(res.remaining_tenants);

    if (res.status === 'completed') {
      this.state.set('completed');
      if (res.remaining_tenants === 0) {
        this.startCountdown();
      }
    } else if (res.status === 'failed') {
      this.state.set('failed');
    } else {
      this.state.set('processing');
    }
  }

  private startCountdown(): void {
    if (this.countdownInterval) return;
    this.countdown.set(30);
    this.countdownInterval = setInterval(() => {
      const next = this.countdown() - 1;
      this.countdown.set(next);
      if (next <= 0) {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.goToSetup();
      }
    }, 1000);
  }

  goToSetup(): void {
    this.router.navigateByUrl('/setup');
  }

  goToLogin(): void {
    this.router.navigateByUrl('/login');
  }
}
