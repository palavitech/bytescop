import { test, expect } from '../fixtures/test-fixtures';
import { OrganizationsListPage } from '../pages/organizations-list.page';
import { OrganizationFormPage } from '../pages/organization-form.page';

test.describe('Organizations', () => {
  let listPage: OrganizationsListPage;

  test.beforeEach(async ({ page }) => {
    listPage = new OrganizationsListPage(page);
    await listPage.goto();
    await listPage.waitForLoaded();
  });

  test('list page loads with heading and table', async () => {
    await expect(listPage.heading).toContainText(/clients/i);
    await expect(listPage.table).toBeVisible();
  });

  test('create new organization', async ({ page }) => {
    await listPage.clickNewOrganization();
    await expect(page).toHaveURL(/\/organizations\/new/);

    const form = new OrganizationFormPage(page);
    const timestamp = Date.now();
    const orgName = `E2E Test Org ${timestamp}`;

    await form.fillForm({
      name: orgName,
      website: `https://e2e-${timestamp}.example.com`,
      notes: 'Created by Playwright e2e test',
    });
    await form.submit();

    // After create, should navigate back to list or to view page
    await page.waitForURL(/\/organizations/, { timeout: 15_000 });
  });

  test('view organization detail', async ({ page }) => {
    // Click first row if available
    const rowCount = await listPage.rowLinks.count();
    if (rowCount > 0) {
      await listPage.clickRow(0);
      await expect(page).toHaveURL(/\/organizations\/[a-f0-9-]+/);
    }
  });

  test('refresh reloads the list', async ({ page }) => {
    const apiCalled = page.waitForResponse(
      (res) => res.url().includes('/api/clients') && res.status() === 200
    );
    await listPage.refresh();
    await apiCalled;
  });
});
