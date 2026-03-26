import { type Page, type Locator } from '@playwright/test';

export class SidebarPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly navLinks: Locator;
  readonly collapseToggle: Locator;

  // Tenant menu
  readonly tenantTrigger: Locator;
  readonly tenantName: Locator;
  readonly tenantMenu: Locator;
  readonly tenantMenuItems: Locator;
  readonly tenantPickerItems: Locator;

  // User menu
  readonly userPill: Locator;
  readonly userMenu: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('.bc-sidebar');
    this.navLinks = page.locator('.bc-navLink');
    this.collapseToggle = page.locator('.bc-sidebarTop button, .bc-navGroupBtn').first();

    this.tenantTrigger = page.locator('.bc-tenantTrigger');
    this.tenantName = page.locator('.bc-tenantTrigger .bc-tenantName');
    this.tenantMenu = page.locator('.bc-tenantMenu');
    this.tenantMenuItems = page.locator('.bc-tenantMenuItem');
    this.tenantPickerItems = page.locator('.bc-tenantPickerItem');

    this.userPill = page.locator('.bc-pill');
    this.userMenu = page.locator('#bcUserMenu');
  }

  async navigateTo(linkText: string) {
    await this.navLinks.filter({ hasText: new RegExp(linkText, 'i') }).first().click();
  }

  async openTenantMenu() {
    await this.tenantTrigger.click();
    await this.tenantMenu.waitFor({ state: 'visible' });
  }

  async openUserMenu() {
    await this.userPill.click();
    await this.userMenu.waitFor({ state: 'visible' });
  }

  async logout() {
    await this.openUserMenu();
    await this.page.locator('.bc-dropMenu').getByText(/log\s*out/i).click();
  }

  navLink(text: string): Locator {
    return this.navLinks.filter({ hasText: new RegExp(text, 'i') }).first();
  }
}
