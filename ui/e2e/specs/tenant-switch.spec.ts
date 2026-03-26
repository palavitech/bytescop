import { test, expect } from '../fixtures/test-fixtures';
import { SidebarPage } from '../pages/sidebar.page';

test.describe('Tenant switch', () => {
  let sidebar: SidebarPage;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarPage(page);
    await page.goto('/dashboard');
    await sidebar.sidebar.waitFor();
  });

  test('tenant name is shown in sidebar', async () => {
    await expect(sidebar.tenantName).toBeVisible();
    const name = await sidebar.tenantName.textContent();
    expect(name?.trim().length).toBeGreaterThan(0);
  });

  test('tenant menu opens with switch option', async () => {
    await sidebar.openTenantMenu();
    await expect(sidebar.tenantMenu).toBeVisible();
    // Should have at least one menu item (e.g. "Switch Workspace")
    const itemCount = await sidebar.tenantMenuItems.count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('tenant picker loads available tenants', async ({ page }) => {
    await sidebar.openTenantMenu();

    // Click "Switch Workspace" menu item
    const switchItem = sidebar.tenantMenuItems.filter({
      hasText: /switch/i,
    });

    if (await switchItem.isVisible()) {
      await switchItem.click();
      // Wait for picker items to appear
      await sidebar.tenantPickerItems.first().waitFor({ timeout: 10_000 });
      const count = await sidebar.tenantPickerItems.count();
      expect(count).toBeGreaterThan(0);
    }
  });
});
