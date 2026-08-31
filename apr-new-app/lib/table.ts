import { Locator } from '@playwright/test';

export interface TableRow {
  [column: string]: string;
}

/**
 * Reads every row of an antd `<table>` inside `scope`, across all pages, keyed by header text.
 * Own copy for this environment — see apr-new-app/README.md "Isolation from the existing suite".
 */
export async function readAntTableAllPages(scope: Locator): Promise<TableRow[]> {
  // This environment's account has a hidden `<table class="team-status-table">` widget rendered
  // earlier in the DOM on every page (verified live) — `:visible` skips it rather than reading it
  // as the target table.
  const table = scope.locator('table:visible').first();
  await table.waitFor({ state: 'visible', timeout: 15000 });

  // Some tables on this account render a grouped 2-row `<thead>` (a category row spanning
  // multiple columns via colspan, then the real per-column names below — verified live: e.g.
  // "Total | Average | Inbound | ..." over "Sl. No | Agent ID | Agent | ..."). Reading every `th`
  // across both rows would combine them into one misaligned column list; the leaf/real column
  // names are always the *last* header row, whether there's 1 header row or several.
  const headers = await table.locator('thead tr').last().locator('th').allTextContents();
  const columns = headers.map((h) => h.trim());

  const rows: TableRow[] = [];
  const nextButton = scope.locator('button:has([aria-label="right"])').last();

  for (let page = 0; page < 1000; page++) {
    const bodyRows = table.locator('tbody tr:not(.ant-table-measure-row):not(.ant-table-placeholder)');
    const count = await bodyRows.count();
    for (let i = 0; i < count; i++) {
      const cells = await bodyRows.nth(i).locator('td').allTextContents();
      const row: TableRow = {};
      columns.forEach((col, idx) => {
        row[col] = (cells[idx] ?? '').trim();
      });
      rows.push(row);
    }

    const hasNext = await nextButton.count();
    if (!hasNext) break;
    const disabled = await nextButton.isDisabled().catch(() => true);
    if (disabled) break;
    await nextButton.click();
    await scope.page().waitForTimeout(400);
  }

  return rows;
}
