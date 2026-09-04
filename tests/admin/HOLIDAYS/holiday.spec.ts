import { test, expect } from '@playwright/test';
import {
  login,
  gotoHolidays,
  fillHolidayForm,
  clickHolidaySave,
  expectHolidaySaved,
  deleteHolidayByName,
  uniqueHolidayName,
} from '../helpers';

/** Returns a date `daysAhead` days from today, formatted YYYY-MM-DD. */
function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

test.describe('Holidays Settings (Availability > Holidays)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoHolidays(page);
  });

  test('Negative: "Please select a date" feedback is silently dropped when other required fields are also empty [BUG]', async ({ page }) => {
    // Expected: Select date is just as required as Holiday name and Select Media, so leaving all
    // three empty should surface feedback for all three when Save is blocked.
    // Live-verified actual behavior: only Holiday name and Select Media get an inline error here —
    // Select date gets no feedback at all in this combined-error case, even though the dedicated
    // date-only test below confirms it does show a toast when it's the sole invalid field. A user
    // who fixes name and media but not date sees no indication date is still required.
    await clickHolidaySave(page);

    await expect(page.getByText('Required')).toBeVisible();
    await expect(page.getByText('Please select a media file')).toBeVisible();
    await expect(page.getByText('Please select a date')).not.toBeVisible();
  });

  test('Negative: leaving only the date empty shows a "Please select a date" toast', async ({ page }) => {
    // Unlike Holiday name and Select Media (persistent inline errors), Select date's required
    // error is a transient toast notification, and only appears when it's the sole invalid
    // field (see the test above for the combined-error case, where it's silently omitted).
    await page.locator('input[name="name"]').fill(uniqueHolidayName());
    await page.locator('div[name="media"]').click();
    await page.keyboard.type('Queue hold');
    await page.keyboard.press('Enter');

    await clickHolidaySave(page);
    await expect(page.getByText('Please select a date')).toBeVisible();
  });

  test('Positive: creating a holiday adds it to the "All Holidays" list', async ({ page }) => {
    const name = uniqueHolidayName();
    const date = futureDate(30);

    try {
      await fillHolidayForm(page, { name, date, media: 'Queue hold' });
      await clickHolidaySave(page);
      await expectHolidaySaved(page);

      const row = page.locator('tr', { hasText: name });
      await expect(row).toBeVisible();
      await expect(row).toContainText(date);
    } finally {
      await deleteHolidayByName(page, name);
    }
  });

  test('Negative: a past date is accepted with no validation error [BUG]', async ({ page }) => {
    // Expected: a holiday date in the past should be rejected — it can never trigger call
    // routing since the date has already passed.
    // Live-verified actual behavior: the date field accepts a past date with no error, and Save
    // succeeds, creating a holiday that will never take effect.
    const name = uniqueHolidayName('QA Past Holiday');
    const pastDate = '2020-01-01';

    try {
      await fillHolidayForm(page, { name, date: pastDate, media: 'Queue hold' });
      const dateInput = page.locator('input[name="holidayDate"]');
      await expect(dateInput).toHaveValue(pastDate);

      await clickHolidaySave(page);
      await expectHolidaySaved(page);
    } finally {
      await deleteHolidayByName(page, name);
    }
  });

  test('Negative: enabling "Redirect call to AI Agent" requires selecting an agent', async ({ page }) => {
    // Confirms correct validation: unlike the past-date field, this one properly blocks Save.
    const name = uniqueHolidayName('QA AI Agent Holiday');
    await fillHolidayForm(page, { name, date: futureDate(30), media: 'Queue hold' });

    await page.locator('button.ant-switch').first().click();
    await clickHolidaySave(page);

    await expect(page.getByText('Please select an AI agent')).toBeVisible();
  });
});
