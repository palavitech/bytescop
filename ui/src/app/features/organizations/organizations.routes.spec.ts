import { Route } from '@angular/router';
import { ORGANIZATION_ROUTES } from './organizations.routes';

describe('Organization Routes', () => {
  it('should have routes defined', () => {
    expect(ORGANIZATION_ROUTES.length).toBeGreaterThan(0);
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

  testLazyRoutes(ORGANIZATION_ROUTES, 'route');

  it('list route has breadcrumb "List"', () => {
    const route = ORGANIZATION_ROUTES.find(r => r.path === '');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('List');
  });

  it('create route has breadcrumb "Create Client"', () => {
    const route = ORGANIZATION_ROUTES.find(r => r.path === 'create');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Create Client');
  });

  it(':id route has breadcrumb "View Client"', () => {
    const route = ORGANIZATION_ROUTES.find(r => r.path === ':id');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('View Client');
  });

  it(':id/edit route has breadcrumb "Edit Client"', () => {
    const route = ORGANIZATION_ROUTES.find(r => r.path === ':id/edit');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Edit Client');
  });

  it('create route has canActivate guard', () => {
    const route = ORGANIZATION_ROUTES.find(r => r.path === 'create');
    expect(route!.canActivate).toBeDefined();
    expect(route!.canActivate!.length).toBeGreaterThan(0);
  });

  it(':id/edit route has canActivate guard', () => {
    const route = ORGANIZATION_ROUTES.find(r => r.path === ':id/edit');
    expect(route!.canActivate).toBeDefined();
    expect(route!.canActivate!.length).toBeGreaterThan(0);
  });
});
