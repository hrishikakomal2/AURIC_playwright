import { Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

/**
 * Logs in as the configured admin account and asserts the dashboard loaded — shared by every APR
 * test beyond TC01. Takes just the two credential fields (not the full AprConfig) so other,
 * independently-configured suites (e.g. tests/standard-report/agent-activity-report, which loads
 * its own isolated .env) can reuse this without needing to satisfy AprConfig's unrelated fields
 * (campaignName, startHour, etc.).
 */
export async function loginAsAdmin(page: Page, cfg: { adminUsername: string; adminPassword: string }) {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(cfg.adminUsername, cfg.adminPassword);
  await login.expectLoginSucceeded();
}
