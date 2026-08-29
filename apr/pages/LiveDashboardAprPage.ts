import { Locator, Page, expect } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { AprAgentRow, mapAprRow } from '../lib/types';
import { clickTab, resolveActivePane } from '../lib/tabs';

/**
 * Live Dashboard > "APR ANALYTICS" tab (/client/live-dashboard) — the app's *today-only* Agent
 * Performance Report ("Today's live agent performance and call statistics", confirmed live).
 * Same table component/columns as Insights > APR (see InsightsAprPage), just scoped to today.
 * "APR ANALYTICS" / "Live APR" are the same tab under the two live UI variants — see apr/lib/tabs.ts.
 */
export class LiveDashboardAprPage {
  constructor(private readonly page: Page) {}

  async goto() {
    // Fresh navigation so the shared "Filter dashboard by campaign" control starts unselected —
    // it is not scoped per-tab, it persists across all Live Dashboard tabs (verified live).
    await this.page.goto('/client/live-dashboard');
    await clickTab(this.page, { legacyName: 'APR ANALYTICS', newName: 'Live APR' });
    const pane = await this.activePane();
    await pane.locator('table').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  private activePane(): Promise<Locator> {
    return resolveActivePane(this.page);
  }

  private get campaignFilter(): Locator {
    return this.page.locator('div.ant-select[name="campaign"]');
  }

  private async agentSearchBox(): Promise<Locator> {
    const pane = await this.activePane();
    return pane.getByPlaceholder('By agent name...');
  }

  /**
   * Selects a single campaign in the dashboard-wide "Filter dashboard by campaign" multi-select.
   * Fails clearly (FILTER ERROR per apr/README.md) if the campaign isn't offered.
   */
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

  /** Every row currently shown (after campaign filter + optional agent search), across pagination. */
  async getAllRows(): Promise<AprAgentRow[]> {
    const pane = await this.activePane();
    const rows = await readAntTableAllPages(pane);
    return rows.map(mapAprRow);
  }
}
