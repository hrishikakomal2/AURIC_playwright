import { Page, expect } from '@playwright/test';
import { tabLocator } from '../lib/tabs';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async login(username: string, password: string) {
    await this.page.locator('input[name="username"]').fill(username);
    await this.page.locator('input[name="password"]').fill(password);
    // The live app has been observed serving two different builds inconsistently across
    // requests — the Sign In button label ("Sign In" vs "Login") is one of the differences,
    // see apr/lib/tabs.ts for the full note.
    await this.page.getByRole('button', { name: /^(Sign In|Login)$/ }).click();
  }

  async expectLoginSucceeded() {
    await expect(this.page).toHaveURL(/\/client\/live-dashboard/, { timeout: 15000 });
    // Confirms the expected authenticated shell actually rendered, not just the URL changing.
    await expect(tabLocator(this.page, { legacyName: 'LIVE PERFORMANCE', newName: 'Live Dashboard' })).toBeVisible({ timeout: 15000 });
  }

  async expectLoginFailed() {
    await expect(this.page).not.toHaveURL(/\/client\/live-dashboard/, { timeout: 5000 });
  }
}
