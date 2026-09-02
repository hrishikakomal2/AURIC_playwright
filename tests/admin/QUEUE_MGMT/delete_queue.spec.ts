import * as dotenv from 'dotenv';
import * as path from 'path';

// Loaded explicitly (not the global `dotenv/config` import in playwright.config.ts, which only
// loads the root .env) so QUEUE_KEEP_NAMES stays scoped to this cleanup suite instead of living
// in the root .env alongside unrelated login/APR config — see ./.env.
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { test, expect, Page, Locator } from '@playwright/test';
import { login, gotoQueueList, searchQueue } from '../helpers';

/**
 * Bulk cleanup suite: deletes every queue in IVR Management > Queue EXCEPT the ones named in
 * QUEUE_KEEP_NAMES (./.env) — matched case-insensitively, exact name only (no partial match).
 * This is DESTRUCTIVE and irreversible against the live/shared environment: everything not in
 * that list is permanently deleted. Deliberately kept in its own file, separate from
 * queue_creation.spec.ts's create/validate tests, so it's never accidentally swept up by a
 * routine `playwright test` run of the create-queue suite.
 *
 * Runs as a single test rather than one-test-per-queue: the queue list is read fresh each
 * iteration (rather than snapshotting all names up front) since deleting a row shifts every row
 * below it and can change which page later rows land on.
 *
 * CAVEAT (confirmed live, cost a wasted run): does NOT reuse helpers.ts's deleteQueueByName —
 * that helper's `page.locator('tr', { hasText: name })` matches every row sharing that name, and
 * queue_creation.spec.ts's own "04 Duplicate queue name is accepted with no warning [DEFECT]"
 * confirms this app happily creates duplicate-named queues (e.g. two "max q" rows exist live).
 * A multi-match makes `expect(row).toBeVisible()` throw a strict-mode violation, which that
 * helper's broad `catch { return; }` silently swallows as "not found" — so it no-ops forever
 * against a duplicated name without ever deleting it or reporting a failure. This file instead
 * deletes duplicates one at a time by row POSITION (never by a name-only locator that could match
 * more than one row), so every copy of a non-protected name actually gets removed.
 */
function loadKeepNames(): string[] {
  const raw = process.env.QUEUE_KEEP_NAMES;
  if (!raw || !raw.trim()) {
    throw new Error(
      'QUEUE_KEEP_NAMES is not set — add it to tests/admin/QUEUE_MGMT/.env (comma-separated queue names to protect from deletion)'
    );
  }
  return raw
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

/** Sets the queue list's page size to its largest option (50) so most environments fit on one page. */
async function showAllQueueRows(page: Page) {
  const rowsPerPage = page.locator('text=Rows per page:').locator('..').getByRole('combobox');
  if (await rowsPerPage.isVisible().catch(() => false)) {
    await rowsPerPage.click();
    await page.getByRole('option', { name: '50', exact: true }).click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

/** Clicks the queue list's pagination "next" button, if present and enabled. Returns whether it advanced. */
async function goToNextQueuePage(page: Page): Promise<boolean> {
  const nextButton = page.locator('.figma-pagination-nav').last();
  if (!(await nextButton.count())) return false;
  if (await nextButton.isDisabled().catch(() => true)) return false;
  await nextButton.click();
  await page.waitForTimeout(400);
  return true;
}

/**
 * Real data rows only — this is an antd Table (same component apr/lib/table.ts's
 * readAntTableAllPages reads), whose <tbody> also contains a hidden `.ant-table-measure-row`
 * used to measure column widths. Confirmed live: that row's cells mirror the header text exactly
 * ("Queue name", "Assigned Agents", ...), so a plain `tbody tr` locator picks it up as row 0 and
 * silently no-ops every delete attempt against a literal "Queue name" queue that doesn't exist.
 * `.ant-table-placeholder` (the "No data" row) is excluded for the same reason.
 */
function queueRows(page: Page) {
  return page.locator('tbody tr:not(.ant-table-measure-row):not(.ant-table-placeholder)');
}

/**
 * Waits until `rows`'s count stops changing across a few consecutive checks before proceeding —
 * same fix apr/lib/table.ts's readAntTableAllPages uses. `gotoQueueList` only waits for the
 * "Create Queue" button to render, not for the table's row data to finish fetching, so reading
 * the count immediately after navigating can catch a transient empty/partial state. Confirmed
 * live: without this, the cleanup loop below read a stale zero-row count right after navigating
 * back to the list post-delete, concluded "nothing left to delete" while non-protected queues
 * still existed, and exited early. A count of zero is deliberately NOT trusted early — it keeps
 * polling the full timeout budget, since a genuinely-empty result looks identical to a brief
 * loading state right after navigation.
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

/**
 * Deletes ONE row exactly named `name`, found by row position (never by a name-only locator that
 * could match several rows — see the file-level CAVEAT). Returns false if no such row exists
 * (nothing to delete). Handles the double confirm (popconfirm "Yes" + modal "Delete").
 */
async function deleteOneQueueRowNamed(page: Page, name: string): Promise<boolean> {
  await gotoQueueList(page);
  await searchQueue(page, name);

  const rows = queueRows(page);
  await waitForStableRowCount(rows);
  const countBefore = await rows.count();
  let matchIndex = -1;
  for (let i = 0; i < countBefore; i++) {
    const cellText = (await rows.nth(i).locator('td').first().innerText()).trim();
    if (cellText.toLowerCase() === name.toLowerCase()) {
      matchIndex = i;
      break;
    }
  }
  if (matchIndex === -1) return false;

  await rows.nth(matchIndex).locator('.anticon-delete').click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows).toHaveCount(countBefore - 1, { timeout: 15000 });
  return true;
}

/** Deletes every row exactly named `name` — handles duplicate queue names one at a time. */
async function deleteAllQueueRowsNamed(page: Page, name: string): Promise<number> {
  let removed = 0;
  // Safety cap: a real queue list should never legitimately have this many duplicates of one name.
  for (let i = 0; i < 200; i++) {
    const didDelete = await deleteOneQueueRowNamed(page, name);
    if (!didDelete) break;
    removed++;
  }
  return removed;
}

test.describe('Queue (IVR Management > Queue) — delete cleanup', () => {
  test('deletes every queue except the protected QUEUE_KEEP_NAMES list', async ({ page }) => {
    test.setTimeout(300_000);

    const keepNames = loadKeepNames();
    console.log(`Protected queue names (never deleted): ${keepNames.join(', ')}`);

    await login(page);

    const deleted: string[] = [];
    const skippedProtected = new Set<string>();

    // Safety cap: this should never legitimately take more iterations than there are distinct
    // non-protected queue names.
    for (let iteration = 0; iteration < 2000; iteration++) {
      await gotoQueueList(page);
      await showAllQueueRows(page);

      let target: string | null = null;
      // Walk forward through pages looking for the first row not in keepNames.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = queueRows(page);
        await waitForStableRowCount(rows);
        const count = await rows.count();
        for (let i = 0; i < count; i++) {
          const name = (await rows.nth(i).locator('td').first().innerText()).trim();
          if (!name) continue;
          if (keepNames.some((k) => k.toLowerCase() === name.toLowerCase())) {
            skippedProtected.add(name);
            continue;
          }
          target = name;
          break;
        }
        if (target) break;
        const advanced = await goToNextQueuePage(page);
        if (!advanced) break;
      }

      if (!target) break; // nothing left to delete — every remaining queue is protected

      const removedCount = await deleteAllQueueRowsNamed(page, target);
      if (removedCount === 0) {
        // Was just found as a scan target, so this would mean it vanished between the scan and
        // the delete — fail loudly rather than looping forever on the same stuck name.
        throw new Error(`Found queue "${target}" as a delete target, but deleteAllQueueRowsNamed removed none of it`);
      }
      for (let i = 0; i < removedCount; i++) deleted.push(target);
    }

    console.log(`Deleted ${deleted.length} queue(s): ${deleted.join(', ') || '(none)'}`);
    console.log(`Kept ${skippedProtected.size} protected queue(s): ${[...skippedProtected].join(', ')}`);

    // Final assertion: every queue still in the list is one of the protected names.
    await gotoQueueList(page);
    await showAllQueueRows(page);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = queueRows(page);
      await waitForStableRowCount(rows);
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        const name = (await rows.nth(i).locator('td').first().innerText()).trim();
        if (!name) continue;
        expect(
          keepNames.some((k) => k.toLowerCase() === name.toLowerCase()),
          `Unexpected non-protected queue "${name}" still present after cleanup`
        ).toBe(true);
      }
      const advanced = await goToNextQueuePage(page);
      if (!advanced) break;
    }
  });
});
