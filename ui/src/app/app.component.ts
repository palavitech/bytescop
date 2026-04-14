import { Component, HostListener, inject, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AsyncPipe, CommonModule, NgClass, NgIf } from '@angular/common';
import { BehaviorSubject, combineLatest, merge, of } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { BreadcrumbComponent } from './components/breadcrumb/breadcrumb';
import { ToastContainer } from './components/toast/toast-container';
import { TenantMenuComponent } from './components/tenant-menu/tenant-menu';
import { HasPermissionDirective } from './components/directives/has-permission.directive';
import { LoadingService } from './services/core/loading/loading.service';
import { AuthService } from './services/core/auth/auth.service';
import { NotificationService } from './services/core/notify/notification.service';
import { UserProfileService } from './services/core/profile/user-profile.service';
import { EngagementsService } from './features/engagements/services/engagements.service';
import { Engagement } from './features/engagements/models/engagement.model';
import { VersionService } from './services/core/version.service';
import { DateFormatService } from './services/core/date-format.service';
import { environment } from '../environments/environment';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [
        RouterOutlet,
        RouterLink,
        RouterLinkActive,
        NgClass,
        CommonModule,
        NgIf,
        AsyncPipe,
        BreadcrumbComponent,
        ToastContainer,
        TenantMenuComponent,
        HasPermissionDirective
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
    year = new Date().getFullYear();

    sidebarCollapsed = false;
    showSidebar = true;
    showBreadcrumb = true;
    isAuthPage = false;

    readonly isDev = !environment.production;

    private readonly loading = inject(LoadingService);
    readonly isLoading$ = this.loading.isLoading$;

    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly http = inject(HttpClient);
    private readonly notify = inject(NotificationService);
    readonly auth = inject(AuthService);
    readonly isAuthenticated$ = this.auth.isAuthenticated$;

    private readonly userProfile = inject(UserProfileService);
    readonly profile$ = this.userProfile.profile$;

    readonly avatarUrl$ = this.userProfile.avatarUrl$.pipe(
        distinctUntilChanged(),
        switchMap(url => {
            if (!url) return of(null);
            return this.http.get(url, { responseType: 'blob' }).pipe(
                map(blob => URL.createObjectURL(blob)),
                catchError(err => {
                    console.warn('[app] failed to load avatar', err?.status ?? err?.message);
                    return of(null);
                }),
            );
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    private readonly engagementsService = inject(EngagementsService);
    private readonly versionService = inject(VersionService);
    private readonly dateFormatService = inject(DateFormatService);
    readonly uiVersion$ = this.versionService.uiVersion$;
    readonly apiVersion$ = this.versionService.apiVersion$;
    private readonly findingsMenuRefresh$ = new BehaviorSubject<number>(0);

    refreshFindingsMenu(): void {
        this.findingsMenuRefresh$.next(Date.now());
    }

    readonly activeEngagements$ = combineLatest([
        this.isAuthenticated$,
        merge(
            this.findingsMenuRefresh$,
            this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => Date.now())),
        ).pipe(startWith(0)),
    ]).pipe(
        switchMap(([authed]) => {
            if (!authed) return of([] as Engagement[]);
            return this.engagementsService.list({ status: 'active' }).pipe(
                catchError(err => {
                    console.warn('[app] failed to load active engagements', err?.status ?? err?.message);
                    return of([] as Engagement[]);
                }),
            );
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    ngOnInit(): void {
        document.body.classList.toggle('bc-sidebar-collapsed', this.sidebarCollapsed);

        this.updateRouteFlags();
        this.router.events.pipe(
            filter(e => e instanceof NavigationEnd)
        ).subscribe(() => {
            this.updateRouteFlags();
        });

        this.isAuthenticated$.subscribe(authed => {
            if (authed) this.dateFormatService.load();
        });
    }

    toggleSidebar(): void {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        document.body.classList.toggle('bc-sidebar-collapsed', this.sidebarCollapsed);
    }

    onLogout(): void {
        this.auth.logout().subscribe(() => {
            this.router.navigateByUrl('/login');
        });
    }

    private updateRouteFlags(): void {
        let r = this.router.routerState.snapshot.root;
        while (r.firstChild) r = r.firstChild;
        this.showBreadcrumb = r.data?.['hideBreadcrumb'] !== true;
        this.showSidebar = r.data?.['hideSidebar'] !== true;
        this.isAuthPage = r.data?.['authPage'] === true;
    }


    @HostListener('document:keydown', ['$event'])
    onKeydown(e: KeyboardEvent): void {
        if (e.ctrlKey && (e.key || '').toLowerCase() === 'b') {
            e.preventDefault();
            this.toggleSidebar();
        }
    }
}
