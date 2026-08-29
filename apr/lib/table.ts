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
 * Reads every row of an antd `<table>` inside `scope`, across all pages (repeatedly clicking the
 * pagination "next" button until it's disabled), keyed by header text rather than column index —
 * resilient to the report adding, removing, or reordering columns.
 */
export async function readAntTableAllPages(scope: Locator): Promise<TableRow[]> {
  const table = scope.locator('table').first();
  await table.waitFor({ state: 'visible', timeout: 15000 });

  const headers = await table.locator('thead th').allTextContents();
  const columns = headers.map((h) => h.trim());

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
    for (let i = 0; i < count; i++) {
      const cells = await bodyRows.nth(i).locator('td').allTextContents();
      const row: TableRow = {};
      columns.forEach((col, idx) => {
        row[col] = (cells[idx] ?? '').trim();
      });
      rows.push(row);
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
