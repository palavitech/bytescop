import { type Page, type Locator } from '@playwright/test';

export class OrganizationsListPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly table: Locator;
  readonly tableRows: Locator;
  readonly rowLinks: Locator;
  readonly badge: Locator;
  readonly ctaButton: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('.bc-h1');
    this.table = page.locator('.bc-table');
    this.tableRows = page.locator('.bc-table tbody tr');
    this.rowLinks = page.locator('.bc-rowLink');
    this.badge = page.locator('.bc-badge');
    this.ctaButton = page.locator('.bc-btnCtaFoot');
    this.refreshButton = page.locator('.bc-iconBtn', { hasText: /refresh/i })
      .or(page.locator('.bc-pageCardTools button[title="Refresh"]'))
      .or(page.locator('.bc-pageCardTools .bi-arrow-clockwise').locator('..'));
  }

  async goto() {
    await this.page.goto('/organizations');
  }

  async waitForLoaded() {
    await this.heading.waitFor();
  }

  async clickNewOrganization() {
    await this.ctaButton.click();
  }

  async clickRow(index: number) {
    await this.rowLinks.nth(index).click();
  }

  async refresh() {
    await this.refreshButton.first().click();
  }
}
