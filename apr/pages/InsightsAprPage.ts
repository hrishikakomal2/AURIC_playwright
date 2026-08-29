import { Locator, Page } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { AprAgentRow, mapAprRow } from '../lib/types';
import { clickTab, resolveActivePane } from '../lib/tabs';

/**
 * Insights > "APR" tab (/client/insights) — the app's date-range Agent Performance Report, used
 * for any date other than today. Same table component/columns as Live Dashboard > APR Analytics
 * (see LiveDashboardAprPage); the only difference is a Start date / End date range instead of an
 * implicit "today". Same tab under both live UI variants — "APR" — see apr/lib/tabs.ts.
 */
export class InsightsAprPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/client/insights');
    await clickTab(this.page, { legacyName: 'APR', newName: 'APR', exact: true });
    const pane = await this.activePane();
    await pane.locator('table').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  private activePane(): Promise<Locator> {
    return resolveActivePane(this.page);
  }

  private async startDateInput(): Promise<Locator> {
    const pane = await this.activePane();
    return pane.getByPlaceholder('Start date');
  }

  private async endDateInput(): Promise<Locator> {
    const pane = await this.activePane();
    return pane.getByPlaceholder('End date');
  }

  private async agentSearchBox(): Promise<Locator> {
    const pane = await this.activePane();
    return pane.getByPlaceholder('By agent name...');
  }

  /**
   * Sets the Start date / End date range by typing "YYYY-MM-DD" directly into each field and
   * pressing Enter — robust regardless of which month(s) the calendar happens to be showing,
   * unlike clicking calendar day cells (verified live: typing navigates the calendar itself).
   */
  async setDateRange(startDate: string, endDate: string) {
    const start = await this.startDateInput();
    await start.click();
    await start.fill('');
    await start.pressSequentially(startDate);
    await start.press('Enter');

    const end = await this.endDateInput();
    await end.fill('');
    await end.pressSequentially(endDate);
    await end.press('Enter');

    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);
  }

  async searchAgent(name: string) {
    const box = await this.agentSearchBox();
    await box.fill(name);
    await this.page.waitForTimeout(600);
  }

  async clearAgentSearch() {
    const box = await this.agentSearchBox();
    await box.fill('');
    await this.page.waitForTimeout(600);
  }

  /** Every row currently shown (after date range + optional agent search), across pagination. */
  async getAllRows(): Promise<AprAgentRow[]> {
    const pane = await this.activePane();
    const rows = await readAntTableAllPages(pane);
    return rows.map(mapAprRow);
  }

  /**
   * Rows for `campaignName` only. This tab has no campaign filter control (verified live — only a
   * "Campaign Name" column exists), so campaign filtering is done client-side against that column
   * rather than through a UI filter (see apr/README.md).
   */
  async getRowsForCampaign(campaignName: string): Promise<AprAgentRow[]> {
    const rows = await this.getAllRows();
    const target = campaignName.trim().toLowerCase();
    return rows.filter((r) => r.campaignName.trim().toLowerCase() === target);
  }
}
