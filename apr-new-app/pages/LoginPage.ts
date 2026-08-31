import { Page, expect } from '@playwright/test';
import { tabLocator } from '../lib/tabs';

/**
 * Own copy for this environment — see apr-new-app/README.md "Isolation from the existing suite".
 * Uses the config's absolute `baseUrl` for navigation rather than Playwright's global `baseURL`
 * (set from the existing suite's TEST_BASE_URL in playwright.config.ts), so this environment
 * never depends on the other's configuration even by accident.
 */
export class LoginPage {
  constructor(private readonly page: Page, private readonly baseUrl: string) {}

  async goto() {
    await this.page.goto(this.baseUrl);
  }

  async login(username: string, password: string) {
    await this.page.locator('input[name="username"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);
    // This app has been observed serving two different builds inconsistently across requests —
    // the Sign In button label ("Sign In" vs "Login") is one of the differences.
    await this.page.getByRole('button', { name: /^(Sign In|Login)$/ }).click();
  }

  async expectLoginSucceeded() {
    await expect(this.page).toHaveURL(/\/client\/live-dashboard/, { timeout: 15000 });
    await expect(tabLocator(this.page, { legacyName: 'LIVE PERFORMANCE', newName: 'Live Dashboard' })).toBeVisible({ timeout: 15000 });
  }

  async expectLoginFailed() {
    await expect(this.page).not.toHaveURL(/\/client\/live-dashboard/, { timeout: 5000 });
  }
}
