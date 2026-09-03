import { test, expect } from '@playwright/test';
import { login } from '../helpers';

test.describe('Working Hours Settings (Availability > Working hours)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/client/ivr/non-working-hours');
    await expect(page.getByRole('heading', { name: 'Working Hours Settings' })).toBeVisible();
  });

  test('Negative: "Welcome Greeting" and "Working time window" should be disabled when Enable After hours is OFF [BUG]', async ({ page }) => {
    // Expected: with Enable After hours OFF, every dependent field — Welcome Greeting, the
    // Working time window, and the Call settings toggles below — should be disabled, the same
    // way the Call settings toggles already correctly are.
    // Live-verified actual behavior: "Welcome Greeting" and "Working time window" stay fully
    // interactive (not disabled) regardless of the Enable After hours state.
    const enableAfterHours = page.locator('button.ant-switch').nth(0);
    if ((await enableAfterHours.getAttribute('aria-checked')) === 'true') {
      await enableAfterHours.click();
    }
    await expect(enableAfterHours).toHaveAttribute('aria-checked', 'false');

    const welcomeGreeting = page.locator('div[name="media"]');
    await expect(welcomeGreeting).toHaveClass(/disabled/);

    const timeInputs = page.locator('input[placeholder="Select time"]');
    await expect(timeInputs.nth(0)).toBeDisabled();
    await expect(timeInputs.nth(1)).toBeDisabled();
  });
});
