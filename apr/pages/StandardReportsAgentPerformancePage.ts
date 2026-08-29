import { Locator, Page, expect } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { HourlyAgentPerformanceRow, mapHourlyAgentPerformanceRow } from '../lib/types';

/**
 * Reports > Standard Reports > "Agent Performance" (/client/reports/standard-reports
 * ?mode=agent_performance) — the app's actual *hourly* Agent Performance Report: one row per
 * agent per hour of the selected date range, unlike the Live Dashboard/Insights "APR" tabs
 * (see LiveDashboardAprPage / InsightsAprPage), which return one aggregated row per agent.
 */
export class StandardReportsAgentPerformancePage {
  constructor(private readonly page: Page) {}

  async goto() {
    // Deep-linking straight to the ?mode=agent_performance URL was observed live to bounce back
    // to /client/live-dashboard instead of loading the report — this SPA's route guard doesn't
    // handle a hard navigation to this URL, so drive it through the in-app nav instead (confirmed
    // live: Reports > Standard reports > Agent performance).
    //
    // Each click below auto-waits for its own target, but a *missed* click (wrong element, stale
    // menu, a transient overlay) doesn't throw — it just leaves the page wherever it already was,
    // and the next click then waits its full budget for something that will never appear. So each
    // step is verified before moving to the next, with a short per-step budget and up to 2 full
    // retries from a clean /client/live-dashboard reload, rather than one long blind wait chain.
    const attempts = 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.page.goto('/client/live-dashboard');

      const reachedReport = await this.tryNavigateToAgentPerformance();
      if (reachedReport) return;

      if (attempt === attempts) {
        throw new Error(
          `Could not reach Reports > Standard Reports > Agent Performance after ${attempts} attempts ` +
            `(nav menu click sequence didn't land on the report — see apr/README.md "Two tab-bar UI variants")`
        );
      }
    }
  }

  /** One attempt at the Reports > Standard Reports > Agent performance click sequence. Returns
   *  false (rather than throwing) on any step failing, so goto() can retry cleanly. */
  private async tryNavigateToAgentPerformance(): Promise<boolean> {
    const stepTimeout = 8000;

    const reportsNav = this.page.locator('text=Reports').first();
    if (!(await this.clickAndWaitFor(reportsNav, this.page.locator('text=Standard report'), stepTimeout))) return false;

    const standardReports = this.page.locator('text=Standard report').first();
    if (!(await this.clickAndWaitFor(standardReports, this.page.locator('text=Agent performance'), stepTimeout))) return false;

    const agentPerformance = this.page.locator('text=Agent performance').first();
    await agentPerformance.click({ timeout: stepTimeout }).catch(() => {});

    const table = this.page
      .locator('table')
      .filter({ has: this.page.locator('th', { hasText: 'Total Active Duration' }) })
      .first();
    return table
      .waitFor({ state: 'visible', timeout: stepTimeout })
      .then(() => true)
      .catch(() => false);
  }

  /** Clicks `trigger`, then waits (bounded) for `expected` to appear — reports success/failure
   *  instead of throwing, so the caller can retry rather than burn the rest of the test budget. */
  private async clickAndWaitFor(trigger: Locator, expected: Locator, timeout: number): Promise<boolean> {
    await trigger.click({ timeout }).catch(() => {});
    return expected
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  private get filterDialog(): Locator {
    return this.page.locator('.ant-modal, [role="dialog"]').last();
  }

  private async openFilters() {
    await this.page.getByRole('button', { name: /Filter/ }).click();
    await this.filterDialog.waitFor({ state: 'visible', timeout: 10000 });
  }

  /** Sets the Date Range's "From date" / "To date" fields, typing "YYYY-MM-DD" directly (same
   *  pattern as InsightsAprPage.setDateRange — robust regardless of which month the calendar shows). */
  private async setDateRange(startDate: string, endDate: string) {
    const from = this.filterDialog.getByPlaceholder('From date');
    const to = this.filterDialog.getByPlaceholder('To date');
    await from.click();
    await from.fill('');
    await from.pressSequentially(startDate);
    await from.press('Enter');

    await to.fill('');
    await to.pressSequentially(endDate);
    await to.press('Enter');

    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  /**
   * Selects a single agent in the filter dialog's "Agent Name" combobox. Fails clearly if the
   * agent isn't offered (same FILTER ERROR convention as LiveDashboardAprPage.filterByCampaign).
   */
  private async selectAgent(agentName: string) {
    await this.selectComboByLabel('Agent Name', agentName);
  }

  /**
   * Generic ant-select combobox picker: finds the field labeled `label` in the filter dialog,
   * opens its combobox, and clicks the option matching `value`. Fails clearly if the option isn't
   * offered — same FILTER ERROR convention as LiveDashboardAprPage.filterByCampaign.
   *
   * NOTE: the exact field labels/controls for Hour, Campaign Name, and Campaign Type in this
   * dialog have not been confirmed live (unlike Agent Name / Date range above) — this is written
   * against the same combobox pattern Agent Name uses, on the assumption every field in this
   * modal follows one consistent component. Adjust the label text below if a live run shows
   * otherwise.
   */
  private async selectComboByLabel(label: string, value: string) {
    const combo = this.filterDialog.locator(`text=${label}`).locator('xpath=following::*[1]');
    await combo.click();
    const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });

    const option = dropdown.locator('.ant-select-item-option', { hasText: value }).first();
    await expect(option, `"${value}" was not found in the Agent Performance report's "${label}" filter`).toBeVisible({
      timeout: 10000,
    });
    await option.click();
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  /**
   * Selects a single Hour window (e.g. 12 ⇒ Start Hour 12 / End Hour 13, the 12:00-12:59 window)
   * per the task brief's convention ("Start Time: 20, End Time: 21" means the single hour
   * 20:00:00-20:59:59 — see the doc comments on getRowsForFilters callers). Confirmed live (via a
   * failing run): the filter dialog has two separate comboboxes, `name="startHour"` and
   * `name="endHour"` — a plain `text=Hour` locator matches both and throws a Playwright
   * strict-mode violation, which is why this used to fail outright. Selected directly by their
   * `name` attribute instead of selectComboByLabel's text-based lookup, to disambiguate them.
   *
   * CAVEAT — not yet confirmed live: whether the End Hour dropdown actually offers hour+1 as an
   * option when hour is 23 (would need "24", which may not exist) — untested since no caller in
   * this suite currently configures APR_START_HOUR=23.
   */
  private async setHour(hour: number) {
    await this.selectComboByAttr('startHour', String(hour), 'Start Hour');
    await this.selectComboByAttr('endHour', String(hour + 1), 'End Hour');
  }

  /** Same combobox-picking logic as selectComboByLabel, but locates the combo by its `name`
   *  attribute instead of by an adjacent text label — for fields (like Start/End Hour) where two
   *  controls share the same visible label text and a text-based lookup is ambiguous. */
  private async selectComboByAttr(name: string, value: string, label: string) {
    const combo = this.filterDialog.locator(`[name="${name}"]`);
    await combo.click();
    const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });

    const option = dropdown.locator('.ant-select-item-option', { hasText: value }).first();
    await expect(option, `"${value}" was not found in the Agent Performance report's "${label}" filter`).toBeVisible({
      timeout: 10000,
    });
    await option.click();
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  private async selectCampaignName(campaignName: string) {
    await this.selectComboByLabel('Campaign Name', campaignName);
  }

  private async selectCampaignType(campaignType: string) {
    await this.selectComboByLabel('Campaign Type', campaignType);
  }

  private async applyFilters() {
    await this.filterDialog.getByRole('button', { name: 'Apply filters' }).click();
    await this.filterDialog.waitFor({ state: 'hidden', timeout: 10000 });
    await this.page.waitForTimeout(1000);
  }

  /**
   * Filters the report to a single agent's rows across `startDate`..`endDate` (Start Hour / End
   * Hour left at "Any" so every applicable hourly row for the range comes back), then returns
   * every row across pagination.
   */
  async getRowsForAgent(agentName: string, startDate: string, endDate: string): Promise<HourlyAgentPerformanceRow[]> {
    await this.goto();
    await this.openFilters();
    await this.setDateRange(startDate, endDate);
    await this.selectAgent(agentName);
    await this.applyFilters();

    const rows = await readAntTableAllPages(this.page.locator('main'));
    return rows.map(mapHourlyAgentPerformanceRow);
  }

  /**
   * Filters the report to a single agent/hour/campaign combination — used by
   * auto-preview-vs-calls.spec.ts, which needs the Hour and Campaign filters that
   * getRowsForAgent() above doesn't apply.
   */
  async getRowsForFilters(opts: {
    agentName: string;
    startDate: string;
    endDate: string;
    hour: number;
    campaignName?: string;
    campaignType?: string;
  }): Promise<HourlyAgentPerformanceRow[]> {
    await this.goto();
    await this.openFilters();
    await this.setDateRange(opts.startDate, opts.endDate);
    await this.selectAgent(opts.agentName);
    await this.setHour(opts.hour);
    if (opts.campaignName) await this.selectCampaignName(opts.campaignName);
    if (opts.campaignType) await this.selectCampaignType(opts.campaignType);
    await this.applyFilters();

    const rows = await readAntTableAllPages(this.page.locator('main'));
    return rows.map(mapHourlyAgentPerformanceRow);
  }
}
