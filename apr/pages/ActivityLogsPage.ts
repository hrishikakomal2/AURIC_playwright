import { Locator, Page, expect } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { ActivityLogRow, mapActivityLogRow } from '../lib/types';

/**
 * Profile > Activity Logs (/client/profile/activity-logs) — a global account audit log (auth,
 * break, campaign, settings, etc.), one row per event. Used to independently recompute:
 *  - how many times an agent went on break, from "break" module breakIn/breakOut rows, as a
 *    cross-check against Agent Activity's "No. of Breaks Taken" column.
 *  - how long an agent's Auto Call toggle was left on, from "Set Auto Call Successfully On/Off"
 *    rows, as a cross-check against Agent Activity's "Auto Call Off Time" column.
 *
 * Confirmed live: this page's own Date Range filter does NOT reliably narrow the result set —
 * setting it to a single day and clicking Apply still returned rows outside that day (same class
 * of unreliable filter documented on AgentActivityPage/CallsPage elsewhere in this repo). So
 * callers should filter Module here (that filter DOES narrow correctly — confirmed live for
 * "Break") and filter by date client-side instead of trusting the Date Range picker.
 *
 * NOTE: the Module dropdown only shows All/Auth/Break/Settings/Call Flow/Queue by default — it's
 * a searchable combobox, and typing narrows it to reveal more options not in that default list,
 * confirmed live: typing "call" reveals both "Call Flow" AND "Calls" (a distinct option). "Calls"
 * is the one auto-call-off-time-check.spec.ts uses for "Set Auto Call Successfully On/Off" rows.
 * Applying it returns "No data" in this test account (it has zero rows in any module beyond
 * auth/break/campaign across its whole history), so the actual Auto Call row shape could not be
 * confirmed live end-to-end — only that "Calls" is a real, selectable Module value.
 *
 * The search box (top left, "Search by Agent name,number") DOES reliably narrow by agent name —
 * confirmed live: searching a deliberately-wrong name returned "No data".
 */
export class ActivityLogsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/client/profile/activity-logs');
    await this.searchBox.waitFor({ state: 'visible', timeout: 15000 });
    await this.page.locator('main table').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  private get filterDialog(): Locator {
    return this.page.locator('.ant-modal, [role="dialog"]').last();
  }

  private async openFilters() {
    await this.page.getByRole('button', { name: /Filter/ }).click();
    await this.filterDialog.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Sets Module to `moduleLabel` and applies — the only filter on this page confirmed to
   * reliably narrow the result set (see class doc comment). Leaves Date Range untouched since it
   * doesn't actually narrow live; callers filter by date client-side instead. The dropdown only
   * lists All/Auth/Break/Settings/Call Flow/Queue until you type — typing narrows/reveals further
   * options (e.g. "Calls") not shown by default, so pass the exact label text you need.
   */
  async filterByModule(moduleLabel: string) {
    await this.openFilters();

    await this.filterDialog.locator('.ant-select').first().click();
    // Type the label to narrow/reveal it — confirmed live necessary for options not in the
    // default unfiltered list (e.g. "Calls"; see class doc comment), and harmless for options
    // that are already shown by default (e.g. "Break").
    await this.page.keyboard.type(moduleLabel);
    const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const option = dropdown.locator('.ant-select-item-option', { hasText: moduleLabel }).first();
    await expect(option, `"${moduleLabel}" was not found in the Activity Logs Module filter`).toBeVisible({ timeout: 10000 });
    await option.click();

    await this.filterDialog.getByRole('button', { name: 'Apply' }).click();
    await this.filterDialog.waitFor({ state: 'hidden', timeout: 10000 });
    await this.page.waitForTimeout(1000);
  }

  /** Sets Module to "Break" and applies — see filterByModule. */
  async filterToBreakModule() {
    await this.filterByModule('Break');
  }

  private get searchBox(): Locator {
    return this.page.getByPlaceholder('Search by Agent name,number');
  }

  /** Narrows rows to one agent — confirmed live to reliably filter (unlike this page's Date Range filter). */
  async searchAgent(name: string) {
    await this.searchBox.fill(name);
    await this.page.waitForTimeout(600); // debounce, matches the convention used elsewhere in this project (tests/helpers.ts)
  }

  /** Every row currently matching the applied Module filter/search, across pagination. */
  async getAllRows(): Promise<ActivityLogRow[]> {
    const rows = await readAntTableAllPages(this.page.locator('main'));
    return rows.map(mapActivityLogRow);
  }
}
