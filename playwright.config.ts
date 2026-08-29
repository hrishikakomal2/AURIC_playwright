import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  // 'list' prints per-test pass/fail to the terminal as it runs — without it, 'html' and the
  // custom apr reporters both only write files, so a plain `npx playwright test` looks silent.
  // The two apr reporters are independent and additive: each only picks up its own tests (by
  // attachment name — see apr-new-app/reporter.ts), so running one suite never touches the
  // other's report output.
  reporter: [['list'], ['html'], ['./apr/reporter.ts'], ['./apr-new-app/reporter.ts']],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? 'https://ccaas.azalio.io',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
