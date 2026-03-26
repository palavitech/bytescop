import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { AsyncPipe, NgClass, NgIf, UpperCasePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { map, distinctUntilChanged } from 'rxjs/operators';

import { UserProfileService } from '../../services/core/profile/user-profile.service';
import { PermissionService } from '../../services/core/auth/permission.service';
import { AuthService, TenantInfo } from '../../services/core/auth/auth.service';
import { TokenService } from '../../services/core/auth/token.service';
import { NotificationService } from '../../services/core/notify/notification.service';
import { HasPermissionDirective } from '../directives/has-permission.directive';

@Component({
  selector: 'app-tenant-menu',
  standalone: true,
  imports: [AsyncPipe, NgClass, NgIf, UpperCasePipe, RouterLink, HasPermissionDirective],
  templateUrl: './tenant-menu.html',
  styleUrl: './tenant-menu.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantMenuComponent {
  @Input() collapsed = false;

  @ViewChild('triggerBtn', { static: false }) triggerBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild('menuPanel', { static: false }) menuPanel!: ElementRef<HTMLDivElement>;

  menuOpen = false;
  showTenantPicker = false;
  loadingTenants = false;
  switching = false;
  tenants: TenantInfo[] = [];

  private readonly userProfile = inject(UserProfileService);
  private readonly permissions = inject(PermissionService);
  private readonly auth = inject(AuthService);
  private readonly tokenService = inject(TokenService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly tenantName$ = this.userProfile.profile$.pipe(
    map(p => p?.tenant?.name ?? 'Tenant'),
    distinctUntilChanged(),
  );

  readonly tenantInitial$ = this.userProfile.profile$.pipe(
    map(p => {
      const name = p?.tenant?.name ?? '';
      return name ? name[0].toUpperCase() : 'T';
    }),
    distinctUntilChanged(),
  );

  readonly tenantRole$ = this.userProfile.profile$.pipe(
    map(p => (p?.tenant?.role ?? '').toLowerCase()),
    distinctUntilChanged(),
  );

  readonly planName$ = this.userProfile.planName$;

  readonly isRoot$ = this.permissions.isRoot$;

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      requestAnimationFrame(() => this.positionMenu());
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen) return;
    const target = event.target as Node;
    if (
      this.triggerBtn?.nativeElement.contains(target) ||
      this.menuPanel?.nativeElement.contains(target)
    ) {
      return;
    }
    this.menuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuOpen) {
      this.menuOpen = false;
    }
  }

  get currentTenantId(): string {
    return this.userProfile.currentTenantId() ?? '';
  }

  get otherTenants(): TenantInfo[] {
    return this.tenants.filter(t => t.id !== this.currentTenantId);
  }

  onSwitchTenantClick(): void {
    this.showTenantPicker = !this.showTenantPicker;
    if (this.showTenantPicker && this.tenants.length === 0) {
      this.loadTenants();
    }
  }

  loadTenants(): void {
    this.loadingTenants = true;
    this.cdr.markForCheck();
    this.auth.listTenants().subscribe({
      next: res => {
        this.tenants = res.tenants;
        this.loadingTenants = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingTenants = false;
        this.notify.error('Failed to load tenants.');
        this.cdr.markForCheck();
      },
    });
  }

  doSwitch(tenant: TenantInfo): void {
    if (this.switching) return;
    this.switching = true;
    this.cdr.markForCheck();
    this.auth.switchTenant(tenant.id).subscribe({
      next: () => {
        this.menuOpen = false;
        this.showTenantPicker = false;
        this.switching = false;
        this.tenants = [];
        // Force route re-initialization (handles same-URL navigation)
        this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
          this.router.navigateByUrl('/dashboard');
        });
        this.cdr.markForCheck();
      },
      error: () => {
        this.switching = false;
        this.notify.error('Failed to switch tenant.');
        this.cdr.markForCheck();
      },
    });
  }

  private positionMenu(): void {
    if (!this.triggerBtn || !this.menuPanel) return;

    const rect = this.triggerBtn.nativeElement.getBoundingClientRect();
    const panel = this.menuPanel.nativeElement;

    panel.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.width = `${rect.width}px`;
  }
}
