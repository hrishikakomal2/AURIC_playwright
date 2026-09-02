import { test, expect, Page, Locator } from '@playwright/test';
import { login, gotoQueueList } from '../helpers';

/**
 * Queue (IVR Management > Queue) — "Filter" button/dialog and the "Search by queue name" box.
 * Read-only: applies filters/searches and asserts on the resulting list, never creates or deletes
 * queues. Confirmed live against the Filter Queues dialog (Date Range / Algorithm / Call Waiting
 * Type + Clear all/Cancel/Apply filters buttons) — see queue_creation.spec.ts for the same app's
 * Create Queue form, which documents the Algorithm options this filter reuses.
 *
 * Assertions are written to hold regardless of which queues currently exist (never hardcoded to
 * "exactly N rows") — every test instead asserts that every VISIBLE row satisfies the applied
 * criteria, since the live queue list is shared/mutable across suites (e.g. delete_queue.spec.ts).
 */

const ALGORITHMS = ['Even Call Distribution', 'Random', 'Serial Hunting', 'Parallel Ringing', 'Round Robin'];
const CALL_WAITING_TYPES: Record<string, string> = { 'Wait Time': 'wait_time', 'Queue Retry': 'queue_retry' };

/** Real data rows only — see delete_queue.spec.ts for why the antd measure-row must be excluded. */
function queueRows(page: Page) {
  return page.locator('tbody tr:not(.ant-table-measure-row):not(.ant-table-placeholder)');
}

/**
 * Waits until `rows`'s count stops changing across a few consecutive checks — same fix
 * delete_queue.spec.ts and apr/lib/table.ts use. `gotoQueueList` only waits for the "Create Queue"
 * button to render, not for the table's row data to finish fetching, so reading the count
 * immediately after navigating (or after a search/filter change) can catch a transient
 * empty/partial state. A count of zero is deliberately NOT trusted early.
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
): Promise<{ name: string; algorithm: string; callWaitingType: string; createDate: string }[]> {
  const rows = queueRows(page);
  await waitForStableRowCount(rows);
  const count = await rows.count();
  const result = [];
  for (let i = 0; i < count; i++) {
    const cells = rows.nth(i).locator('td');
    result.push({
      name: (await cells.nth(0).innerText()).trim(),
      algorithm: (await cells.nth(2).innerText()).trim(),
      callWaitingType: (await cells.nth(3).innerText()).trim(),
      // "Create date time" cell looks like "2026-05-19 07:34" — the leading YYYY-MM-DD compares
      // correctly with plain string comparison for range checks.
      createDate: (await cells.nth(4).innerText()).trim().slice(0, 10),
    });
  }
  return result;
}

function noDataMessage(page: Page) {
  return page.getByText('No data');
}

function filterButton(page: Page) {
  return page.getByRole('button', { name: 'Filter' });
}

async function openFilterDialog(page: Page) {
  await filterButton(page).click();
  await expect(page.getByRole('heading', { name: 'Filter Queues' })).toBeVisible();
}

/** Selects `optionText` in the antd Select identified by its `name` attribute (algorithm/callWaitingType). */
async function selectFilterOption(page: Page, selectName: string, optionText: string) {
  await page.locator(`div[name="${selectName}"]`).click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
  await dropdown.waitFor({ state: 'visible' });
  await dropdown.locator('.ant-select-item-option', { hasText: optionText }).first().click();
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
  await expect(page.getByRole('heading', { name: 'Filter Queues' })).toBeHidden();
}

async function cancelFilterDialog(page: Page) {
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Filter Queues' })).toBeHidden();
}

async function clearAllFilters(page: Page) {
  await page.getByRole('button', { name: 'Clear all' }).click();
}

test.describe('Queue (IVR Management > Queue) — Filter and Search', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoQueueList(page);
  });

  test('01 Filter dialog shows Date Range, Algorithm, and Call Waiting Type controls', async ({ page }) => {
    await openFilterDialog(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Date Range', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Start date')).toBeVisible();
    await expect(page.getByPlaceholder('End date')).toBeVisible();
    await expect(dialog.getByText('Algorithm', { exact: true })).toBeVisible();
    await expect(page.locator('div[name="algorithm"]')).toBeVisible();
    await expect(dialog.getByText('Call Waiting Type', { exact: true })).toBeVisible();
    await expect(page.locator('div[name="callWaitingType"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear all' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible();
  });

  test('02 Algorithm dropdown offers all five documented options', async ({ page }) => {
    await openFilterDialog(page);
    await page.locator('div[name="algorithm"]').click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    for (const algorithm of ALGORITHMS) {
      await expect(dropdown.locator('.ant-select-item-option', { hasText: algorithm })).toBeVisible();
    }
  });

  test('03 Call Waiting Type dropdown offers both documented options', async ({ page }) => {
    await openFilterDialog(page);
    await page.locator('div[name="callWaitingType"]').click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    for (const type of Object.keys(CALL_WAITING_TYPES)) {
      await expect(dropdown.locator('.ant-select-item-option', { hasText: type })).toBeVisible();
    }
  });

  for (const algorithm of ALGORITHMS) {
    test(`04 Filtering by Algorithm = "${algorithm}" shows only matching queues`, async ({ page }) => {
      await openFilterDialog(page);
      await selectFilterOption(page, 'algorithm', algorithm);
      await applyFilters(page);

      const rows = await rowTexts(page);
      if (rows.length === 0) {
        await expect(noDataMessage(page)).toBeVisible();
      } else {
        for (const row of rows) expect(row.algorithm).toBe(algorithm);
      }
    });
  }

  for (const [label, rawValue] of Object.entries(CALL_WAITING_TYPES)) {
    test(`05 Filtering by Call Waiting Type = "${label}" shows only matching queues`, async ({ page }) => {
      await openFilterDialog(page);
      await selectFilterOption(page, 'callWaitingType', label);
      await applyFilters(page);

      const rows = await rowTexts(page);
      if (rows.length === 0) {
        await expect(noDataMessage(page)).toBeVisible();
      } else {
        for (const row of rows) expect(row.callWaitingType).toBe(rawValue);
      }
    });
  }

  test('06 Combining Algorithm and Call Waiting Type filters narrows to queues matching both (AND logic)', async ({ page }) => {
    await openFilterDialog(page);
    await selectFilterOption(page, 'algorithm', 'Serial Hunting');
    await selectFilterOption(page, 'callWaitingType', 'Queue Retry');
    await applyFilters(page);

    const rows = await rowTexts(page);
    if (rows.length === 0) {
      await expect(noDataMessage(page)).toBeVisible();
    } else {
      for (const row of rows) {
        expect(row.algorithm).toBe('Serial Hunting');
        expect(row.callWaitingType).toBe('queue_retry');
      }
    }
  });

  test('07 Filtering by Date Range only shows queues created within that range', async ({ page }) => {
    const allRows = await rowTexts(page);
    test.skip(allRows.length === 0, 'No queues exist to test a date range against');

    // Narrow the range to exclude the earliest-created queue, so the filter has visible work to
    // do rather than trivially matching everything.
    const sortedDates = allRows.map((r) => r.createDate).sort();
    const startDate = sortedDates[Math.floor(sortedDates.length / 2)];
    const endDate = sortedDates[sortedDates.length - 1];

    await openFilterDialog(page);
    await setFilterDateRange(page, startDate, endDate);
    await applyFilters(page);

    const rows = await rowTexts(page);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.createDate >= startDate && row.createDate <= endDate).toBe(true);
    }
  });

  test('08 A Date Range with no queues in it shows the "No data" empty state', async ({ page }) => {
    await openFilterDialog(page);
    // 2020 predates every queue this app has ever shown live — a safe guaranteed-empty range.
    await setFilterDateRange(page, '2020-01-01', '2020-01-02');
    await applyFilters(page);

    await expect(noDataMessage(page)).toBeVisible();
    await expect(queueRows(page)).toHaveCount(0);
  });

  test('09 Applying a filter shows an active-filter count badge on the Filter button', async ({ page }) => {
    await openFilterDialog(page);
    await selectFilterOption(page, 'algorithm', 'Serial Hunting');
    await applyFilters(page);

    await expect(filterButton(page)).toContainText('1');
  });

  test('10 Cancel discards an unsaved field change, leaving the previously applied filter intact', async ({ page }) => {
    await openFilterDialog(page);
    await selectFilterOption(page, 'algorithm', 'Serial Hunting');
    await applyFilters(page);

    const rowsAfterApply = await rowTexts(page);

    await openFilterDialog(page);
    await selectFilterOption(page, 'callWaitingType', 'Wait Time');
    await cancelFilterDialog(page);

    const rowsAfterCancel = await rowTexts(page);
    expect(rowsAfterCancel).toEqual(rowsAfterApply);
    await expect(filterButton(page)).toContainText('1');
  });

  test('11 "Clear all" resets the list immediately, even before Apply filters is clicked, and survives closing via Cancel', async ({ page }) => {
    await openFilterDialog(page);
    await selectFilterOption(page, 'algorithm', 'Serial Hunting');
    await applyFilters(page);

    await openFilterDialog(page);
    await clearAllFilters(page);
    // Confirmed live: the underlying list updates the instant "Clear all" is clicked, without
    // needing "Apply filters" — the dialog is still open here.
    await waitForStableRowCount(queueRows(page));
    const countWhileDialogOpen = await queueRows(page).count();

    await cancelFilterDialog(page);
    await waitForStableRowCount(queueRows(page));
    const countAfterCancel = await queueRows(page).count();

    expect(countAfterCancel).toBe(countWhileDialogOpen);
    await expect(filterButton(page)).not.toContainText(/\d/);

    // Reopening confirms both fields are back to their placeholder state.
    await openFilterDialog(page);
    await expect(page.locator('div[name="algorithm"]')).toContainText('All algorithms');
    await expect(page.locator('div[name="callWaitingType"]')).toContainText('All types');
  });

  test('12 Search by queue name is case-insensitive and matches substrings', async ({ page }) => {
    const rowsBefore = await rowTexts(page);
    test.skip(rowsBefore.length === 0, 'No queues exist to search for');

    const target = rowsBefore[0].name;
    const needle = target.slice(0, Math.max(3, Math.floor(target.length / 2)));

    await page.locator('input[placeholder="Search by queue name"]').fill(needle.toUpperCase());
    await page.waitForTimeout(600);

    const rowsAfter = await rowTexts(page);
    expect(rowsAfter.length).toBeGreaterThan(0);
    for (const row of rowsAfter) {
      expect(row.name.toLowerCase()).toContain(needle.toLowerCase());
    }
    expect(rowsAfter.some((r) => r.name === target)).toBe(true);
  });

  test('13 Search with no matches shows the "No data" empty state', async ({ page }) => {
    await page.locator('input[placeholder="Search by queue name"]').fill('zzz-no-such-queue-zzz');
    await page.waitForTimeout(600);

    await expect(noDataMessage(page)).toBeVisible();
    await expect(queueRows(page)).toHaveCount(0);
  });

  test('14 Filter and Search combine (both conditions must match)', async ({ page }) => {
    const allRows = await rowTexts(page);
    test.skip(allRows.length === 0, 'No queues exist to test a combined filter+search against');

    const target = allRows[0];
    await openFilterDialog(page);
    await selectFilterOption(page, 'algorithm', target.algorithm);
    await applyFilters(page);

    await page.locator('input[placeholder="Search by queue name"]').fill(target.name);
    await page.waitForTimeout(600);

    const rows = await rowTexts(page);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.algorithm).toBe(target.algorithm);
      expect(row.name.toLowerCase()).toContain(target.name.toLowerCase());
    }
  });
});
