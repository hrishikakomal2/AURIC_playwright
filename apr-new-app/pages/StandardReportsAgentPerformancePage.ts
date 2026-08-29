import { Locator, Page, expect } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { HourlyAgentPerformanceRow, mapHourlyAgentPerformanceRow } from '../lib/types';
import { pickDateRange } from '../lib/dateRangePicker';

/**
 * Reports > Standard Reports > "Agent Performance" — the app's actual *hourly* Agent Performance
 * Report: one row per agent per hour of the selected date range, unlike the Live Dashboard/
 * Insights "APR" tabs, which return one aggregated row per agent. Own copy for this environment
 * — see apr-new-app/README.md "Isolation from the existing suite".
 */
export class StandardReportsAgentPerformancePage {
  constructor(private readonly page: Page, private readonly baseUrl: string) {}

  async goto() {
    // Deep-linking straight to the ?mode=agent_performance URL bounces back to
    // /client/live-dashboard instead of loading the report — this SPA's route guard doesn't
    // handle a hard navigation to this URL, so drive it through the in-app nav instead.
    //
    // Each click auto-waits for its own target, but a *missed* click (wrong element, stale menu,
    // a transient overlay) doesn't throw — it just leaves the page wherever it already was, and
    // the next click then waits its full budget for something that will never appear. So each
    // step is verified before moving to the next, with a short per-step budget and up to 2 full
    // retries from a clean /client/live-dashboard reload.
    const attempts = 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.page.goto(`${this.baseUrl}/client/live-dashboard`);

      const reachedReport = await this.tryNavigateToAgentPerformance();
      if (reachedReport) return;

      if (attempt === attempts) {
        throw new Error(`Could not reach Reports > Standard Reports > Agent Performance after ${attempts} attempts`);
      }
    }
  }

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

  private async clickAndWaitFor(trigger: Locator, expected: Locator, timeout: number): Promise<boolean> {
    await trigger.click({ timeout }).catch(() => {});
    return expected
      .first()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  private get filterDialog(): Locator {
    return this.page.locator('[role="dialog"]').last();
  }

  /**
   * The Filter trigger here is a plain `<span class="filter-container">` (verified live), not a
   * button — this account's UI doesn't give it button semantics.
   */
  private async openFilters() {
    await this.page.locator('.filter-container').first().click();
    await this.filterDialog.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * This account's Filter dialog uses the same ngx-bootstrap `bsDaterangepicker` as Insights
   * (apr-new-app/lib/dateRangePicker.ts), not separate From date / To date text inputs. No
   * Escape here — verified live that Escape closes the *entire* Filter dialog, not just the
   * calendar popup; the calendar closes on its own once both dates are picked.
   */
  private async setDateRange(startDate: string, endDate: string) {
    const input = this.filterDialog.getByRole('textbox', { name: 'Select Date' });
    await pickDateRange(this.page, input, startDate, endDate);
    await this.page.waitForTimeout(300);
  }

  /**
   * The Agent Name filter here is an `ngx-bootstrap-multiselect` checkbox list (`.dropdown-btn`
   * trigger, `.multiselect-item-checkbox` options keyed by `aria-label`), not an antd searchable
   * select — verified live. Closed by clicking the trigger again (toggle) rather than Escape,
   * which was observed live to close the whole Filter dialog, not just this popup.
   */
  private async selectAgent(agentName: string) {
    const dropdownBtn = this.filterDialog.locator('.dropdown-btn').first();
    await dropdownBtn.click();

    // The list only renders a scrollable subset (max-height, verified live) — type into its
    // search box first rather than assume the target agent is already visible.
    await this.filterDialog.getByPlaceholder('Search').fill(agentName);
    await this.page.waitForTimeout(400);

    const option = this.filterDialog.locator('.multiselect-item-checkbox').filter({ has: this.page.locator(`input[aria-label="${agentName}"]`) });
    await expect(option, `Agent "${agentName}" was not found in the Agent Performance report's Agent Name filter`).toBeVisible({
      timeout: 10000,
    });
    await option.click();
    await dropdownBtn.click();
    await this.page.waitForTimeout(300);
  }

  private async applyFilters() {
    await this.filterDialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await this.filterDialog.waitFor({ state: 'hidden', timeout: 10000 });
    await this.page.waitForTimeout(1000);
  }

  async getRowsForAgent(agentName: string, startDate: string, endDate: string): Promise<HourlyAgentPerformanceRow[]> {
    await this.goto();
    await this.openFilters();
    await this.setDateRange(startDate, endDate);
    await this.selectAgent(agentName);
    await this.applyFilters();

    // On this account, `<main>` wraps the sidebar navigation, not the content area (verified
    // live) — scope by the whole page instead.
    const rows = await readAntTableAllPages(this.page.locator('body'));
    return rows.map(mapHourlyAgentPerformanceRow);
  }
}
