import { Locator, Page } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { AprAgentRow, mapAprRow } from '../lib/types';
import { clickTab, resolveActivePane } from '../lib/tabs';
import { pickDateRange } from '../lib/dateRangePicker';

/**
 * Insights > "APR" tab (/client/insights). Own copy for this environment — see
 * apr-new-app/README.md "Isolation from the existing suite".
 */
export class InsightsAprPage {
  constructor(private readonly page: Page, private readonly baseUrl: string) {}

  async goto() {
    await this.page.goto(`${this.baseUrl}/client/insights`);
    await clickTab(this.page, { legacyName: 'APR', newName: 'APR', exact: true });
    const pane = await this.activePane();
    await pane.locator('table:visible').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  private activePane(): Promise<Locator> {
    return resolveActivePane(this.page);
  }

  private async dateRangeInput(): Promise<Locator> {
    const pane = await this.activePane();
    return pane.getByPlaceholder('Select date range');
  }

  private async agentSearchBox(): Promise<Locator> {
    const pane = await this.activePane();
    return pane.getByPlaceholder('Search Name');
  }

  /**
   * This account's Insights > APR uses a single ngx-bootstrap `bsDaterangepicker` field (a real
   * calendar, not a typeable text field) instead of separate Start date / End date inputs — see
   * apr-new-app/lib/dateRangePicker.ts. A distinct "Search" icon button next to the field applies
   * the selected range (there is no Enter-to-apply here).
   */
  async setDateRange(startDate: string, endDate: string) {
    const input = await this.dateRangeInput();
    await pickDateRange(this.page, input, startDate, endDate);
    const pane = await this.activePane();
    await pane.locator('button:has([title="Search"])').first().click();
    await this.page.waitForTimeout(800);
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

  async getAllRows(): Promise<AprAgentRow[]> {
    const pane = await this.activePane();
    const rows = await readAntTableAllPages(pane);
    return rows.map(mapAprRow);
  }

  async getRowsForCampaign(campaignName: string): Promise<AprAgentRow[]> {
    const rows = await this.getAllRows();
    const target = campaignName.trim().toLowerCase();
    return rows.filter((r) => r.campaignName.trim().toLowerCase() === target);
  }
}
