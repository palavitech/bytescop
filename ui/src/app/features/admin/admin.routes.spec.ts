import { Route } from '@angular/router';
import { ADMIN_ROUTES } from './admin.routes';

describe('Admin Routes', () => {
  it('should have routes defined', () => {
    expect(ADMIN_ROUTES.length).toBeGreaterThan(0);
  });

  it('root path redirects to users', () => {
    const root = ADMIN_ROUTES.find(r => r.path === '' && r.redirectTo === 'users');
    expect(root).toBeDefined();
    expect(root!.pathMatch).toBe('full');
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

  testLazyRoutes(ADMIN_ROUTES, 'route');

  it('users route has breadcrumb "Users"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'users');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Users');
  });

  it('users/create route has breadcrumb "Create User"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'users/create');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Create User');
  });

  it('users/:id route has breadcrumb "View User"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'users/:id');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('View User');
  });

  it('users/:id/edit route has breadcrumb "Edit User"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'users/:id/edit');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Edit User');
  });

  it('groups route has breadcrumb "Groups"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'groups');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Groups');
  });

  it('groups/create route has breadcrumb "Create Group"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'groups/create');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Create Group');
  });

  it('groups/:id route has breadcrumb "View Group"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'groups/:id');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('View Group');
  });

  it('groups/:id/edit route has breadcrumb "Edit Group"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'groups/:id/edit');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Edit Group');
  });

  it('audit route has breadcrumb "Audit Log"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'audit');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Audit Log');
  });

  it('audit/:id route has breadcrumb "Audit Entry"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'audit/:id');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Audit Entry');
  });

  it('settings route has breadcrumb "Settings"', () => {
    const route = ADMIN_ROUTES.find(r => r.path === 'settings');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Settings');
  });

  it('all routes with loadComponent have canActivate guards', () => {
    const lazyRoutes = ADMIN_ROUTES.filter(r => r.loadComponent);
    lazyRoutes.forEach(route => {
      expect(route.canActivate).toBeDefined(`Route "${route.path}" should have canActivate`);
      expect(route.canActivate!.length).toBeGreaterThan(0);
    });
  });
});
