import { test, expect } from '@playwright/test';
import { login, setTimePickerValue, nonWorkingHoursToggleByLabel } from '../helpers';

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

  test('Negative: "Working time window" end time should be later than the start time [BUG]', async ({ page }) => {
    // Expected: setting an end time earlier than the start time (e.g. start 03:30, end 01:30)
    // should be rejected with a validation error, and Save should not succeed.
    // Live-verified actual behavior: the field silently accepts it, reinterprets it as an
    // overnight window wrapping past midnight (shown as "22 HOURS" instead of a rejection), and
    // Save succeeds with a "Settings saved" toast — no validation prevents end <= start.
    const timeInputs = page.locator('input[placeholder="Select time"]');
    const startInput = timeInputs.nth(0);
    const endInput = timeInputs.nth(1);
    const saveButton = page.getByRole('button', { name: 'Save', exact: true });

    const originalStart = await startInput.inputValue(); // e.g. "03:30"
    const [origEndHh, origEndMm] = (await endInput.inputValue()).split(':'); // e.g. "12:30"

    try {
      await setTimePickerValue(page, endInput, '01', '30');
      await expect(endInput).toHaveValue('01:30');
      await expect(startInput).toHaveValue(originalStart); // end moved, not start
      await expect(page.getByText('22 HOURS')).toBeVisible();

      await saveButton.click();
      await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 15000 });
    } finally {
      // Restore the original window so the suite leaves this page's state unchanged.
      await setTimePickerValue(page, endInput, origEndHh, origEndMm);
      await expect(startInput).toHaveValue(originalStart);
      await saveButton.click();
      await expect(page.getByText('Settings saved')).toBeVisible({ timeout: 15000 });
    }
  });

  test('Negative: enabling "Redirect call to AI Agent" should turn off "Early media announcement", not on [BUG]', async ({ page }) => {
    // Expected: the three Call settings toggles (Redirect to voicemail / Redirect to AI Agent /
    // Early media announcement) are mutually exclusive, the same way voicemail<->AI Agent and
    // voicemail<->Early media already correctly turn each other off.
    // Live-verified actual behavior: turning on "Redirect call to AI Agent" also turns ON "Early
    // media announcement" (instead of off), leaving both enabled at the same time.
    const enableAfterHours = page.locator('button.ant-switch').nth(0);
    if ((await enableAfterHours.getAttribute('aria-checked')) !== 'true') {
      await enableAfterHours.click();
    }
    await expect(enableAfterHours).toHaveAttribute('aria-checked', 'true');

    const voicemail = nonWorkingHoursToggleByLabel(page, 'Redirect call to voicemail');
    const aiAgent = nonWorkingHoursToggleByLabel(page, 'Redirect call to AI Agent');
    const earlyMedia = nonWorkingHoursToggleByLabel(page, 'Early media announcement');

    // Start from a known baseline: all three off.
    for (const toggle of [voicemail, aiAgent, earlyMedia]) {
      if ((await toggle.getAttribute('aria-checked')) === 'true') {
        await toggle.click();
      }
    }

    await aiAgent.click();
    await expect(aiAgent).toHaveAttribute('aria-checked', 'true');
    await expect(voicemail).toHaveAttribute('aria-checked', 'false');
    await expect(earlyMedia).toHaveAttribute('aria-checked', 'false');
  });
});
