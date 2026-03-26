import { test, expect } from '../fixtures/test-fixtures';
import { SidebarPage } from '../pages/sidebar.page';

test.describe('Navigation', () => {
  let sidebar: SidebarPage;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarPage(page);
    await page.goto('/dashboard');
    await sidebar.sidebar.waitFor();
  });

  test('sidebar is visible with nav links', async () => {
    await expect(sidebar.sidebar).toBeVisible();
    const count = await sidebar.navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('navigate to organizations', async ({ page }) => {
    await sidebar.navigateTo('organizations');
    await expect(page).toHaveURL(/\/organizations/);
  });

  test('navigate to engagements', async ({ page }) => {
    await sidebar.navigateTo('engagements');
    await expect(page).toHaveURL(/\/engagements/);
  });

  test('sidebar collapse toggle works', async ({ page }) => {
    // Look for the collapse button — may be a chevron or hamburger
    const collapseBtn = page.locator(
      'button:has(.bi-chevron-left), button:has(.bi-list), .bc-sidebarTop button'
    ).first();

    if (await collapseBtn.isVisible()) {
      await collapseBtn.click();
      // After collapse, body should have the collapsed class
      await expect(page.locator('body')).toHaveClass(/bc-sidebar-collapsed/);
    }
  });

  test('user menu opens', async () => {
    await sidebar.openUserMenu();
    await expect(sidebar.userMenu).toBeVisible();
  });

  test('logout redirects to login', async ({ page }) => {
    await sidebar.logout();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
