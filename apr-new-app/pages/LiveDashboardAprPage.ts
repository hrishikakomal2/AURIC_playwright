import { Locator, Page, expect } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { AprAgentRow, mapAprRow } from '../lib/types';
import { clickTab, resolveActivePane } from '../lib/tabs';

/**
 * Live Dashboard > "APR ANALYTICS" / "Live APR" tab (/client/live-dashboard). Own copy for this
 * environment — see apr-new-app/README.md "Isolation from the existing suite".
 */
export class LiveDashboardAprPage {
  constructor(private readonly page: Page, private readonly baseUrl: string) {}

  async goto() {
    await this.page.goto(`${this.baseUrl}/client/live-dashboard`);
    await clickTab(this.page, { legacyName: 'APR ANALYTICS', newName: 'Live APR' });
    const pane = await this.activePane();
    await pane.locator('table:visible').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  private activePane(): Promise<Locator> {
    return resolveActivePane(this.page);
  }

  private get campaignFilter(): Locator {
    return this.page.locator('div.ant-select[name="campaign"]');
  }

  private async agentSearchBox(): Promise<Locator> {
    const pane = await this.activePane();
    return pane.getByPlaceholder('Search Name');
  }

  async filterByCampaign(campaignName: string) {
    await this.campaignFilter.click();
    const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });

    const option = dropdown.locator('.ant-select-item-option', { hasText: campaignName }).first();
    await expect(option, `Campaign "${campaignName}" was not found in the "Filter dashboard by campaign" list`).toBeVisible({
      timeout: 10000,
    });
    await option.click();
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

  async getAllRows(): Promise<AprAgentRow[]> {
    const pane = await this.activePane();
    const rows = await readAntTableAllPages(pane);
    return rows.map(mapAprRow);
  }
}
