import { APP_INITIALIZER, ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { loadingInterceptor } from './services/core/loading/loading.interceptor';
import { authInterceptor } from './services/core/auth/auth.interceptor';
import { BootstrapService } from './services/core/auth/bootstrap.service';
import { SetupStateService } from './services/core/setup/setup-state.service';

function initializeSetup(setup: SetupStateService) {
  return () => setup.refresh();
}

function initializeApp(bootstrap: BootstrapService) {
  return () => bootstrap.init();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([loadingInterceptor, authInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeSetup,
      deps: [SetupStateService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [BootstrapService],
      multi: true,
    },
  ]
};
