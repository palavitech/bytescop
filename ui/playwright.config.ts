import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'] || 'http://localhost:4200';

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'auth-setup',
      testDir: './e2e',
      testMatch: 'auth.setup.ts',
    },
    {
      name: 'chromium',
      testIgnore: '**/*.noauth.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['auth-setup'],
    },
    {
      name: 'no-auth',
      testMatch: '**/*.noauth.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
