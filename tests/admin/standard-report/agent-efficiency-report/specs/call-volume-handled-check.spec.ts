import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { InsightsAprPage } from '../../../../../apr/pages/InsightsAprPage';
import { textsMatch, compareCounts } from '../../../../../apr/lib/normalize';
import { loadAgentEfficiencyConfig } from '../config';
import { AgentEfficiencyPage } from '../AgentEfficiencyPage';

/**
 * Call Volume Handled check: for every agent/date shown on Reports > Standard Reports > "Agent
 * Efficiency Report" (/client/reports/standard-reports?mode=agent_efficiency), cross-checks that
 * report's "Call Volume Handled" column against the same agent's "Total Calls" column on
 * Insights > APR (apr/pages/InsightsAprPage.ts) — same field/source pairing style as
 * ./tl-supervisor-name-check.spec.ts and ./avg-handling-time-check.spec.ts, just an exact count
 * comparison (no duration tolerance — see apr/lib/normalize.ts compareCounts) since both columns
 * are meant to represent the same call count under two different report names.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when, for every checked agent/date, Agent Efficiency "Call Volume Handled" exactly equals
 * Insights > APR "Total Calls" for that agent.
 */
test.describe('Agent Efficiency Report — Call Volume Handled check', () => {
  test('Call Volume Handled equals Total Calls (from Insights APR)', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentEfficiencyConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Efficiency report (report under test) ---
    const efficiencyPage = new AgentEfficiencyPage(page);
    const allEfficiencyRows = await efficiencyPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const efficiencyRows =
      cfg.agent.mode === 'SPECIFIC' ? allEfficiencyRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allEfficiencyRows;

    // --- Insights > APR (source of truth for Total Calls) — fetched once, matched client-side ---
    const insights = new InsightsAprPage(page);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);
    const aprRows = await insights.getAllRows();

    interface CallVolumeResult {
      agentName: string;
      date: string;
      callVolumeHandled: string;
      totalCalls: string;
      matches: boolean;
      reason?: string;
    }

    const notFound = '(agent not found on Insights APR)';

    const rows: CallVolumeResult[] = efficiencyRows.map((efficiency) => {
      const apr = aprRows.find((r) => textsMatch(r.agentName, efficiency.agentName));

      if (!apr) {
        return {
          agentName: efficiency.agentName,
          date: efficiency.date,
          callVolumeHandled: efficiency.callVolumeHandled,
          totalCalls: notFound,
          matches: false,
          reason: `Agent "${efficiency.agentName}" from Agent Efficiency was not found on Insights > APR`,
        };
      }

      const totalCallsRaw = apr.totalCalls.trim();
      const totalCalls = /^\d+$/.test(totalCallsRaw) ? Number(totalCallsRaw) : null;

      if (totalCalls === null) {
        return {
          agentName: efficiency.agentName,
          date: efficiency.date,
          callVolumeHandled: efficiency.callVolumeHandled,
          totalCalls: apr.totalCalls,
          matches: false,
          reason: `Could not parse Insights APR "Total Calls" "${apr.totalCalls}" for agent "${efficiency.agentName}"`,
        };
      }

      const cmp = compareCounts(efficiency.callVolumeHandled, totalCalls);

      return {
        agentName: efficiency.agentName,
        date: efficiency.date,
        callVolumeHandled: efficiency.callVolumeHandled,
        totalCalls: apr.totalCalls,
        matches: cmp.matches,
        reason: cmp.matches
          ? undefined
          : `Agent Efficiency "Call Volume Handled" "${efficiency.callVolumeHandled}" does not match Insights APR "Total Calls" "${apr.totalCalls}" (diff ${cmp.diff ?? 'N/A'})`,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Call Volume Handled | Insights APR Total Calls | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.callVolumeHandled.padEnd(20)} | ${r.totalCalls.padEnd(25)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
      '',
      ...rows.filter((r) => !r.matches).map((r) => `Mismatch: ${r.reason}`),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('call-volume-handled-check-report', { body: reportText, contentType: 'text/plain' });

    expect(efficiencyRows.length, 'No Agent Efficiency rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
