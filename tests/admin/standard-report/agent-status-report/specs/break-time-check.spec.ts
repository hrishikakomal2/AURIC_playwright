import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { InsightsAprPage } from '../../../../../apr/pages/InsightsAprPage';
import { textsMatch, compareDurations } from '../../../../../apr/lib/normalize';
import { loadAgentStatusConfig } from '../config';
import { AgentStatusPage } from '../AgentStatusPage';

/**
 * Break Time check: for every agent/date shown on Reports > Standard Reports > "Agent Status"
 * (/client/reports/standard-reports?mode=agent_status), cross-checks that report's "Break Time"
 * column against the same agent's "Break Time" column on Insights > APR
 * (apr/pages/InsightsAprPage.ts) — same field/source pairing style as
 * ./tl-supervisor-name-check.spec.ts, ./total-login-time-check.spec.ts, ./on-call-time-check.spec.ts,
 * ./wrap-up-time-check.spec.ts and ./idle-time-check.spec.ts: a direct equality (no formula), since
 * both columns share the same name and are meant to represent the same duration.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when, for every checked agent/date, Agent Status "Break Time" equals Insights > APR
 * "Break Time" within the same 5s tolerance every other duration comparison in this suite uses
 * (see apr/lib/normalize.ts compareDurations).
 */
test.describe('Agent Status — Break Time check', () => {
  test('Break Time equals Break Time (from Insights APR)', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentStatusConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Status report (report under test) ---
    const statusPage = new AgentStatusPage(page);
    const allStatusRows = await statusPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const statusRows =
      cfg.agent.mode === 'SPECIFIC' ? allStatusRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allStatusRows;

    // --- Insights > APR (source of truth for Break Time) — fetched once, matched client-side ---
    const insights = new InsightsAprPage(page);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);
    const aprRows = await insights.getAllRows();

    interface BreakTimeResult {
      agentName: string;
      date: string;
      statusBreakTime: string;
      aprBreakTime: string;
      matches: boolean;
      reason?: string;
    }

    const notFound = '(agent not found on Insights APR)';

    const rows: BreakTimeResult[] = statusRows.map((status) => {
      const apr = aprRows.find((r) => textsMatch(r.agentName, status.agentName));

      if (!apr) {
        return {
          agentName: status.agentName,
          date: status.date,
          statusBreakTime: status.breakTime,
          aprBreakTime: notFound,
          matches: false,
          reason: `Agent "${status.agentName}" from Agent Status was not found on Insights > APR`,
        };
      }

      const cmp = compareDurations(status.breakTime, apr.breakTime);

      return {
        agentName: status.agentName,
        date: status.date,
        statusBreakTime: status.breakTime,
        aprBreakTime: apr.breakTime,
        matches: cmp.matches,
        reason: cmp.matches
          ? undefined
          : `Agent Status "Break Time" "${status.breakTime}" does not match Insights APR "Break Time" "${apr.breakTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Agent Status Break Time | Insights APR Break Time | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.statusBreakTime.padEnd(24)} | ${r.aprBreakTime.padEnd(24)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
      '',
      ...rows.filter((r) => !r.matches).map((r) => `Mismatch: ${r.reason}`),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('break-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(statusRows.length, 'No Agent Status rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
