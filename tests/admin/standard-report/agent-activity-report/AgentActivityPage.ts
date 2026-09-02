import { Locator, Page } from '@playwright/test';
import { readAntTableAllPages } from '../../../../apr/lib/table';
import { AgentActivityRow, mapAgentActivityRow } from '../../../../apr/lib/types';

/**
 * Reports > Standard Reports > "Agent Activity" (/client/reports/standard-reports
 * ?mode=agent_activity) — one row per agent per date (Shift Start/End, Logged-in/Logged-out
 * times, Active/Idle/Break time, TL/Supervisor Name, etc. — see AgentActivityRow in
 * apr/lib/types.ts for the full confirmed-live column list).
 *
 * Confirmed live: this report's Filter dialog only offers Date Range + Agent Name (no Hour, no
 * Campaign) — simpler than the Agent Performance report's filters. The Date Range control uses
 * two separate "From date"/"To date" text inputs, same safe pattern as
 * StandardReportsAgentPerformancePage.setDateRange — NOT the combined range-picker CallsPage.ts
 * had a same-day-collapse bug with.
 *
 * There is NO agent-scoped fetch method here on purpose: the Agent Name filter was tested live
 * and, despite the selection visibly registering (the combobox shows the picked agent's name,
 * the dropdown offers the right option), clicking "Apply filters" did not narrow the result set —
 * the table kept showing every agent regardless. Rather than depend on that, every caller should
 * fetch getRowsForDateRange() (all agents) and filter to the agent it needs client-side — the
 * same defensive pattern the rest of this suite already uses for any filter that might not be
 * fully reliable live.
 */
export class AgentActivityPage {
  constructor(private readonly page: Page) {}

  async goto() {
    // Same defensive retry pattern as StandardReportsAgentPerformancePage.goto(): drive it
    // through the in-app nav (Reports > Standard reports > Agent activity) with verified
    // per-step waits and a couple of retries, rather than one blind goto().
    const attempts = 2;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.page.goto('/client/live-dashboard');

      const reachedReport = await this.tryNavigateToAgentActivity();
      if (reachedReport) return;

      if (attempt === attempts) {
        throw new Error(
          `Could not reach Reports > Standard Reports > Agent Activity after ${attempts} attempts ` +
            `(nav menu click sequence didn't land on the report)`
        );
      }
    }
  }

  private async tryNavigateToAgentActivity(): Promise<boolean> {
    const stepTimeout = 8000;

    const reportsNav = this.page.locator('text=Reports').first();
    if (!(await this.clickAndWaitFor(reportsNav, this.page.locator('text=Standard report'), stepTimeout))) return false;

    const standardReports = this.page.locator('text=Standard report').first();
    if (!(await this.clickAndWaitFor(standardReports, this.page.locator('text=Agent activity'), stepTimeout))) return false;

    const agentActivity = this.page.locator('text=Agent activity').first();
    await agentActivity.click({ timeout: stepTimeout }).catch(() => {});

    const table = this.page
      .locator('table')
      .filter({ has: this.page.locator('th', { hasText: 'Active Time' }) })
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
  async getRowsForDateRange(startDate: string, endDate: string): Promise<AgentActivityRow[]> {
    await this.goto();
    await this.openFilters();
    await this.setDateRange(startDate, endDate);
    await this.applyFilters();

    const rows = await readAntTableAllPages(this.page.locator('main'));
    return rows.map(mapAgentActivityRow);
  }
}
