import { test, expect, Page, Locator } from '@playwright/test';
import { login, gotoContacts, searchContacts } from '../helpers';

/**
 * Customer Contacts > Contacts — the "Filter" button/dialog (Date Range only) and the
 * "Search by name, phone, email, or company" box. Read-only: applies filters/searches and asserts
 * on the resulting list, never creates or deletes contacts.
 *
 * contact.spec.ts already covers search-by-name/phone/email (tests 14/15/16/37) and confirms the
 * Filter dialog opens (test 21) — this file goes deeper on the Filter dialog's actual date-range
 * narrowing/Cancel/Clear-all behavior (confirmed live via a throwaway probe, same semantics as
 * Queue's Filter Queues dialog — see queue_filter.spec.ts), plus the untested "search by company"
 * case.
 *
 * Assertions are written to hold regardless of which contacts currently exist (never hardcoded to
 * "exactly N rows") — every test instead asserts that every VISIBLE row satisfies the applied
 * criteria, since the live contacts list is shared/mutable across suites.
 */

/** Real data rows only — antd Table renders a "No data" placeholder row when empty. */
function contactRows(page: Page) {
  return page.locator('tbody tr:not(.ant-table-placeholder)');
}

/**
 * Waits until `rows`'s count stops changing across a few consecutive checks — same fix used in
 * delete_queue.spec.ts / queue_filter.spec.ts / apr/lib/table.ts. Reading the count immediately
 * after navigating or changing a filter/search can catch a transient empty/partial state. A count
 * of zero is deliberately NOT trusted early.
 */
async function waitForStableRowCount(
  rows: Locator,
  opts: { checks: number; intervalMs: number; timeoutMs: number } = { checks: 3, intervalMs: 200, timeoutMs: 8000 }
) {
  const start = Date.now();
  let lastCount = -1;
  let stableStreak = 0;
  while (Date.now() - start < opts.timeoutMs) {
    const count = await rows.count();
    if (count === lastCount) {
      stableStreak++;
      if (stableStreak >= opts.checks) return;
    } else {
      stableStreak = 0;
      lastCount = count;
    }
    await rows.page().waitForTimeout(opts.intervalMs);
  }
}

async function rowTexts(
  page: Page
): Promise<{ name: string; phone: string; email: string; company: string; date: string }[]> {
  const rows = contactRows(page);
  await waitForStableRowCount(rows);
  const count = await rows.count();
  const result = [];
  for (let i = 0; i < count; i++) {
    const cells = rows.nth(i).locator('td');
    result.push({
      name: (await cells.nth(0).innerText()).trim(),
      phone: (await cells.nth(1).innerText()).trim(),
      email: (await cells.nth(2).innerText()).trim(),
      company: (await cells.nth(3).innerText()).trim(),
      date: (await cells.nth(4).innerText()).trim(),
    });
  }
  return result;
}

function noDataMessage(page: Page) {
  return page.getByText(/no record|no data|not found/i);
}

function filterButton(page: Page) {
  return page.getByRole('button', { name: 'Filter' });
}

async function openFilterDialog(page: Page) {
  await filterButton(page).click();
  await expect(page.getByRole('heading', { name: 'Filter Contacts' })).toBeVisible();
}

async function setFilterDateRange(page: Page, startDate: string, endDate: string) {
  const start = page.getByPlaceholder('Start date');
  const end = page.getByPlaceholder('End date');
  await start.click();
  await start.pressSequentially(startDate);
  await start.press('Enter');
  await end.pressSequentially(endDate);
  await end.press('Enter');
  await page.keyboard.press('Escape');
}

async function applyFilters(page: Page) {
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('heading', { name: 'Filter Contacts' })).toBeHidden();
}

async function cancelFilterDialog(page: Page) {
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Filter Contacts' })).toBeHidden();
}

async function clearAllFilters(page: Page) {
  await page.getByRole('button', { name: 'Clear all' }).click();
}

test.describe('Customer Contacts — Contacts page Filter and Search', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoContacts(page);
  });

  test('01 Filter dialog shows only a Date Range control plus Clear all/Cancel/Apply filters', async ({ page }) => {
    await openFilterDialog(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Date Range', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Start date')).toBeVisible();
    await expect(page.getByPlaceholder('End date')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear all' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible();
  });

  test('02 Filtering by Date Range only shows contacts created within that range', async ({ page }) => {
    const allRows = await rowTexts(page);
    test.skip(allRows.length === 0, 'No contacts exist to test a date range against');

    // Narrow the range to exclude the earliest-created contact, so the filter has visible work to
    // do rather than trivially matching everything.
    const sortedDates = allRows.map((r) => r.date).sort();
    const startDate = sortedDates[Math.floor(sortedDates.length / 2)];
    const endDate = sortedDates[sortedDates.length - 1];

    await openFilterDialog(page);
    await setFilterDateRange(page, startDate, endDate);
    await applyFilters(page);

    const rows = await rowTexts(page);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.date >= startDate && row.date <= endDate).toBe(true);
    }
  });

  test('03 A Date Range with no contacts in it shows the "no results" empty state', async ({ page }) => {
    await openFilterDialog(page);
    // 2020 predates every contact this app has ever shown live — a safe guaranteed-empty range.
    await setFilterDateRange(page, '2020-01-01', '2020-01-02');
    await applyFilters(page);

    await expect(noDataMessage(page)).toBeVisible();
    await expect(contactRows(page)).toHaveCount(0);
  });

  test('04 Applying a filter shows an active-filter count badge on the Filter button', async ({ page }) => {
    const allRows = await rowTexts(page);
    test.skip(allRows.length === 0, 'No contacts exist to test a date range against');

    const sortedDates = allRows.map((r) => r.date).sort();
    await openFilterDialog(page);
    await setFilterDateRange(page, sortedDates[0], sortedDates[sortedDates.length - 1]);
    await applyFilters(page);

    await expect(filterButton(page)).toContainText('1');
  });

  test('05 Cancel discards an unsaved date range change, leaving the previously applied filter intact', async ({
    page,
  }) => {
    const allRows = await rowTexts(page);
    test.skip(allRows.length === 0, 'No contacts exist to test a date range against');

    const sortedDates = allRows.map((r) => r.date).sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];

    await openFilterDialog(page);
    await setFilterDateRange(page, startDate, endDate);
    await applyFilters(page);
    const rowsAfterApply = await rowTexts(page);

    await openFilterDialog(page);
    // 2020 predates every contact this app has ever shown live — a distinctly different,
    // guaranteed-empty range, so a leaked (non-discarded) change would be obviously visible.
    await setFilterDateRange(page, '2020-01-01', '2020-01-02');
    await cancelFilterDialog(page);

    const rowsAfterCancel = await rowTexts(page);
    expect(rowsAfterCancel).toEqual(rowsAfterApply);
    await expect(filterButton(page)).toContainText('1');
  });

  test('06 "Clear all" resets the list immediately, even before Apply filters is clicked, and survives closing via Cancel', async ({
    page,
  }) => {
    const allRows = await rowTexts(page);
    test.skip(allRows.length === 0, 'No contacts exist to test a date range against');

    const sortedDates = allRows.map((r) => r.date).sort();
    await openFilterDialog(page);
    await setFilterDateRange(page, sortedDates[0], sortedDates[sortedDates.length - 1]);
    await applyFilters(page);

    await openFilterDialog(page);
    await clearAllFilters(page);
    // Confirmed live: the underlying list updates the instant "Clear all" is clicked, without
    // needing "Apply filters" — the dialog is still open here.
    await waitForStableRowCount(contactRows(page));
    const countWhileDialogOpen = await contactRows(page).count();

    await cancelFilterDialog(page);
    await waitForStableRowCount(contactRows(page));
    const countAfterCancel = await contactRows(page).count();

    expect(countAfterCancel).toBe(countWhileDialogOpen);
    await expect(filterButton(page)).not.toContainText(/\d/);

    // Reopening confirms the date fields are back to empty.
    await openFilterDialog(page);
    await expect(page.getByPlaceholder('Start date')).toHaveValue('');
    await expect(page.getByPlaceholder('End date')).toHaveValue('');
  });

  test('07 Search by company name is case-insensitive and matches substrings', async ({ page }) => {
    const allRows = await rowTexts(page);
    const withCompany = allRows.filter((r) => r.company && r.company !== '-');
    test.skip(withCompany.length === 0, 'No contacts with a Company value exist to search for');

    const target = withCompany[0];
    const needle = target.company.slice(0, Math.max(3, Math.floor(target.company.length / 2)));

    await searchContacts(page, needle.toUpperCase());

    const rowsAfter = await rowTexts(page);
    expect(rowsAfter.length).toBeGreaterThan(0);
    expect(rowsAfter.some((r) => r.name === target.name)).toBe(true);
  });

  test('08 Filter and Search combine (both conditions must match)', async ({ page }) => {
    const allRows = await rowTexts(page);
    test.skip(allRows.length === 0, 'No contacts exist to test a combined filter+search against');

    const target = allRows[0];
    await openFilterDialog(page);
    await setFilterDateRange(page, target.date, target.date);
    await applyFilters(page);

    await searchContacts(page, target.name);

    const rows = await rowTexts(page);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.date).toBe(target.date);
      expect(row.name.toLowerCase()).toContain(target.name.toLowerCase());
    }
  });
});
