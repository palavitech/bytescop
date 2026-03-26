import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly authTitle: Locator;
  readonly authError: Locator;
  readonly tenantList: Locator;
  readonly tenantItems: Locator;
  readonly mfaCodeInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.submitButton = page.locator('.bc-authSubmit');
    this.authTitle = page.locator('.bc-authTitle');
    this.authError = page.locator('.bc-authError');
    this.tenantList = page.locator('.bc-tenantList');
    this.tenantItems = page.locator('.bc-tenantItem');
    this.mfaCodeInput = page.locator('#mfaCode');
  }

  async goto() {
    await this.page.goto('/login');
    await this.emailInput.waitFor();
  }

  async fillCredentials(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit() {
    await this.submitButton.click();
  }

  async login(email: string, password: string) {
    await this.fillCredentials(email, password);
    await this.submit();
  }

  async selectTenant(index = 0) {
    await this.tenantItems.nth(index).click();
  }

  async waitForTenantPicker() {
    await this.tenantItems.first().waitFor({ timeout: 30_000 });
  }
}
