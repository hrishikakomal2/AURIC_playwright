import { Locator, Page } from '@playwright/test';
import { readAntTableAllPages } from '../../../apr/lib/table';
import { AgentStatusRow, mapAgentStatusRow } from '../../../apr/lib/types';

/**
 * Reports > Standard Reports > "Agent Status" (/client/reports/standard-reports
 * ?mode=agent_status) — one row per agent per date (Total Login/Available/On Call/Wrap-Up/Idle/
 * Break Time, TL/Supervisor Name — see AgentStatusRow in apr/lib/types.ts for the full
 * confirmed-live column list).
 *
 * Confirmed live: this report's Filter dialog is structurally identical to Agent Activity's —
 * Date Range (two separate "From date"/"To date" text inputs) + Agent Name only (no Hour, no
 * Campaign).
 *
 * There is NO agent-scoped fetch method here on purpose, following AgentActivityPage's
 * defensive precedent: that report's own Agent Name filter was tested live and did not narrow
 * the result set despite the selection visibly registering, so every caller here fetches
 * getRowsForDateRange() (all agents) and filters to the agent it needs client-side rather than
 * depending on a filter that has not been independently confirmed reliable for this report.
 */
export class AgentStatusPage {
  constructor(private readonly page: Page) {}

  async goto() {
    // Same defensive retry pattern as AgentActivityPage.goto(): drive it through the in-app nav
    // (Reports > Standard reports > Agent status) with verified per-step waits and a couple of
    // retries, rather than one blind goto().
    const attempts = 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.page.goto('/client/live-dashboard');

      const reachedReport = await this.tryNavigateToAgentStatus();
      if (reachedReport) return;

      if (attempt === attempts) {
        throw new Error(
          `Could not reach Reports > Standard Reports > Agent Status after ${attempts} attempts ` +
            `(nav menu click sequence didn't land on the report)`
        );
      }
    }
  }

  private async tryNavigateToAgentStatus(): Promise<boolean> {
    const stepTimeout = 8000;

    const reportsNav = this.page.locator('text=Reports').first();
    if (!(await this.clickAndWaitFor(reportsNav, this.page.locator('text=Standard report'), stepTimeout))) return false;

    const standardReports = this.page.locator('text=Standard report').first();
    if (!(await this.clickAndWaitFor(standardReports, this.page.locator('text=Agent status'), stepTimeout))) return false;

    const agentStatus = this.page.locator('text=Agent status').first();
    await agentStatus.click({ timeout: stepTimeout }).catch(() => {});

    const table = this.page
      .locator('table')
      .filter({ has: this.page.locator('th', { hasText: 'Total Login Time' }) })
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

  /** Sets the Date Range's "From date"/"To date" fields — confirmed live as two separate inputs. */
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
  async getRowsForDateRange(startDate: string, endDate: string): Promise<AgentStatusRow[]> {
    await this.goto();
    await this.openFilters();
    await this.setDateRange(startDate, endDate);
    await this.applyFilters();

    const rows = await readAntTableAllPages(this.page.locator('main'));
    return rows.map(mapAgentStatusRow);
  }
}
