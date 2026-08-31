import { Locator, Page } from '@playwright/test';
import { readAntTableAllPages } from '../../../apr/lib/table';
import { HourlyCallSummaryRow, mapHourlyCallSummaryRow } from '../../../apr/lib/types';

/**
 * Reports > Standard Reports > "Hourly Call Summary" (/client/reports/standard-reports
 * ?mode=hourly) — one row per Report Date/Report Hour/SME ID/Campaign Name/Queue Name/Call
 * Direction (NOT one row per agent — see HourlyCallSummaryRow in apr/lib/types.ts for the full
 * confirmed-live 22-column list).
 *
 * Confirmed live: this report's Filter dialog offers Date Range + Start Hour + End Hour +
 * Campaign Name + Queue Name + Call Direction — no Agent Name field at all. Only Date Range is
 * wired up here so far (setDateRange); the other filters default to "Any"/"All" (unfiltered),
 * same as leaving them untouched in the UI.
 */
export class HourlyCallSummaryPage {
  constructor(private readonly page: Page) {}

  async goto() {
    // Same defensive retry pattern as AgentStatusPage.goto()/AgentEfficiencyPage.goto(): drive it
    // through the in-app nav (Reports > Standard reports > Hourly summary) with verified per-step
    // waits and a couple of retries, rather than one blind goto().
    const attempts = 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.page.goto('/client/live-dashboard');

      const reachedReport = await this.tryNavigateToHourlyCallSummary();
      if (reachedReport) return;

      if (attempt === attempts) {
        throw new Error(
          `Could not reach Reports > Standard Reports > Hourly Call Summary after ${attempts} attempts ` +
            `(nav menu click sequence didn't land on the report)`
        );
      }
    }
  }

  private async tryNavigateToHourlyCallSummary(): Promise<boolean> {
    const stepTimeout = 8000;

    const reportsNav = this.page.locator('text=Reports').first();
    if (!(await this.clickAndWaitFor(reportsNav, this.page.locator('text=Standard report'), stepTimeout))) return false;

    const standardReports = this.page.locator('text=Standard report').first();
    if (!(await this.clickAndWaitFor(standardReports, this.page.locator('text=Hourly summary'), stepTimeout))) return false;

    const hourlySummary = this.page.locator('text=Hourly summary').first();
    await hourlySummary.click({ timeout: stepTimeout }).catch(() => {});

    const table = this.page
      .locator('table')
      .filter({ has: this.page.locator('th', { hasText: 'Report Hour' }) })
      .first();
    return table
      .waitFor({ state: 'visible', timeout: stepTimeout })
      .then(() => true)
      .catch(() => false);
  }

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

  /** Sets the Date Range's "From date"/"To date" fields — confirmed live as two separate inputs
   *  (behind what visually renders as one combined range field), same as every other standard
   *  report's Filter dialog in this suite. */
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

  private async applyFilters() {
    await this.filterDialog.getByRole('button', { name: 'Apply filters' }).click();
    await this.filterDialog.waitFor({ state: 'hidden', timeout: 10000 });
    await this.page.waitForTimeout(1000);
  }

  /** Every row for `startDate`..`endDate` (every hour/campaign/queue/call direction — no
   *  additional filter applied). */
  async getRowsForDateRange(startDate: string, endDate: string): Promise<HourlyCallSummaryRow[]> {
    await this.goto();
    await this.openFilters();
    await this.setDateRange(startDate, endDate);
    await this.applyFilters();

    const rows = await readAntTableAllPages(this.page.locator('main'));
    return rows.map(mapHourlyCallSummaryRow);
  }
}
