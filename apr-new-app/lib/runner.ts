import { Page } from '@playwright/test';
import { NewAppConfig, AgentSelector, formatHour, isToday } from '../config';
import { LiveDashboardAprPage } from '../pages/LiveDashboardAprPage';
import { InsightsAprPage } from '../pages/InsightsAprPage';
import { UsersPage } from '../pages/UsersPage';
import { AprAgentRow, UserRecord } from './types';
import { ValidationContext } from './validate';

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

function dateLabel(cfg: NewAppConfig): string {
  return cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;
}

function hourLabel(cfg: NewAppConfig): string {
  return `${formatHour(cfg.startHour)}-${formatHour(cfg.endHour)}`;
}

export function campaignLabel(cfg: NewAppConfig): string {
  return cfg.campaignName ?? 'ALL';
}

export function startEndMinutes(cfg: NewAppConfig): { start: number; end: number } {
  return { start: cfg.startHour.h * 60 + cfg.startHour.m, end: cfg.endHour.h * 60 + cfg.endHour.m };
}

/**
 * Fetches the APR rows for `agentSelector` + `cfg`'s date range/campaign, plus everything needed
 * to cross-validate them: the matching Users-page record per agent, and an independently-fetched
 * "reference" Active Time per agent. Own copy for this environment — see apr-new-app/README.md
 * "Isolation from the existing suite".
 */
export async function gatherAprData(page: Page, cfg: NewAppConfig, agentSelector: AgentSelector): Promise<GatherResult> {
  const ctx: ValidationContext = { date: dateLabel(cfg), hour: hourLabel(cfg), campaign: campaignLabel(cfg), source: '' };
  const today = isToday(cfg.startDate, cfg.endDate);
  const activeTimeByAgentId = new Map<string, ActiveTimeRef>();
  let aprRows: AprAgentRow[];

  const fetchRows = (insights: InsightsAprPage) => (cfg.campaignName ? insights.getRowsForCampaign(cfg.campaignName) : insights.getAllRows());

  if (today) {
    ctx.source = 'Live Dashboard > APR Analytics';
    const live = new LiveDashboardAprPage(page, cfg.baseUrl);
    await live.goto();
    if (cfg.campaignName) await live.filterByCampaign(cfg.campaignName);
    if (agentSelector.mode === 'SPECIFIC') await live.searchAgent(agentSelector.name);
    aprRows = await live.getAllRows();

    const insights = new InsightsAprPage(page, cfg.baseUrl);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);
    if (agentSelector.mode === 'SPECIFIC') await insights.searchAgent(agentSelector.name);
    const refRows = await fetchRows(insights);
    for (const r of refRows) activeTimeByAgentId.set(r.agentId, { value: r.activeTime, source: 'Insights > APR (today, independent query)' });
  } else {
    ctx.source = 'Insights > APR';
    const insights = new InsightsAprPage(page, cfg.baseUrl);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);

    if (agentSelector.mode === 'SPECIFIC') {
      await insights.searchAgent(agentSelector.name);
      aprRows = await fetchRows(insights);

      await insights.clearAgentSearch();
      const fullRows = await fetchRows(insights);
      for (const r of fullRows) activeTimeByAgentId.set(r.agentId, { value: r.activeTime, source: 'Insights > APR (full list, agent search cleared)' });
    } else {
      aprRows = await fetchRows(insights);
      for (const r of aprRows) activeTimeByAgentId.set(r.agentId, { value: r.activeTime, source: 'Insights > APR (full list)' });
    }
  }

  const usersPage = new UsersPage(page, cfg.baseUrl);
  await usersPage.goto();
  const usersByAgentId = new Map<string, UserRecord>();
  for (const row of aprRows) {
    if (!row.agentId || usersByAgentId.has(row.agentId)) continue;
    // This account's Users page search only matches Name/Username/Email — verified live, an
    // Agent ID search always returns zero rows even for an ID that exists — so look up by name
    // instead (still keyed by agentId in this map for lookup convenience elsewhere).
    const user = await usersPage.findByName(row.agentName);
    if (user) usersByAgentId.set(row.agentId, user);
  }

  return { ctx, today, aprRows, usersByAgentId, activeTimeByAgentId };
}

/**
 * Resolves a concrete agent name to drive a "specific agent" scenario: the configured
 * NEWAPP_APR_AGENT_NAME if it's not ALL, otherwise the first Agent-role user found on the Users
 * page.
 */
export async function resolveSpecificAgentName(page: Page, cfg: NewAppConfig): Promise<string> {
  if (cfg.agent.mode === 'SPECIFIC') return cfg.agent.name;
  const usersPage = new UsersPage(page, cfg.baseUrl);
  await usersPage.goto();
  const rows = await usersPage.getAllRows();
  const agent = rows.find((r) => r.role.trim().toLowerCase() === 'agent');
  if (!agent) throw new Error('No Agent-role user found on the Users page to use for a specific-agent test run');
  return agent.name;
}
