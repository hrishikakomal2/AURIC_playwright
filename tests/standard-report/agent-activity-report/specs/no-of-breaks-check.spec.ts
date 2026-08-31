import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { ActivityLogsPage } from '../../../../apr/pages/ActivityLogsPage';
import { textsMatch, compareCounts } from '../../../../apr/lib/normalize';
import { loadAgentActivityConfig } from '../config';
import { AgentActivityPage } from '../AgentActivityPage';

/**
 * No. of Breaks Taken check: for every agent/date shown on Reports > Standard Reports > "Agent
 * Activity" (/client/reports/standard-reports?mode=agent_activity), cross-checks that report's
 * "No. of Breaks Taken" column against an independently-computed count from Profile > Activity
 * Logs (/client/profile/activity-logs) — filtered to Module "Break" and the agent's name, one log
 * entry counted per break actually taken on that date: any row whose Description contains "went
 * on break" (e.g. "Hrishika Komal 1 went on break(Tea)") — the "back from break" breakOut half of
 * each pair is deliberately NOT counted, so a break only counts once.
 *
 * Activity Logs' own Date Range filter does not reliably narrow the result set (confirmed live —
 * see ActivityLogsPage's class doc comment), so this fetches every "Break" module entry for the
 * agent and buckets it by the date portion of its timestamp client-side, rather than trusting
 * that filter.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when every checked agent/date's "No. of Breaks Taken" equals the number of "went on break"
 * Activity Log entries for that agent on that date (exact match, no tolerance — see
 * apr/lib/normalize.ts compareCounts).
 */
test.describe('Agent Activity — No. of Breaks Taken check', () => {
  test('No. of Breaks Taken matches breakIn count on Activity Logs', async ({ page }) => {
    test.setTimeout(180_000);

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

    // --- Activity Logs (source of truth for No. of Breaks Taken) ---
    // Fetched once per distinct agent name (searchAgent narrows reliably — see class doc comment)
    // and cached, since activityRows can have several date rows per agent.
    const activityLogsPage = new ActivityLogsPage(page);
    await activityLogsPage.goto();
    await activityLogsPage.filterToBreakModule();

    const logsByAgent = new Map<string, Awaited<ReturnType<typeof activityLogsPage.getAllRows>>>();
    for (const activity of activityRows) {
      if (logsByAgent.has(activity.agentName)) continue;
      await activityLogsPage.searchAgent(activity.agentName);
      logsByAgent.set(activity.agentName, await activityLogsPage.getAllRows());
    }

    interface BreaksResult {
      agentName: string;
      date: string;
      activityValue: string;
      referenceCount: number;
      matches: boolean;
    }

    const rows: BreaksResult[] = activityRows.map((activity) => {
      const logs = logsByAgent.get(activity.agentName) ?? [];
      const breakInCount = logs.filter((r) => r.date.startsWith(activity.date) && r.description.includes('went on break')).length;
      const cmp = compareCounts(activity.noOfBreaksTaken, breakInCount);

      return {
        agentName: activity.agentName,
        date: activity.date,
        activityValue: activity.noOfBreaksTaken,
        referenceCount: breakInCount,
        matches: cmp.matches,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Agent Activity No. of Breaks Taken | Activity Logs "went on break" Count | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.activityValue.padEnd(35)} | ${String(r.referenceCount).padEnd(28)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('no-of-breaks-check-report', { body: reportText, contentType: 'text/plain' });

    expect(activityRows.length, 'No Agent Activity rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
