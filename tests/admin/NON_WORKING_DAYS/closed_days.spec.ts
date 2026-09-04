import { test, expect } from '@playwright/test';
import { login, nonWorkingHoursToggleByLabel, nonWorkingDayCheckbox } from '../helpers';

test.describe('Closed Days Settings (Availability > Closed Days)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/client/ivr/non-working-days');
    await expect(page.getByRole('heading', { name: 'Closed days Settings' })).toBeVisible();
  });

  test('Negative: "Welcome Greeting" and "Set Non Working Days" should be disabled when Enable Closed days is OFF [BUG]', async ({ page }) => {
    // Expected: with Enable Closed days OFF, every dependent field — Welcome Greeting, the
    // day-of-week checkboxes, and the Call settings toggles below — should be disabled, the same
    // way the Call settings toggles already correctly are.
    // Live-verified actual behavior: "Welcome Greeting" stays selectable and the day checkboxes
    // stay clickable (e.g. Tuesday can still be checked) regardless of the Enable Closed days
    // state. Mirrors the identical bug on the Working Hours page.
    const enableClosedDays = page.locator('button.ant-switch').nth(0);
    if ((await enableClosedDays.getAttribute('aria-checked')) === 'true') {
      await enableClosedDays.click();
    }
    await expect(enableClosedDays).toHaveAttribute('aria-checked', 'false');

    const welcomeGreeting = page.locator('div[name="media"]');
    await expect(welcomeGreeting).toHaveClass(/disabled/);

    const tuesday = nonWorkingDayCheckbox(page, 'TUESDAY');
    await expect(tuesday).not.toHaveClass(/is-checked/);
    await tuesday.click();
    await expect(tuesday).not.toHaveClass(/is-checked/);
  });

  test('Negative: enabling "Redirect call to AI Agent" should turn off "Early media announcement", not on [BUG]', async ({ page }) => {
    // Expected: the three Call settings toggles (Redirect to voicemail / Redirect to AI Agent /
    // Early media announcement) are mutually exclusive, the same way voicemail<->AI Agent and
    // voicemail<->Early media already correctly turn each other off. This section shares markup
    // with the Working Hours page, which has the identical bug.
    // Live-verified actual behavior: turning on "Redirect call to AI Agent" also turns ON "Early
    // media announcement" (instead of off), leaving both enabled at the same time.
    const enableClosedDays = page.locator('button.ant-switch').nth(0);
    if ((await enableClosedDays.getAttribute('aria-checked')) !== 'true') {
      await enableClosedDays.click();
    }
    await expect(enableClosedDays).toHaveAttribute('aria-checked', 'true');

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

  test('Negative: Save requires at least one non-working day', async ({ page }) => {
    // Confirms correct validation: unchecking every day and clicking Save is blocked with an
    // inline error rather than silently saving an empty selection.
    const enableClosedDays = page.locator('button.ant-switch').nth(0);
    if ((await enableClosedDays.getAttribute('aria-checked')) !== 'true') {
      await enableClosedDays.click();
    }

    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const originallyChecked: string[] = [];
    for (const day of days) {
      const checkbox = nonWorkingDayCheckbox(page, day);
      if (await checkbox.evaluate((el) => el.classList.contains('is-checked'))) {
        originallyChecked.push(day);
        await checkbox.click();
      }
    }

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Please select at least one non-working day')).toBeVisible();

    // Restore whichever days were originally checked so the suite leaves this page unsaved/unchanged.
    for (const day of originallyChecked) {
      await nonWorkingDayCheckbox(page, day).click();
    }
  });
});
