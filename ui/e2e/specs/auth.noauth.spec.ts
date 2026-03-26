import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page';

const email = process.env['E2E_USER_EMAIL'] || 'admin@localhost';
const password = process.env['E2E_USER_PASSWORD'] || 'Abcd1234!!';

test.describe('Login page (no auth)', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('shows login form elements', async () => {
    await expect(loginPage.authTitle).toHaveText(/log\s*in/i);
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('submit button is disabled with empty fields', async () => {
    await expect(loginPage.submitButton).toBeDisabled();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await loginPage.login('wrong@example.com', 'WrongPass123!!');
    await expect(loginPage.authError).toBeVisible({ timeout: 15_000 });
  });

  test('valid credentials advance to workspace picker', async () => {
    await loginPage.login(email, password);
    await loginPage.waitForTenantPicker();
    await expect(loginPage.tenantItems.first()).toBeVisible();
  });

  test('unauthenticated access redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
