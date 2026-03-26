import { test, expect } from '../fixtures/test-fixtures';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Dashboard', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoaded();
  });

  test('shows heading and welcome subtitle', async () => {
    await expect(dashboard.heading).toContainText(/dashboard/i);
    await expect(dashboard.subtitle).toBeVisible();
  });

  test('stat widgets are visible', async () => {
    await expect(dashboard.statCards.first()).toBeVisible();
    const count = await dashboard.statCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('refresh button triggers API call', async ({ page }) => {
    const apiCalled = page.waitForResponse(
      (res) => res.url().includes('/api/') && res.status() === 200
    );
    await dashboard.refresh();
    await apiCalled;
  });
});
