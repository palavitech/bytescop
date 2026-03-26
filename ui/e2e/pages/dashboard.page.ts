import { type Page, type Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly refreshButton: Locator;
  readonly statCards: Locator;
  readonly charts: Locator;
  readonly tables: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('.bc-h1');
    this.subtitle = page.locator('.bc-sub').first();
    this.refreshButton = page.locator('.bc-btnSoft', { hasText: /refresh/i });
    this.statCards = page.locator('.bc-miniCard');
    this.charts = page.locator('.bc-chartWrap');
    this.tables = page.locator('.bc-table');
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  async waitForLoaded() {
    await this.heading.waitFor();
  }

  async refresh() {
    await this.refreshButton.click();
  }
}
