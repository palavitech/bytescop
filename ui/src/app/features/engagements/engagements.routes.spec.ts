import { Route } from '@angular/router';
import { ENGAGEMENT_ROUTES } from './engagements.routes';

describe('Engagement Routes', () => {
  it('should have routes defined', () => {
    expect(ENGAGEMENT_ROUTES.length).toBeGreaterThan(0);
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

  testLazyRoutes(ENGAGEMENT_ROUTES, 'route');

  it('list route has breadcrumb "List"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === '');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('List');
  });

  it('create route has breadcrumb "New Engagement"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === 'create');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('New Engagement');
  });

  it(':id route has breadcrumb "View Engagement"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === ':id');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('View Engagement');
  });

  it(':id/settings route has breadcrumb "Engagement Settings"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === ':id/settings');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Engagement Settings');
  });

  it(':id/edit route has breadcrumb "Edit Engagement"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === ':id/edit');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Edit Engagement');
  });

  it(':id/sow/edit route has breadcrumb "Edit SoW"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === ':id/sow/edit');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Edit SoW');
  });

  it(':id/findings route has breadcrumb "Findings"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === ':id/findings');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Findings');
    expect(route!.data!['hideBreadcrumb']).toBe(true);
  });

  it(':id/findings/create route has breadcrumb "New Finding"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === ':id/findings/create');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('New Finding');
    expect(route!.data!['hideBreadcrumb']).toBe(true);
  });

  it(':id/findings/:findingId/edit route has breadcrumb "Edit Finding"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === ':id/findings/:findingId/edit');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('Edit Finding');
  });

  it(':id/findings/:findingId route has breadcrumb "View Finding"', () => {
    const route = ENGAGEMENT_ROUTES.find(r => r.path === ':id/findings/:findingId');
    expect(route).toBeDefined();
    expect(route!.data!['breadcrumb']).toBe('View Finding');
  });

  it('routes with permissions have canActivate guards', () => {
    const guardedPaths = ['create', ':id/settings', ':id/edit', ':id/sow/edit',
      ':id/findings', ':id/findings/create', ':id/findings/:findingId/edit',
      ':id/findings/:findingId'];
    guardedPaths.forEach(path => {
      const route = ENGAGEMENT_ROUTES.find(r => r.path === path);
      expect(route).toBeDefined(`Route "${path}" should exist`);
      expect(route!.canActivate).toBeDefined(`Route "${path}" should have canActivate`);
      expect(route!.canActivate!.length).toBeGreaterThan(0);
    });
  });
});
