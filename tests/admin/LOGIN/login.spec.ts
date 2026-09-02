import { test, expect } from '@playwright/test';

test.describe('AURIC login', () => {
  test('logs in with valid credentials and reaches the dashboard', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[name="username"]').fill(process.env.TEST_EMAIL!);
    await page.locator('input[name="password"]').fill(process.env.TEST_PASSWORD!);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/client\/live-dashboard/, { timeout: 15000 });
  });

  test('shows an error for invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[name="username"]').fill('invalid_user');
    await page.locator('input[name="password"]').fill('wrong_password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).not.toHaveURL(/\/client\/live-dashboard/);
  });
});
