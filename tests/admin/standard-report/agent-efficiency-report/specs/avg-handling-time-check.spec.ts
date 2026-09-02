import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { InsightsAprPage } from '../../../../../apr/pages/InsightsAprPage';
import { textsMatch, durationToSeconds, secondsToHms, compareDurations } from '../../../../../apr/lib/normalize';
import { loadAgentEfficiencyConfig } from '../config';
import { AgentEfficiencyPage } from '../AgentEfficiencyPage';

/**
 * Average Handling Time (AHT) check: for every agent/date shown on Reports > Standard Reports >
 * "Agent Efficiency Report" (/client/reports/standard-reports?mode=agent_efficiency), computes
 *
 *   Average Handling Time = round((Total Talk Time + Total ACW Time) / Total Calls)
 *
 * from that same agent's "Agent Talk Time" (Total Talk Time), "Total Wrap Up Time" (this app's
 * name for ACW — see AprAgentRow in apr/lib/types.ts) and "Total Calls" columns on Insights > APR
 * (apr/pages/InsightsAprPage.ts), then cross-checks the computed value against the Agent
 * Efficiency report's own "Average Handling Time (AHT)" column — same field/source pairing style
 * as ./tl-supervisor-name-check.spec.ts.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when, for every checked agent/date, round((Talk Time + ACW Time) / Total Calls) (from
 * Insights > APR) equals the Agent Efficiency "Average Handling Time (AHT)" within the same 5s
 * tolerance every other duration comparison in this suite uses (see apr/lib/normalize.ts
 * compareDurations). An agent with zero Total Calls is expected to show "00:00:00" (no calls ⇒
 * nothing to average).
 */
test.describe('Agent Efficiency Report — Average Handling Time (AHT) check', () => {
  test('AHT equals round((Talk Time + ACW Time) / Total Calls) (from Insights APR)', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentEfficiencyConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Efficiency report (report under test) ---
    const efficiencyPage = new AgentEfficiencyPage(page);
    const allEfficiencyRows = await efficiencyPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const efficiencyRows =
      cfg.agent.mode === 'SPECIFIC' ? allEfficiencyRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allEfficiencyRows;

    // --- Insights > APR (source of truth for Talk Time / ACW Time / Total Calls) — fetched once, matched client-side ---
    const insights = new InsightsAprPage(page);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);
    const aprRows = await insights.getAllRows();

    interface AhtResult {
      agentName: string;
      date: string;
      talkTime: string;
      acwTime: string;
      totalCalls: string;
      calculatedAht: string;
      reportedAht: string;
      matches: boolean;
      reason?: string;
    }

    const notFound = '(agent not found on Insights APR)';

    const rows: AhtResult[] = efficiencyRows.map((efficiency) => {
      const apr = aprRows.find((r) => textsMatch(r.agentName, efficiency.agentName));

      if (!apr) {
        return {
          agentName: efficiency.agentName,
          date: efficiency.date,
          talkTime: notFound,
          acwTime: notFound,
          totalCalls: notFound,
          calculatedAht: notFound,
          reportedAht: efficiency.avgHandlingTime,
          matches: false,
          reason: `Agent "${efficiency.agentName}" from Agent Efficiency was not found on Insights > APR`,
        };
      }

      const talkSeconds = durationToSeconds(apr.agentTalkTime);
      const acwSeconds = durationToSeconds(apr.totalWrapUpTime);
      const totalCallsRaw = apr.totalCalls.trim();
      const totalCalls = /^\d+$/.test(totalCallsRaw) ? Number(totalCallsRaw) : null;

      if (talkSeconds === null || acwSeconds === null || totalCalls === null) {
        return {
          agentName: efficiency.agentName,
          date: efficiency.date,
          talkTime: apr.agentTalkTime,
          acwTime: apr.totalWrapUpTime,
          totalCalls: apr.totalCalls,
          calculatedAht: '(unparseable Talk Time/ACW Time/Total Calls)',
          reportedAht: efficiency.avgHandlingTime,
          matches: false,
          reason: `Could not parse Talk Time "${apr.agentTalkTime}", ACW Time "${apr.totalWrapUpTime}" or Total Calls "${apr.totalCalls}" for agent "${efficiency.agentName}"`,
        };
      }

      const calculatedSeconds = totalCalls > 0 ? Math.round((talkSeconds + acwSeconds) / totalCalls) : 0;
      const calculatedAht = secondsToHms(calculatedSeconds);

      // Exact match, not the suite's usual 5s fetch-drift tolerance: AHT is a same-page arithmetic
      // average (round((Talk Time + ACW Time) / Total Calls)), not two values fetched from
      // separate page loads a few seconds apart, so there's no timing drift to absorb — any
      // difference here is a real formula/data mismatch, not noise.
      const cmp = compareDurations(calculatedAht, efficiency.avgHandlingTime, 0);

      return {
        agentName: efficiency.agentName,
        date: efficiency.date,
        talkTime: apr.agentTalkTime,
        acwTime: apr.totalWrapUpTime,
        totalCalls: apr.totalCalls,
        calculatedAht,
        reportedAht: efficiency.avgHandlingTime,
        matches: cmp.matches,
        reason: cmp.matches
          ? undefined
          : `Calculated AHT "${calculatedAht}" (round((${apr.agentTalkTime} + ${apr.totalWrapUpTime}) / ${apr.totalCalls})) does not match Agent Efficiency "Average Handling Time (AHT)" "${efficiency.avgHandlingTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Talk Time | ACW Time  | Total Calls | Calculated AHT | Reported AHT | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.talkTime.padEnd(9)} | ${r.acwTime.padEnd(9)} | ${r.totalCalls.padEnd(
            11
          )} | ${r.calculatedAht.padEnd(15)} | ${r.reportedAht.padEnd(13)} | ${r.matches ? 'Match' : 'Mismatch'}`
      ),
      '',
      ...rows.filter((r) => !r.matches).map((r) => `Mismatch: ${r.reason}`),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('avg-handling-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(efficiencyRows.length, 'No Agent Efficiency rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
