import * as dotenv from 'dotenv';
import * as path from 'path';

// Loaded explicitly (not the global `dotenv/config` import in playwright.config.ts, which only
// loads the root .env) so CONTACT_KEEP_NAMES stays scoped to this cleanup suite instead of living
// in the root .env alongside unrelated login/APR config — see ./.env.
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { test, expect, Page, Locator } from '@playwright/test';
import { login, gotoContacts, searchContacts } from '../helpers';

/**
 * Bulk cleanup suite: deletes every contact in Customer Contacts > Contacts EXCEPT the ones named
 * in CONTACT_KEEP_NAMES (./.env) — matched case-insensitively, exact name only (no partial
 * match). This is DESTRUCTIVE and irreversible against the live/shared environment: everything
 * not in that list is permanently deleted. Deliberately kept in its own file, separate from
 * contact.spec.ts's create/edit/search tests, so it's never accidentally swept up by a routine
 * `playwright test` run of that suite.
 *
 * Same pattern as delete_queue.spec.ts, with two confirmed-live differences in this app:
 *  - The Contacts table does NOT have Queue's hidden `.ant-table-measure-row`, but it DOES render
 *    an `.ant-table-placeholder` "No data" row when a search matches nothing — that row still
 *    needs excluding (see contactRows below; a first run without this exclusion misread a
 *    successful delete as failed, since the placeholder row counted as "1" instead of "0").
 *  - Deleting a contact needs only ONE confirm (the `.anticon-delete` icon's "Yes" popconfirm) —
 *    no second "Delete" modal button like the Queue list has.
 * Still deletes duplicates one at a time by row POSITION (never by a name-only `hasText` locator)
 * — confirmed live this list contains substring collisions (e.g. "QA Page 1 ..." is a substring
 * match for "QA Page 10 ...", "QA Page 12 ...") that would make an unscoped hasText locator
 * ambiguous or wrong, the same class of bug delete_queue.spec.ts hit with duplicate "max q" rows.
 * Also confirmed live: one contact currently has a blank Customer Name (apparently saved via
 * contact.spec.ts's own "[DEFECT] Spaces-only Customer Name is not trimmed/rejected" case) — an
 * empty string never matches a real protected name, so it's still a valid deletion target rather
 * than being silently skipped.
 */
function loadKeepNames(): string[] {
  const raw = process.env.CONTACT_KEEP_NAMES;
  if (!raw || !raw.trim()) {
    throw new Error(
      'CONTACT_KEEP_NAMES is not set — add it to tests/admin/CONTACT_SAVE/.env (comma-separated contact names to protect from deletion)'
    );
  }
  return raw
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Real data rows only. A probe confirmed this table has no hidden `.ant-table-measure-row` like
 * Queue's (a bare `tbody tr` count matches the real row count exactly when non-empty) — but it
 * DOES render an `.ant-table-placeholder` "No data" row when a search/filter matches nothing,
 * which a bare `tbody tr` locator counts as 1 row. Confirmed live: this made a post-delete
 * `toHaveCount(0)` assertion fail with "Received: 1" even though the delete had actually
 * succeeded — the placeholder row was the "1".
 */
function contactRows(page: Page) {
  return page.locator('tbody tr:not(.ant-table-placeholder)');
}

/**
 * Waits until `rows`'s count stops changing across a few consecutive checks — same fix used in
 * delete_queue.spec.ts / queue_filter.spec.ts / apr/lib/table.ts. `gotoContacts` only waits for
 * the "Add Contact" button to render, not for the table's row data to finish fetching, so reading
 * the count immediately after navigating can catch a transient empty/partial state. A count of
 * zero is deliberately NOT trusted early.
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

/** Sets the contacts list's page size to its largest option (50) so most environments fit on one page. */
async function showAllContactRows(page: Page) {
  const rowsPerPage = page.locator('text=Rows per page:').locator('..').getByRole('combobox');
  if (await rowsPerPage.isVisible().catch(() => false)) {
    await rowsPerPage.click();
    await page.getByRole('option', { name: '50', exact: true }).click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

/** Clicks the contacts list's pagination "next" button, if present and enabled. Returns whether it advanced. */
async function goToNextContactPage(page: Page): Promise<boolean> {
  const nextButton = page.locator('.figma-pagination-nav').last();
  if (!(await nextButton.count())) return false;
  if (await nextButton.isDisabled().catch(() => true)) return false;
  await nextButton.click();
  await page.waitForTimeout(400);
  return true;
}

/**
 * Deletes ONE row exactly named `name`, found by row position (never by a name-only locator that
 * could match several rows — see the file-level CAVEAT). Returns false if no such row exists
 * (nothing to delete). `name` may be '' to target a blank-named contact.
 */
async function deleteOneContactRowNamed(page: Page, name: string): Promise<boolean> {
  await gotoContacts(page);
  await showAllContactRows(page);
  if (name) await searchContacts(page, name);

  const rows = contactRows(page);
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
  await expect(rows).toHaveCount(countBefore - 1, { timeout: 15000 });
  return true;
}

/** Deletes every row exactly named `name` — handles duplicate contact names one at a time. */
async function deleteAllContactRowsNamed(page: Page, name: string): Promise<number> {
  let removed = 0;
  // Safety cap: a real contacts list should never legitimately have this many duplicates of one name.
  for (let i = 0; i < 200; i++) {
    const didDelete = await deleteOneContactRowNamed(page, name);
    if (!didDelete) break;
    removed++;
  }
  return removed;
}

test.describe('Customer Contacts (Contacts page) — delete cleanup', () => {
  test('deletes every contact except the protected CONTACT_KEEP_NAMES list', async ({ page }) => {
    test.setTimeout(300_000);

    const keepNames = loadKeepNames();
    console.log(`Protected contact names (never deleted): ${keepNames.join(', ')}`);

    await login(page);

    const deleted: string[] = [];
    const skippedProtected = new Set<string>();

    // Safety cap: this should never legitimately take more iterations than there are distinct
    // non-protected contact names.
    for (let iteration = 0; iteration < 2000; iteration++) {
      await gotoContacts(page);
      await showAllContactRows(page);

      let target: string | null = null;
      // Walk forward through pages looking for the first row not in keepNames.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const rows = contactRows(page);
        await waitForStableRowCount(rows);
        const count = await rows.count();
        for (let i = 0; i < count; i++) {
          const name = (await rows.nth(i).locator('td').first().innerText()).trim();
          if (keepNames.some((k) => k.toLowerCase() === name.toLowerCase())) {
            skippedProtected.add(name);
            continue;
          }
          target = name;
          break;
        }
        if (target !== null) break;
        const advanced = await goToNextContactPage(page);
        if (!advanced) break;
      }

      if (target === null) break; // nothing left to delete — every remaining contact is protected

      const removedCount = await deleteAllContactRowsNamed(page, target);
      if (removedCount === 0) {
        // Was just found as a scan target, so this would mean it vanished between the scan and
        // the delete — fail loudly rather than looping forever on the same stuck name.
        throw new Error(`Found contact "${target}" as a delete target, but deleteAllContactRowsNamed removed none of it`);
      }
      for (let i = 0; i < removedCount; i++) deleted.push(target);
    }

    console.log(`Deleted ${deleted.length} contact(s): ${deleted.join(', ') || '(none)'}`);
    console.log(`Kept ${skippedProtected.size} protected contact(s): ${[...skippedProtected].join(', ')}`);

    // Final assertion: every contact still in the list is one of the protected names.
    await gotoContacts(page);
    await showAllContactRows(page);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = contactRows(page);
      await waitForStableRowCount(rows);
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        const name = (await rows.nth(i).locator('td').first().innerText()).trim();
        expect(
          keepNames.some((k) => k.toLowerCase() === name.toLowerCase()),
          `Unexpected non-protected contact "${name}" still present after cleanup`
        ).toBe(true);
      }
      const advanced = await goToNextContactPage(page);
      if (!advanced) break;
    }
  });
});
