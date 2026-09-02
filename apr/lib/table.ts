import { Locator } from '@playwright/test';

export interface TableRow {
  [column: string]: string;
}

/**
 * Waits until `rows`'s count stops changing across a few consecutive checks before proceeding —
 * `table.waitFor({ state: 'visible' })` only confirms the table shell exists, not that every row
 * has finished streaming in. Observed live: reading immediately after "visible" can grab a
 * partial row set (e.g. an 8-hour report read back with only 6 rows, silently dropping real
 * duration data) on a page that renders rows asynchronously after the table itself appears.
 *
 * A stable count of ZERO is deliberately NOT trusted early: right after applying a filter, the
 * table can show a brief empty/loading state before real rows stream in, and 0 staying constant
 * for a few checks looks identical to a genuinely empty result. Observed live: this caused a call
 * log with real rows to be read back as 0 rows. So a zero count keeps polling for the full
 * `timeoutMs` budget — only trusted if nothing ever appears by then — while any nonzero count that
 * stabilizes still returns immediately, same as before.
 */
async function waitForStableRowCount(rows: Locator, opts: { checks: number; intervalMs: number; timeoutMs: number } = { checks: 3, intervalMs: 200, timeoutMs: 5000 }) {
  const start = Date.now();
  let lastCount = -1;
  let stableStreak = 0;
  while (Date.now() - start < opts.timeoutMs) {
    const count = await rows.count();
    if (count === lastCount) {
      stableStreak++;
      if (stableStreak >= opts.checks && count > 0) return;
    } else {
      stableStreak = 0;
      lastCount = count;
    }
    await rows.page().waitForTimeout(opts.intervalMs);
  }
}

/**
 * Selects the largest available page size before pagination begins, to minimize the number of
 * "next page" clicks a large result set needs — confirmed live: the Calls page (CDR) can return
 * 1300+ rows at the default page size of 10, needing ~130 next-page clicks that blow past a
 * normal test timeout (one such click hung/timed out around page 127). Handles both pagination
 * UIs this app uses (see findNextButton below): the custom "figma-pagination" component's select
 * and antd's own built-in page-size changer. A no-op (not a failure) when neither is present —
 * e.g. a single-page result, or a page that doesn't expose a page-size control at all.
 */
async function selectLargestPageSize(scope: Locator): Promise<void> {
  const page = scope.page();
  const sizeSelect = scope.locator('.figma-pagination-select, .ant-pagination-options-size-changer').last();
  if (!(await sizeSelect.count())) return;

  try {
    await sizeSelect.click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await dropdown.waitFor({ state: 'visible', timeout: 5000 });

    const optionTexts = await dropdown.locator('.ant-select-item-option').allTextContents();
    const sizes = optionTexts.map((t) => parseInt(t.replace(/\D/g, ''), 10)).filter((n) => !Number.isNaN(n));
    if (sizes.length === 0) {
      await page.keyboard.press('Escape');
      return;
    }

    const maxSize = Math.max(...sizes);
    await dropdown.locator('.ant-select-item-option', { hasText: new RegExp(`^${maxSize}(\\D|$)`) }).first().click();
    await page.waitForTimeout(400);
  } catch {
    await page.keyboard.press('Escape').catch(() => {});
  }
}

/**
 * Reads every row of an antd `<table>` inside `scope`, across all pages (repeatedly clicking the
 * pagination "next" button until it's disabled), keyed by header text rather than column index —
 * resilient to the report adding, removing, or reordering columns.
 */
export async function readAntTableAllPages(scope: Locator): Promise<TableRow[]> {
  const table = scope.locator('table').first();
  await table.waitFor({ state: 'visible', timeout: 15000 });

  const headers = await table.locator('thead th').allTextContents();
  const columns = headers.map((h) => h.trim());

  await selectLargestPageSize(scope);

  const rows: TableRow[] = [];
  // Two different pagination UIs are used across this app's pages: antd's built-in
  // ant-table-pagination (a right-arrow button matching `[aria-label="right"]`), and a custom
  // "figma-pagination" component — confirmed live on the Calls page (33 total rows, only 10 per
  // page; the antd pagination element is present in the DOM but empty/unused there, so the old
  // antd-only check silently stopped after page 1, dropping 23 real rows including the one call
  // with the Hold Time value this suite was supposed to be summing). The custom component's next
  // button has no distinguishing aria-label — it's identified by being the LAST of the two
  // `.figma-pagination-nav` buttons (prev is first, next is last, in DOM order).
  const findNextButton = async (): Promise<Locator | null> => {
    const antdNext = scope.locator('button:has([aria-label="right"])').last();
    if (await antdNext.count()) return antdNext;
    const customNext = scope.locator('.figma-pagination-nav').last();
    if (await customNext.count()) return customNext;
    return null;
  };
  // antd renders two non-data rows inside <tbody> that must not be read as real rows: a
  // zero-height "ant-table-measure-row" (used to measure column widths — its cells mirror the
  // header text) and an "ant-table-placeholder" row (the colspan-ed "No data" row shown when
  // the table is empty) — verified live against this app's actual empty-state markup.
  const bodyRowsLocator = () => table.locator('tbody tr:not(.ant-table-measure-row):not(.ant-table-placeholder)');

  // Safety cap: a real report should never legitimately paginate past this many pages.
  for (let page = 0; page < 1000; page++) {
    await waitForStableRowCount(bodyRowsLocator());
    const bodyRows = bodyRowsLocator();
    const count = await bodyRows.count();
    if (count > 0) {
      // Reads every row's cells in a single round trip (evaluateAll) rather than one
      // `.allTextContents()` call per row — confirmed live: on the Calls (CDR) page, ~1900 rows
      // read one-row-at-a-time blew past this suite's test timeout even after paginating at the
      // largest page size, since each row was its own browser round trip.
      const rowsCells = await bodyRows.evaluateAll((trs) => trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim())));
      rowsCells.forEach((cells) => {
        const row: TableRow = {};
        columns.forEach((col, idx) => {
          row[col] = cells[idx] ?? '';
        });
        rows.push(row);
      });
    }

    const nextButton = await findNextButton();
    if (!nextButton) break;
    const disabled = await nextButton.isDisabled().catch(() => true);
    if (disabled) break;
    await nextButton.click();
    await scope.page().waitForTimeout(400);
  }

  return rows;
}
