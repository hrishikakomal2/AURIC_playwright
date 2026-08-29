import { Page } from '@playwright/test';
import { NewAppConfig } from '../config';
import { LoginPage } from '../pages/LoginPage';

/** Logs in as the configured account and asserts the dashboard loaded. Own copy for this environment. */
export async function loginAsAdmin(page: Page, cfg: NewAppConfig) {
  const login = new LoginPage(page, cfg.baseUrl);
  await login.goto();
  await login.login(cfg.username, cfg.password);
  await login.expectLoginSucceeded();
}
