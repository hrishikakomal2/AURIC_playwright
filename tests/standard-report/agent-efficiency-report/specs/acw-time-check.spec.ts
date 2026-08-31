import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { InsightsAprPage } from '../../../../apr/pages/InsightsAprPage';
import { textsMatch, compareDurations } from '../../../../apr/lib/normalize';
import { loadAgentEfficiencyConfig } from '../config';
import { AgentEfficiencyPage } from '../AgentEfficiencyPage';

/**
 * After Call Work (ACW) Time check: for every agent/date shown on Reports > Standard Reports >
 * "Agent Efficiency Report" (/client/reports/standard-reports?mode=agent_efficiency), cross-checks
 * that report's "After Call Work (ACW) Time" column against the same agent's "Total Wrap Up Time"
 * column on Insights > APR (apr/pages/InsightsAprPage.ts) — same field/source pairing style as
 * ./tl-supervisor-name-check.spec.ts and ./call-volume-handled-check.spec.ts: a direct equality
 * (no formula), since both columns are meant to represent the same after-call-work duration under
 * two different report names (ACW / Wrap Up are the same call-center concept under different
 * labels — same convention already noted for apr/lib/types.ts AprAgentRow.avgWrapUpTime and the
 * agent-status-report/specs/wrap-up-time-check.spec.ts pairing).
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when, for every checked agent/date, Agent Efficiency "After Call Work (ACW) Time" equals
 * Insights > APR "Total Wrap Up Time" within the same 5s tolerance every other duration comparison
 * in this suite uses (see apr/lib/normalize.ts compareDurations) — these two values are fetched
 * from separate page loads, unlike ./avg-handling-time-check.spec.ts's own-page arithmetic, so the
 * usual fetch-drift tolerance applies here rather than an exact match.
 */
test.describe('Agent Efficiency Report — After Call Work (ACW) Time check', () => {
  test('ACW Time equals Total Wrap Up Time (from Insights APR)', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentEfficiencyConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Efficiency report (report under test) ---
    const efficiencyPage = new AgentEfficiencyPage(page);
    const allEfficiencyRows = await efficiencyPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const efficiencyRows =
      cfg.agent.mode === 'SPECIFIC' ? allEfficiencyRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allEfficiencyRows;

    // --- Insights > APR (source of truth for Total Wrap Up Time) — fetched once, matched client-side ---
    const insights = new InsightsAprPage(page);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);
    const aprRows = await insights.getAllRows();

    interface AcwTimeResult {
      agentName: string;
      date: string;
      acwTime: string;
      totalWrapUpTime: string;
      matches: boolean;
      reason?: string;
    }

    const notFound = '(agent not found on Insights APR)';

    const rows: AcwTimeResult[] = efficiencyRows.map((efficiency) => {
      const apr = aprRows.find((r) => textsMatch(r.agentName, efficiency.agentName));

      if (!apr) {
        return {
          agentName: efficiency.agentName,
          date: efficiency.date,
          acwTime: efficiency.acwTime,
          totalWrapUpTime: notFound,
          matches: false,
          reason: `Agent "${efficiency.agentName}" from Agent Efficiency was not found on Insights > APR`,
        };
      }

      const cmp = compareDurations(efficiency.acwTime, apr.totalWrapUpTime);

      return {
        agentName: efficiency.agentName,
        date: efficiency.date,
        acwTime: efficiency.acwTime,
        totalWrapUpTime: apr.totalWrapUpTime,
        matches: cmp.matches,
        reason: cmp.matches
          ? undefined
          : `Agent Efficiency "After Call Work (ACW) Time" "${efficiency.acwTime}" does not match Insights APR "Total Wrap Up Time" "${apr.totalWrapUpTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Agent Efficiency ACW Time | Insights APR Total Wrap Up Time | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.acwTime.padEnd(25)} | ${r.totalWrapUpTime.padEnd(32)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
      '',
      ...rows.filter((r) => !r.matches).map((r) => `Mismatch: ${r.reason}`),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('acw-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(efficiencyRows.length, 'No Agent Efficiency rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
