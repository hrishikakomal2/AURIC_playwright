import { Page } from '@playwright/test';
import { AprConfig, AgentSelector, formatHour, isToday } from '../config';
import { LiveDashboardAprPage } from '../pages/LiveDashboardAprPage';
import { InsightsAprPage } from '../pages/InsightsAprPage';
import { UsersPage } from '../pages/UsersPage';
import { AprAgentRow, UserRecord } from './types';
import { AprReportRecorder } from './reportRecorder';
import { ValidationContext, validateAgentIdentity, validateActiveDuration, validateCampaign, validateDateHourWindow } from './validate';

export interface ActiveTimeRef {
  value: string;
  source: string;
}

export interface GatherResult {
  ctx: ValidationContext;
  today: boolean;
  aprRows: AprAgentRow[];
  usersByAgentId: Map<string, UserRecord>;
  activeTimeByAgentId: Map<string, ActiveTimeRef>;
}

function dateLabel(cfg: AprConfig): string {
  return cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;
}

function hourLabel(cfg: AprConfig): string {
  return `${formatHour(cfg.startHour)}-${formatHour(cfg.endHour)}`;
}

/** Display label for the report's "Campaign" column — the actual requested campaign, or "ALL" when APR_CAMPAIGN_NAME is blank/unset. */
export function campaignLabel(cfg: AprConfig): string {
  return cfg.campaignName ?? 'ALL';
}

export function startEndMinutes(cfg: AprConfig): { start: number; end: number } {
  return { start: cfg.startHour.h * 60 + cfg.startHour.m, end: cfg.endHour.h * 60 + cfg.endHour.m };
}

/**
 * Fetches the APR rows for `agentSelector` + `cfg`'s date range/campaign, plus everything needed
 * to cross-validate them: the matching Users-page record per agent, and an independently-fetched
 * "reference" Active Time per agent.
 *
 * Reference source design (see apr/README.md for the full reasoning — this app exposes APR as a
 * tab inside two existing pages rather than as its own standalone report, so "compare APR against
 * another page" is adapted as follows):
 *   - Today:      Live Dashboard > APR Analytics is authoritative; the reference Active Time is
 *                 pulled independently from Insights > APR queried for today's date — a separate
 *                 page/query hitting the same underlying metric.
 *   - Historical: Insights > APR is the only historical source this app has. The reference Active
 *                 Time is the same page's full (agent-search-cleared) result set, cross-checked
 *                 against the agent-search-scoped result set — i.e. verifying that searching for
 *                 one agent returns the same figure as pulling the full list, which is exactly the
 *                 "search first, then retrieve Active Time" flow the spec describes for historical
 *                 data (section 6).
 */
export async function gatherAprData(page: Page, cfg: AprConfig, agentSelector: AgentSelector): Promise<GatherResult> {
  const ctx: ValidationContext = { date: dateLabel(cfg), hour: hourLabel(cfg), campaign: campaignLabel(cfg), source: '' };
  const today = isToday(cfg.startDate, cfg.endDate);
  const activeTimeByAgentId = new Map<string, ActiveTimeRef>();
  let aprRows: AprAgentRow[];

  // Small helper so every fetch below honors "no campaign configured ⇒ don't filter at all"
  // the same way, instead of repeating the ternary at each call site.
  const fetchRows = (insights: InsightsAprPage) => (cfg.campaignName ? insights.getRowsForCampaign(cfg.campaignName) : insights.getAllRows());

  if (today) {
    ctx.source = 'Live Dashboard > APR Analytics';
    const live = new LiveDashboardAprPage(page);
    await live.goto();
    // Leaving the dashboard-wide campaign filter untouched shows every campaign (verified live —
    // its default/cleared state is unfiltered), which is exactly "no campaign filter requested".
    if (cfg.campaignName) await live.filterByCampaign(cfg.campaignName);
    if (agentSelector.mode === 'SPECIFIC') await live.searchAgent(agentSelector.name);
    aprRows = await live.getAllRows();

    const insights = new InsightsAprPage(page);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);
    if (agentSelector.mode === 'SPECIFIC') await insights.searchAgent(agentSelector.name);
    const refRows = await fetchRows(insights);
    for (const r of refRows) activeTimeByAgentId.set(r.agentId, { value: r.activeTime, source: 'Insights > APR (today, independent query)' });
  } else {
    ctx.source = 'Insights > APR';
    const insights = new InsightsAprPage(page);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);

    if (agentSelector.mode === 'SPECIFIC') {
      // Search-scoped query is the primary result; a second, agent-search-cleared full-list
      // fetch is the cross-check reference — this is the "search first, then retrieve Active
      // Time" flow the spec describes for historical data (section 6).
      await insights.searchAgent(agentSelector.name);
      aprRows = await fetchRows(insights);

      await insights.clearAgentSearch();
      const fullRows = await fetchRows(insights);
      for (const r of fullRows) activeTimeByAgentId.set(r.agentId, { value: r.activeTime, source: 'Insights > APR (full list, agent search cleared)' });
    } else {
      // ALL mode never applies an agent search, so the primary query already *is* the full
      // list — re-fetching it a second time as a "reference" would just be reading the same
      // table twice and risks a spurious mismatch if pagination/sort order isn't perfectly
      // stable across two reads a few hundred ms apart (observed live). Use it as its own
      // reference instead.
      aprRows = await fetchRows(insights);
      for (const r of aprRows) activeTimeByAgentId.set(r.agentId, { value: r.activeTime, source: 'Insights > APR (full list)' });
    }
  }

  const usersPage = new UsersPage(page);
  await usersPage.goto();
  const usersByAgentId = new Map<string, UserRecord>();
  for (const row of aprRows) {
    if (!row.agentId || usersByAgentId.has(row.agentId)) continue;
    const user = await usersPage.findByAgentId(row.agentId);
    if (user) usersByAgentId.set(row.agentId, user);
  }

  return { ctx, today, aprRows, usersByAgentId, activeTimeByAgentId };
}

/** Runs the full field-by-field validation (identity, duration, campaign, date/hour) for every gathered row. */
export function validateAll(recorder: AprReportRecorder, cfg: AprConfig, result: GatherResult) {
  const { start, end } = startEndMinutes(cfg);
  for (const row of result.aprRows) {
    const user = result.usersByAgentId.get(row.agentId) ?? null;
    validateAgentIdentity(recorder, result.ctx, row, user);

    const ref = result.activeTimeByAgentId.get(row.agentId);
    validateActiveDuration(recorder, result.ctx, row, ref?.value ?? '(not found)', ref?.source ?? result.ctx.source);

    // Nothing to check the row's campaign against when no campaign was requested (APR_CAMPAIGN_NAME blank ⇒ ALL).
    if (cfg.campaignName) validateCampaign(recorder, result.ctx, row, cfg.campaignName);
    validateDateHourWindow(recorder, result.ctx, row, start, end);
  }
}

/**
 * Resolves a concrete agent name to drive a "specific agent" scenario: the configured
 * APR_AGENT_NAME if it's not ALL, otherwise the first Agent-role user found on the Users page —
 * so specific-agent test cases are meaningful even when the suite's default configuration is ALL.
 */
export async function resolveSpecificAgentName(page: Page, cfg: AprConfig): Promise<string> {
  if (cfg.agent.mode === 'SPECIFIC') return cfg.agent.name;
  const usersPage = new UsersPage(page);
  await usersPage.goto();
  const rows = await usersPage.getAllRows();
  const agent = rows.find((r) => r.role.trim().toLowerCase() === 'agent');
  if (!agent) throw new Error('No Agent-role user found on the Users page to use for a specific-agent test run');
  return agent.name;
}
