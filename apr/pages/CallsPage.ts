import { Locator, Page, expect } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { CallRecord, mapCallRow } from '../lib/types';

/** Adds `days` calendar days to a "YYYY-MM-DD" date string. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Calls page (/client/calls/merge-calls) — the raw per-call log used as the "source of truth"
 * reference for Standard Reports > Agent Performance's Auto Preview metrics (see
 * auto-preview-vs-calls.spec.ts). Its "Filter Calls" modal was confirmed live (via screenshot) to
 * have: Select Date Range, Call Type, Call Status, Abandoned Reason, Campaign Queue, Call Flow,
 * Campaign Type, Campaign Name, CRM Form, Agent. The table's own column headers (timestamp, Agent
 * Ringing Duration, Wrapup Time, Agent Talk Time, Call Status) are NOT yet confirmed live — see
 * apr/lib/types.ts CallRecord/mapCallRow for the fallback header names in use until a live pass
 * confirms them.
 */
export class CallsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/client/calls/merge-calls');
    await this.page.locator('table').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  private get filterDialog(): Locator {
    return this.page.locator('.ant-modal, [role="dialog"]').filter({ hasText: 'Filter Calls' }).last();
  }

  private async openFilters() {
    await this.page.getByRole('button', { name: /Filter/ }).click();
    await this.filterDialog.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Sets the "Select Date Range" field. Confirmed live as a single range control showing both
   * dates side by side (e.g. "2026-08-25    2026-08-25") rather than two separate labeled inputs
   * like the Standard Report / Insights date pickers — targets the two inputs inside that range
   * control directly.
   *
   * Sets the range by clicking calendar day cells, NOT by typing into the two inputs. Confirmed
   * live: typing a date into each field (via `.fill()` + `.pressSequentially()`, and separately
   * verified with real per-keystroke typing and even triple-click-select-then-type) causes this
   * antd RangePicker to silently collapse to a single date — both fields end up equal to
   * whichever field was typed into last, so a 2-day range request quietly becomes a same-day
   * range (which itself returns zero rows — see getRowsForFilters' addDays workaround). Clicking
   * the calendar's day cells directly does not have this problem.
   */
  private async setDateRange(startDate: string, endDate: string) {
    const rangeContainer = this.filterDialog.locator('text=Select Date Range').locator('xpath=following::*[1]');
    await rangeContainer.locator('input').first().click();
    await this.clickCalendarDay(startDate);
    await this.clickCalendarDay(endDate);
    await this.page.waitForTimeout(300);
  }

  /**
   * Clicks the calendar day cell for `isoDate` in the currently-open antd RangePicker popup
   * (shared by setDateRange's start/end clicks — the picker shows two month panels side by side
   * and auto-advances which panel is "current" as you make selections). Advances the popup via
   * its "next month" button until the target month/year panel is visible, then clicks the day.
   */
  private async clickCalendarDay(isoDate: string) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const targetLabel = `${monthNames[m - 1]}${y}`;

    for (let attempt = 0; attempt < 24; attempt++) {
      const panel = this.page
        .locator('.ant-picker-panel')
        .filter({ has: this.page.locator('.ant-picker-header-view', { hasText: targetLabel }) })
        .first();
      if (await panel.count()) {
        const cell = panel.locator('td.ant-picker-cell-in-view .ant-picker-cell-inner', { hasText: new RegExp(`^${d}$`) }).first();
        await cell.click();
        return;
      }
      await this.page.locator('.ant-picker-header-next-btn').last().click();
      await this.page.waitForTimeout(150);
    }
    throw new Error(`Could not find calendar month "${targetLabel}" while selecting ${isoDate} in the Calls page date range picker`);
  }

  /** Generic ant-select combobox picker, same pattern as StandardReportsAgentPerformancePage.selectComboByLabel. */
  private async selectComboByLabel(label: string, value: string) {
    const combo = this.filterDialog.locator(`text=${label}`).locator('xpath=following::*[1]');
    await combo.click();
    const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });

    const option = dropdown.locator('.ant-select-item-option', { hasText: value }).first();
    await expect(option, `"${value}" was not found in the Calls page's "${label}" filter`).toBeVisible({ timeout: 10000 });
    await option.click();
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  /**
   * Selects the Agent filter by its combobox `name="agentId"` attribute instead of the generic
   * text-based selectComboByLabel — confirmed live (via a failing run): a plain `text=Agent`
   * locator also matches an unrelated search `<input>` elsewhere in the dialog, causing a
   * Playwright strict-mode violation. Same fix as StandardReportsAgentPerformancePage.setHour's
   * Start/End Hour disambiguation.
   */
  private async selectAgent(agentName: string) {
    const combo = this.filterDialog.locator('[name="agentId"]');
    await combo.click();
    const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });

    const option = dropdown.locator('.ant-select-item-option', { hasText: agentName }).first();
    await expect(option, `"${agentName}" was not found in the Calls page's "Agent" filter`).toBeVisible({ timeout: 10000 });
    await option.click();
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  private async selectCampaignName(campaignName: string) {
    await this.selectComboByLabel('Campaign Name', campaignName);
  }

  /**
   * Selects the "Campaign Queue" filter — confirmed live as the field that holds Queue Name
   * values (e.g. "new queue", matching Standard Reports > Agent Efficiency/Hourly Call Summary's
   * "Queue Name"/"Queue" columns), despite its label. Not to be confused with "Call Flow" (a
   * separate field holding IVR flow names like "Incoming"/"LONG CALL FLOW", NOT a direction) —
   * see selectCallType for the field that actually holds Incoming/Outgoing direction values.
   *
   * Unlike selectComboByLabel, this types `queueName` into the search box before picking the
   * option — confirmed live: this dropdown's default (untyped) option list shows unrelated
   * campaign-like entries, not the target queue, so the option is only reachable by typing to
   * filter the list first.
   */
  private async selectCampaignQueue(queueName: string) {
    const combo = this.filterDialog.locator('text=Campaign Queue').locator('xpath=following::*[1]');
    await combo.click();
    await this.page.keyboard.type(queueName);
    await this.page.waitForTimeout(500);

    const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });

    const option = dropdown.locator('.ant-select-item-option', { hasText: queueName }).first();
    await expect(option, `"${queueName}" was not found in the Calls page's "Campaign Queue" filter`).toBeVisible({ timeout: 10000 });
    await option.click();
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  private async selectCampaignType(campaignType: string) {
    await this.selectComboByLabel('Campaign Type', campaignType);
  }

  /**
   * Selects the Call Type filter by its combobox `name="callType"` attribute instead of the
   * generic text-based selectComboByLabel — confirmed live (via a failing run): a plain
   * `text=Call Type` locator matches 2 elements (the ant-select wrapper div and its inner
   * `<input>`), causing a Playwright strict-mode violation. Same fix as selectAgent's
   * `name="agentId"` disambiguation.
   */
  private async selectCallType(callType: string) {
    const combo = this.filterDialog.locator('[name="callType"]');
    await combo.click();
    const dropdown = this.page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });

    const option = dropdown.locator('.ant-select-item-option', { hasText: callType }).first();
    await expect(option, `"${callType}" was not found in the Calls page's "Call Type" filter`).toBeVisible({ timeout: 10000 });
    await option.click();
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(300);
  }

  private async applyFilters() {
    await this.filterDialog.getByRole('button', { name: /Apply/ }).click();
    await this.filterDialog.waitFor({ state: 'hidden', timeout: 10000 });
    await this.page.waitForTimeout(1000);
  }

  /**
   * Filters the call log to `agentName` (+ optional `callType` / `campaignName` / `campaignType` /
   * `queueName`) across `startDate`..`endDate`, then returns every row across pagination. The
   * Calls page has no Hour filter (confirmed live via screenshot — the Filter Calls modal only
   * offers a date range), so hour-of-day filtering is done client-side by the caller against
   * CallRecord.timestamp (see apr/lib/normalize.ts parseCallTimestamp).
   *
   * `agentName` is optional — omit it for a validation scoped by campaign/queue/direction only
   * (e.g. Hourly Call Summary's Total Offered Calls, which isn't agent-scoped at all — see
   * tests/standard-report/hourly-call-summary-report/specs/total-offered-calls-check.spec.ts).
   * `callType`/`campaignName`/`campaignType`/`queueName` are all optional and left unset entirely
   * when not passed — per the Inbound validation brief, never substitute/invent a value for an
   * omitted filter.
   *
   * NOTE (observed live, one run): the Agent Name / Campaign Name / Campaign Queue comboboxes in
   * this modal were occasionally unreliable — typing left stray unrelated options visible and the
   * popup mis-positioned itself, and a selection made right after another field's selection could
   * silently fail to register (observed live: selecting Call Type then immediately Campaign Queue
   * without confirming the first selection actually stuck). Always confirm a selection landed
   * (e.g. re-read the field) before moving to the next one if adding new callers here. If
   * selectComboByLabel proves flaky in a live run, the page also has a live-search box directly
   * above the results table (search-as-you-type, not part of the Filter modal) that a prior
   * live-agent pass used successfully as a fallback for Agent Name/Campaign Name — not yet wired
   * up here since its exact selector wasn't captured.
   */
  async getRowsForFilters(opts: {
    agentName?: string;
    startDate: string;
    endDate: string;
    callType?: string;
    campaignName?: string;
    campaignType?: string;
    queueName?: string;
  }): Promise<CallRecord[]> {
    await this.goto();
    await this.openFilters();
    // Confirmed live: this dialog's date-range picker silently returns zero rows when Start date
    // === End date (a single-day range) — even for a day with real calls (verified: the exact
    // same agent+date returned "No data" as a single day, then real rows once the range spanned
    // 2+ days). Padding the end date by one day works around it; every caller of this method
    // already re-filters the returned rows down to the exact requested date range client-side
    // (see apr/lib/normalize.ts parseCallTimestamp / ParsedCallTimestamp.isoDate), so widening the
    // UI-level query is safe.
    const rangeEnd = opts.startDate === opts.endDate ? addDays(opts.endDate, 1) : opts.endDate;
    await this.setDateRange(opts.startDate, rangeEnd);
    if (opts.agentName) await this.selectAgent(opts.agentName);
    if (opts.callType) await this.selectCallType(opts.callType);
    if (opts.campaignName) await this.selectCampaignName(opts.campaignName);
    if (opts.campaignType) await this.selectCampaignType(opts.campaignType);
    if (opts.queueName) await this.selectCampaignQueue(opts.queueName);
    await this.applyFilters();

    const rows = await readAntTableAllPages(this.page.locator('main'));
    return rows.map(mapCallRow);
  }
}
