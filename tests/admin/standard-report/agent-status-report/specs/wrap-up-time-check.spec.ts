import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { InsightsAprPage } from '../../../../../apr/pages/InsightsAprPage';
import { textsMatch, compareDurations } from '../../../../../apr/lib/normalize';
import { loadAgentStatusConfig } from '../config';
import { AgentStatusPage } from '../AgentStatusPage';

/**
 * Wrap-Up Time check: for every agent/date shown on Reports > Standard Reports > "Agent Status"
 * (/client/reports/standard-reports?mode=agent_status), cross-checks that report's "Wrap-Up Time"
 * column against the same agent's "Total Wrap Up Time" column on Insights > APR
 * (apr/pages/InsightsAprPage.ts) — same field/source pairing style as
 * ./tl-supervisor-name-check.spec.ts, ./total-login-time-check.spec.ts and
 * ./on-call-time-check.spec.ts: a direct equality (no formula), since both columns are meant to
 * represent the same after-call-work duration under two different report names.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when, for every checked agent/date, Agent Status "Wrap-Up Time" equals Insights > APR
 * "Total Wrap Up Time" within the same 5s tolerance every other duration comparison in this suite
 * uses (see apr/lib/normalize.ts compareDurations).
 */
test.describe('Agent Status — Wrap-Up Time check', () => {
  test('Wrap-Up Time equals Total Wrap Up Time (from Insights APR)', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentStatusConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Status report (report under test) ---
    const statusPage = new AgentStatusPage(page);
    const allStatusRows = await statusPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const statusRows =
      cfg.agent.mode === 'SPECIFIC' ? allStatusRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allStatusRows;

    // --- Insights > APR (source of truth for Total Wrap Up Time) — fetched once, matched client-side ---
    const insights = new InsightsAprPage(page);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);
    const aprRows = await insights.getAllRows();

    interface WrapUpTimeResult {
      agentName: string;
      date: string;
      wrapUpTime: string;
      totalWrapUpTime: string;
      matches: boolean;
      reason?: string;
    }

    const notFound = '(agent not found on Insights APR)';

    const rows: WrapUpTimeResult[] = statusRows.map((status) => {
      const apr = aprRows.find((r) => textsMatch(r.agentName, status.agentName));

      if (!apr) {
        return {
          agentName: status.agentName,
          date: status.date,
          wrapUpTime: status.wrapUpTime,
          totalWrapUpTime: notFound,
          matches: false,
          reason: `Agent "${status.agentName}" from Agent Status was not found on Insights > APR`,
        };
      }

      const cmp = compareDurations(status.wrapUpTime, apr.totalWrapUpTime);

      return {
        agentName: status.agentName,
        date: status.date,
        wrapUpTime: status.wrapUpTime,
        totalWrapUpTime: apr.totalWrapUpTime,
        matches: cmp.matches,
        reason: cmp.matches
          ? undefined
          : `Agent Status "Wrap-Up Time" "${status.wrapUpTime}" does not match Insights APR "Total Wrap Up Time" "${apr.totalWrapUpTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Agent Status Wrap-Up Time | Insights APR Total Wrap Up Time | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.wrapUpTime.padEnd(26)} | ${r.totalWrapUpTime.padEnd(32)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
      '',
      ...rows.filter((r) => !r.matches).map((r) => `Mismatch: ${r.reason}`),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('wrap-up-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(statusRows.length, 'No Agent Status rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
