import { Locator, Page } from '@playwright/test';
import { readAntTableAllPages } from '../../../apr/lib/table';
import { AgentEfficiencyRow, mapAgentEfficiencyRow } from '../../../apr/lib/types';

/**
 * Reports > Standard Reports > "Agent Efficiency Report" (/client/reports/standard-reports
 * ?mode=agent_efficiency) — one row per agent per date (Agent Name, Date, TL/Supervisor Name,
 * Average Handling Time (AHT), Call Volume Handled, Occupancy Rate, After Call Work (ACW) Time —
 * see AgentEfficiencyRow in apr/lib/types.ts for the full confirmed-live column list).
 *
 * Confirmed live: unlike Agent Activity/Agent Status, this report's Filter dialog has ONLY a Date
 * Range (From date/To date) — no Agent Name field at all (checked via the live accessibility
 * tree, not just visually). There is therefore no agent-scoped fetch method here: every caller
 * fetches getRowsForDateRange() (all agents) and filters to the agent it needs client-side, same
 * defensive precedent as AgentActivityPage/AgentStatusPage.
 */
export class AgentEfficiencyPage {
  constructor(private readonly page: Page) {}

  async goto() {
    // Same defensive retry pattern as AgentStatusPage.goto(): drive it through the in-app nav
    // (Reports > Standard reports > Agent efficiency) with verified per-step waits and a couple
    // of retries, rather than one blind goto().
    const attempts = 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.page.goto('/client/live-dashboard');

      const reachedReport = await this.tryNavigateToAgentEfficiency();
      if (reachedReport) return;

      if (attempt === attempts) {
        throw new Error(
          `Could not reach Reports > Standard Reports > Agent Efficiency Report after ${attempts} attempts ` +
            `(nav menu click sequence didn't land on the report)`
        );
      }
    }
  }

  private async tryNavigateToAgentEfficiency(): Promise<boolean> {
    const stepTimeout = 8000;

    const reportsNav = this.page.locator('text=Reports').first();
    if (!(await this.clickAndWaitFor(reportsNav, this.page.locator('text=Standard report'), stepTimeout))) return false;

    const standardReports = this.page.locator('text=Standard report').first();
    if (!(await this.clickAndWaitFor(standardReports, this.page.locator('text=Agent efficiency'), stepTimeout))) return false;

    const agentEfficiency = this.page.locator('text=Agent efficiency').first();
    await agentEfficiency.click({ timeout: stepTimeout }).catch(() => {});

    const table = this.page
      .locator('table')
      .filter({ has: this.page.locator('th', { hasText: 'Average Handling Time (AHT)' }) })
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
   *  (behind what visually renders as one combined range field). */
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

  /** Every row for `startDate`..`endDate` across every agent — see the class doc comment for why
   *  there's no separate agent-scoped fetch; filter the result client-side instead. */
  async getRowsForDateRange(startDate: string, endDate: string): Promise<AgentEfficiencyRow[]> {
    await this.goto();
    await this.openFilters();
    await this.setDateRange(startDate, endDate);
    await this.applyFilters();

    const rows = await readAntTableAllPages(this.page.locator('main'));
    return rows.map(mapAgentEfficiencyRow);
  }
}
