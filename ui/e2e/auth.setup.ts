import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as OTPAuth from 'otpauth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const email = process.env['E2E_USER_EMAIL'] || 'admin@localhost';
const password = process.env['E2E_USER_PASSWORD'] || 'Abcd1234!!';
const mfaSecret = process.env['E2E_MFA_SECRET'] || '';
const mfaCode = process.env['E2E_MFA_CODE'] || '';
const authDir = path.join(__dirname, '.auth');
const storageStatePath = path.join(authDir, 'user.json');
const sessionPath = path.join(authDir, 'session.json');

function generateMfaCode(): string {
  if (mfaCode) return mfaCode;
  if (mfaSecret) {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(mfaSecret),
      digits: 6,
      period: 30,
    });
    return totp.generate();
  }
  throw new Error(
    'MFA is required but neither E2E_MFA_SECRET nor E2E_MFA_CODE is set. ' +
    'Export the TOTP secret as E2E_MFA_SECRET or a one-time code as E2E_MFA_CODE.',
  );
}

setup('authenticate', async ({ page }) => {
  fs.mkdirSync(authDir, { recursive: true });

  // Step 1: Navigate to login
  await page.goto('/login');
  await page.waitForSelector('#email');

  // Step 2: Enter credentials and submit
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('.bc-authSubmit').click();

  // Step 3: After credentials, we may land on MFA or tenant picker
  const afterCredentials = await Promise.race([
    page.waitForSelector('#mfaCode', { timeout: 30_000 }).then(() => 'mfa' as const),
    page.waitForSelector('.bc-tenantItem', { timeout: 30_000 }).then(() => 'tenant' as const),
  ]);

  if (afterCredentials === 'mfa') {
    const code = generateMfaCode();
    await page.locator('#mfaCode').fill(code);
    await page.locator('button.bc-authSubmit[type="submit"]').click();

    // After MFA: tenant picker (multi-tenant) or straight to dashboard (single tenant)
    const afterMfa = await Promise.race([
      page.waitForSelector('.bc-tenantItem', { timeout: 30_000 }).then(() => 'tenant' as const),
      page.waitForSelector('.bc-sidebar', { timeout: 30_000 }).then(() => 'dashboard' as const),
    ]);

    if (afterMfa === 'tenant') {
      await page.locator('.bc-tenantItem').first().click();
      await page.waitForSelector('.bc-sidebar', { timeout: 30_000 });
    }
  } else {
    // No MFA — landed on tenant picker
    await page.locator('.bc-tenantItem').first().click();
    await page.waitForSelector('.bc-sidebar', { timeout: 30_000 });
  }
  await expect(page.locator('.bc-h1')).toBeVisible();

  // Step 6: Save storageState (localStorage + cookies)
  await page.context().storageState({ path: storageStatePath });

  // Step 7: Save sessionStorage separately (bc_access lives here)
  const sessionData = await page.evaluate(() => {
    const data: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) data[key] = sessionStorage.getItem(key) || '';
    }
    return data;
  });
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
});
