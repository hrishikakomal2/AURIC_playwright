import { Locator, Page } from '@playwright/test';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * This environment's date-range fields use ngx-bootstrap's `bsDaterangepicker` (a real calendar
 * widget, not a typeable text field — verified live: typing into the input does nothing) instead
 * of the existing suite's antd Start date / End date text inputs. Own copy for this environment
 * — see apr-new-app/README.md "Isolation from the existing suite".
 *
 * Selects `startDate`..`endDate` (YYYY-MM-DD) by opening the calendar from `input`, navigating to
 * each date's month via the ‹/› controls, and clicking its day cell. Left open afterward — some
 * call sites also need to close a surrounding dropdown/dialog.
 */
export async function pickDateRange(page: Page, input: Locator, startDate: string, endDate: string) {
  await input.click();
  const picker = page.locator('bs-daterangepicker-container');
  await picker.waitFor({ state: 'visible', timeout: 10000 });

  await navigateCalendarToMonth(picker, startDate);
  await clickCalendarDay(picker, startDate);

  await navigateCalendarToMonth(picker, endDate);
  await clickCalendarDay(picker, endDate);

  await page.waitForTimeout(300);
}

async function navigateCalendarToMonth(picker: Locator, dateIso: string) {
  const [targetYear, targetMonth] = dateIso.split('-').map(Number);
  for (let i = 0; i < 36; i++) {
    const monthText = ((await picker.locator('button.current').first().textContent()) ?? '').trim();
    const yearText = ((await picker.locator('button.current').nth(1).textContent()) ?? '').trim();
    const curMonth = MONTH_NAMES.indexOf(monthText) + 1;
    const curYear = Number(yearText);
    if (curMonth === targetMonth && curYear === targetYear) return;
    const forward = targetYear * 12 + targetMonth > curYear * 12 + curMonth;
    await picker.locator(forward ? 'button.next' : 'button.previous').first().click();
    await picker.page().waitForTimeout(150);
  }
  throw new Error(`Could not navigate the date-range calendar to ${dateIso}`);
}

async function clickCalendarDay(picker: Locator, dateIso: string) {
  // Adjacent-month filler days (marked `.is-other-month`) can share the same day number as the
  // target month's real cells — verified live (e.g. the last row of August's grid shows
  // September's 1-5) — so they must be excluded rather than just taking the first text match.
  const day = String(Number(dateIso.split('-')[2]));
  const cell = picker.locator('span[bsdatepickerdaydecorator]:not(.is-other-month)', { hasText: new RegExp(`^${day}$`) }).first();
  await cell.click();
}
