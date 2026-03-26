import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4200';
const EMAIL = 'admin@localhost';
const PASSWORD = 'Abcd1234!!';

interface RequestTiming {
  url: string;
  method: string;
  status: number;
  durationMs: number;
  startMs: number;
}

test('login flow — measure every network request', async ({ page }) => {
  const timings: RequestTiming[] = [];
  const t0 = Date.now();

  // Capture timing for every API request
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const request = response.request();
    const timing = request.timing();
    const durationMs = timing.responseEnd > 0
      ? Math.round(timing.responseEnd - timing.requestStart)
      : -1;
    timings.push({
      url: url.replace(BASE, '').replace('http://localhost:8000', ''),
      method: request.method(),
      status: response.status(),
      durationMs,
      startMs: Date.now() - t0,
    });
  });

  // Clear any stale storage first
  await page.goto(BASE + '/login');
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await page.reload();
  await page.waitForSelector('#email');

  console.log('\n=== Step 1: Enter credentials ===');
  const stepStart = Date.now();
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);

  console.log('=== Step 2: Click Continue ===');
  const loginClickTime = Date.now();
  await page.click('.bc-authSubmit');

  // Wait for workspace picker to appear
  await page.waitForSelector('.bc-tenantItem', { timeout: 60_000 });
  const tenantPickerTime = Date.now();
  console.log(`Workspace picker appeared in ${tenantPickerTime - loginClickTime}ms`);

  // Take screenshot
  await page.screenshot({ path: 'e2e/screenshot-workspace-picker.png' });

  console.log('\n=== Step 3: Click first workspace ===');
  const workspaceClickTime = Date.now();
  await page.click('.bc-tenantItem:first-child');

  // Wait for either MFA screen OR dashboard navigation
  await page.waitForSelector('.bc-mfaQrImg, .bc-mfaCodeInput, .bc-sidebar', { timeout: 60_000 });
  const nextScreenTime = Date.now();
  console.log(`Next screen appeared in ${nextScreenTime - workspaceClickTime}ms`);

  // Take screenshot
  await page.screenshot({ path: 'e2e/screenshot-after-workspace.png' });

  // Print all timings
  console.log('\n=== Network Request Timings ===');
  console.log('─'.repeat(90));
  console.log(
    'Method'.padEnd(8) +
    'Status'.padEnd(8) +
    'Duration'.padEnd(12) +
    'At'.padEnd(10) +
    'URL'
  );
  console.log('─'.repeat(90));
  for (const t of timings) {
    console.log(
      t.method.padEnd(8) +
      String(t.status).padEnd(8) +
      `${t.durationMs}ms`.padEnd(12) +
      `+${t.startMs}ms`.padEnd(10) +
      t.url
    );
  }
  console.log('─'.repeat(90));
  console.log(`Total elapsed: ${Date.now() - t0}ms`);
});

test('login flow — WITHOUT clearing storage (stale tokens)', async ({ page }) => {
  const timings: RequestTiming[] = [];
  const t0 = Date.now();

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const request = response.request();
    const timing = request.timing();
    const durationMs = timing.responseEnd > 0
      ? Math.round(timing.responseEnd - timing.requestStart)
      : -1;
    timings.push({
      url: url.replace(BASE, '').replace('http://localhost:8000', ''),
      method: request.method(),
      status: response.status(),
      durationMs,
      startMs: Date.now() - t0,
    });
  });

  // Simulate stale tokens — set them BEFORE navigating
  await page.goto(BASE + '/login');
  await page.evaluate(() => {
    sessionStorage.setItem('bc_access', 'eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwidXNlcl9pZCI6MSwidGVuYW50X3NsdWciOiJ0ZXN0In0.fake');
    localStorage.setItem('bc_refresh', 'eyJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoicmVmcmVzaCIsInVzZXJfaWQiOjEsInRlbmFudF9zbHVnIjoidGVzdCJ9.fake');
    localStorage.setItem('bc_tenant', 'test');
  });

  // Reload — this time the app thinks user is authenticated
  console.log('\n=== Reloading with stale tokens ===');
  const reloadTime = Date.now();
  await page.reload();

  // Wait for redirect back to login (after token refresh fails)
  await page.waitForSelector('#email', { timeout: 60_000 });
  const loginVisibleTime = Date.now();
  console.log(`Login page visible after ${loginVisibleTime - reloadTime}ms with stale tokens`);

  // Now do the actual login
  console.log('\n=== Entering credentials after stale token redirect ===');
  const loginStart = Date.now();
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('.bc-authSubmit');

  await page.waitForSelector('.bc-tenantItem', { timeout: 60_000 });
  const pickerTime = Date.now();
  console.log(`Workspace picker appeared in ${pickerTime - loginStart}ms`);

  // Print all timings
  console.log('\n=== Network Request Timings (stale tokens scenario) ===');
  console.log('─'.repeat(90));
  console.log(
    'Method'.padEnd(8) +
    'Status'.padEnd(8) +
    'Duration'.padEnd(12) +
    'At'.padEnd(10) +
    'URL'
  );
  console.log('─'.repeat(90));
  for (const t of timings) {
    console.log(
      t.method.padEnd(8) +
      String(t.status).padEnd(8) +
      `${t.durationMs}ms`.padEnd(12) +
      `+${t.startMs}ms`.padEnd(10) +
      t.url
    );
  }
  console.log('─'.repeat(90));
  console.log(`Total elapsed: ${Date.now() - t0}ms`);
});
