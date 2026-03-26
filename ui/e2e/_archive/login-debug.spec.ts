import { test } from '@playwright/test';

const BASE = 'http://localhost:4200';
const EMAIL = 'admin@localhost';
const PASSWORD = 'Abcd1234!!';

test('debug login — full trace', async ({ page }) => {
  const t0 = Date.now();
  const elapsed = () => `+${Date.now() - t0}ms`;

  page.on('console', (msg) => {
    console.log(`[CONSOLE ${elapsed()}] ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    console.log(`[PAGE ERROR ${elapsed()}] ${err.message}`);
  });
  page.on('request', (req) => {
    if (req.url().includes('/api/')) {
      console.log(`[REQ ${elapsed()}] ${req.method()} ${req.url()}`);
    }
  });
  page.on('response', async (res) => {
    if (res.url().includes('/api/')) {
      let body = '';
      try { body = (await res.text()).substring(0, 200); } catch { body = '<unable>'; }
      console.log(`[RES ${elapsed()}] ${res.status()} ${res.url()} — ${body}`);
    }
  });
  page.on('requestfailed', (req) => {
    console.log(`[FAIL ${elapsed()}] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  // Hard navigate (no cache) to pick up latest code
  console.log(`[${elapsed()}] Navigating...`);
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  // Force full page reload to ensure HMR changes are picked up
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('#email');
  console.log(`[${elapsed()}] Login page ready`);

  // Use page.evaluate to type into Angular's ngModel properly
  await page.locator('#email').click();
  await page.locator('#email').pressSequentially(EMAIL, { delay: 10 });
  await page.locator('#password').click();
  await page.locator('#password').pressSequentially(PASSWORD, { delay: 10 });
  console.log(`[${elapsed()}] Credentials typed`);

  // Click Continue
  console.log(`[${elapsed()}] Clicking Continue...`);
  await page.click('.bc-authSubmit');

  // Monitor state at intervals
  const checkpoints = [1, 2, 5, 10, 20, 35, 45];
  const clickTime = Date.now();
  for (const sec of checkpoints) {
    const target = clickTime + (sec * 1000);
    const wait = target - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);

    const state = await page.evaluate(() => {
      const title = document.querySelector('.bc-authTitle')?.textContent?.trim() ?? 'N/A';
      const error = document.querySelector('.bc-authError')?.textContent?.trim() ?? '';
      const tenants = document.querySelectorAll('.bc-tenantItem').length;
      const btn = document.querySelector('.bc-authSubmit')?.textContent?.trim() ?? 'N/A';
      return { title, error, tenants, btn };
    });
    console.log(`[${elapsed()}] @${sec}s — title="${state.title}" btn="${state.btn}" tenants=${state.tenants} error="${state.error}"`);

    if (state.tenants > 0) {
      console.log(`[${elapsed()}] SUCCESS — Workspace picker appeared!`);
      await page.screenshot({ path: 'e2e/success.png' });
      break;
    }
  }

  await page.screenshot({ path: 'e2e/final.png' });
  console.log(`[${elapsed()}] Done.`);
});
