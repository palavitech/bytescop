import { test as base, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.join(__dirname, '..', '.auth', 'session.json');

/**
 * Extended test fixture that restores sessionStorage before each test.
 * Playwright's storageState only saves localStorage and cookies — since
 * bc_access is stored in sessionStorage, we restore it manually.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    // Restore sessionStorage from the auth setup file
    if (fs.existsSync(sessionPath)) {
      const sessionData: Record<string, string> = JSON.parse(
        fs.readFileSync(sessionPath, 'utf-8')
      );

      // Navigate to the app origin so we can set sessionStorage
      await page.goto('/');
      await page.evaluate((data) => {
        for (const [key, value] of Object.entries(data)) {
          sessionStorage.setItem(key, value);
        }
      }, sessionData);
    }

    await use(page);
  },
});

export { expect };
