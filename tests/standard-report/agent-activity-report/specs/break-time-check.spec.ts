import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { InsightsAprPage } from '../../../../apr/pages/InsightsAprPage';
import { textsMatch, compareDurations } from '../../../../apr/lib/normalize';
import { loadAgentActivityConfig } from '../config';
import { AgentActivityPage } from '../AgentActivityPage';

/**
 * Break Time check: for every agent shown on Reports > Standard Reports > "Agent Activity"
 * (/client/reports/standard-reports?mode=agent_activity), cross-checks that report's "Break Time"
 * column against the same agent's "Break Time" on Insights > APR (/client/insights) — same
 * pattern as active-time-check.spec.ts / idle-time-check.spec.ts.
 *
 * Compared as a duration (compareDurations, 5s tolerance) rather than a clock value — same
 * HH:MM:SS comparison the Agent Performance report's duration checks use (see
 * ../agent-performance-report/duration/total-active-duration.spec.ts).
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when every checked agent's Agent Activity "Break Time" matches Insights APR "Break Time".
 */
test.describe('Agent Activity — Break Time check', () => {
  test('Break Time matches Insights APR Break Time', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentActivityConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Activity report (report under test) ---
    // Always fetch every agent for the date range and filter to the configured agent client-side
    // — the report's own Agent Name filter was tested live and did not narrow the result set
    // despite the selection visibly registering, so this is the only reliable way to scope it
    // (see AgentActivityPage's class doc comment).
    const activityPage = new AgentActivityPage(page);
    const allActivityRows = await activityPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const activityRows =
      cfg.agent.mode === 'SPECIFIC' ? allActivityRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allActivityRows;

    // --- Insights > APR (source of truth for Break Time) — fetched once, matched client-side ---
    const insightsPage = new InsightsAprPage(page);
    await insightsPage.goto();
    await insightsPage.setDateRange(cfg.startDate, cfg.endDate);
    const allInsightsRows = await insightsPage.getAllRows();

    interface BreakTimeResult {
      agentName: string;
      date: string;
      activityValue: string;
      referenceValue: string;
      matches: boolean;
    }

    const notFound = '(agent not found on Insights APR)';

    const rows: BreakTimeResult[] = activityRows.map((activity) => {
      const insightsRow = allInsightsRows.find((r) => textsMatch(r.agentName, activity.agentName));
      const cmp = compareDurations(activity.breakTime, insightsRow?.breakTime);

      return {
        agentName: activity.agentName,
        date: activity.date,
        activityValue: activity.breakTime,
        referenceValue: insightsRow?.breakTime ?? notFound,
        matches: insightsRow ? cmp.matches : false,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Agent Activity Break Time | Insights APR Break Time | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.activityValue.padEnd(25)} | ${r.referenceValue.padEnd(24)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('break-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(activityRows.length, 'No Agent Activity rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
