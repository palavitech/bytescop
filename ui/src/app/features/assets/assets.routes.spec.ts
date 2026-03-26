import { Route } from '@angular/router';
import { ASSET_ROUTES } from './assets.routes';

describe('Asset Routes', () => {
  it('should have routes defined', () => {
    expect(ASSET_ROUTES.length).toBeGreaterThan(0);
  });

  function testLazyRoutes(routes: Route[], prefix: string): void {
    routes.forEach((route, i) => {
      if (route.loadComponent) {
        it(`${prefix}[${i}] "${route.path}" loadComponent resolves`, async () => {
          const component = await (route.loadComponent as Function)();
          expect(component).toBeTruthy();
        });
      }
      if (route.loadChildren) {
        it(`${prefix}[${i}] "${route.path}" loadChildren resolves`, async () => {
          const children = await (route.loadChildren as Function)();
          expect(children).toBeTruthy();
        });
      }
      if (route.children) {
        testLazyRoutes(route.children, `${prefix}[${i}].children`);
      }
    });
  }

  testLazyRoutes(ASSET_ROUTES, 'route');

  it('list route has breadcrumb "List"', () => {
    const route = ASSET_ROUTES.find(r => r.path === '');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('List');
  });

  it('create route has breadcrumb "Create Asset"', () => {
    const route = ASSET_ROUTES.find(r => r.path === 'create');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Create Asset');
  });

  it(':id route has breadcrumb "View Asset"', () => {
    const route = ASSET_ROUTES.find(r => r.path === ':id');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('View Asset');
  });

  it(':id/edit route has breadcrumb "Edit Asset"', () => {
    const route = ASSET_ROUTES.find(r => r.path === ':id/edit');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Edit Asset');
  });

  it('create route has canActivate guard', () => {
    const route = ASSET_ROUTES.find(r => r.path === 'create');
    expect(route!.canActivate).toBeDefined();
    expect(route!.canActivate!.length).toBeGreaterThan(0);
  });

  it(':id/edit route has canActivate guard', () => {
    const route = ASSET_ROUTES.find(r => r.path === ':id/edit');
    expect(route!.canActivate).toBeDefined();
    expect(route!.canActivate!.length).toBeGreaterThan(0);
  });
});
