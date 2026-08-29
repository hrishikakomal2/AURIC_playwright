import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../apr/lib/session';
import { ActivityLogsPage } from '../../../apr/pages/ActivityLogsPage';
import { ActivityLogRow } from '../../../apr/lib/types';
import { textsMatch, compareDurations, secondsToHms, activityLogTimestampToMs } from '../../../apr/lib/normalize';
import { loadAgentActivityConfig } from './config';
import { AgentActivityPage } from './AgentActivityPage';

/**
 * Auto Call Off Time check: for every agent/date shown on Reports > Standard Reports > "Agent
 * Activity" (/client/reports/standard-reports?mode=agent_activity), cross-checks that report's
 * "Auto Call Off Time" column against an independently-computed duration from Profile > Activity
 * Logs (/client/profile/activity-logs) — filtered to Module "Calls" and the agent's name.
 *
 * Calculation: Activity Logs records one row per toggle — Description ending "Set Auto Call
 * Successfully On" / "...Successfully Off". Sorting an agent's rows chronologically and pairing
 * each "On" with the next "Off" after it gives one session per pair; its duration is
 * (Off timestamp − On timestamp). E.g. (confirmed live shape, different account):
 *   Harish Garg Set Auto Call Successfully On  — 2026-08-25 11:56:52
 *   Harish Garg Set Auto Call Successfully Off — 2026-08-27 15:15:26
 * is one ~2-day session. A session's whole duration is attributed to the date its "On" event
 * happened on (not split across the days it spans) — the same "bucket by the start event's date"
 * rule no-of-breaks-check.spec.ts uses for breakIn events — then every session starting on a
 * given date is summed to get that date's total. A trailing "On" with no following "Off" (still
 * in progress) and a leading "Off" with no preceding "On" are both left out of the sum, since
 * neither has a computable duration.
 *
 * "Calls" was NOT reproducible live end-to-end in this test account (it returns "No data" there —
 * the account has zero rows in any module beyond auth/break/campaign across its whole history),
 * so only that "Calls" is a real, selectable Module value was confirmed live, not the exact
 * Auto Call row shape — see ActivityLogsPage's class doc comment.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when every checked agent/date's "Auto Call Off Time" matches the summed session durations
 * computed above (5s tolerance — see apr/lib/normalize.ts compareDurations).
 */
test.describe('Agent Activity — Auto Call Off Time check', () => {
  test('Auto Call Off Time matches summed Activity Logs On/Off sessions', async ({ page }) => {
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

    // --- Activity Logs (source of truth for Auto Call Off Time) ---
    // Fetched once per distinct agent name (searchAgent narrows reliably — see class doc comment)
    // and cached, since activityRows can have several date rows per agent.
    const activityLogsPage = new ActivityLogsPage(page);
    await activityLogsPage.goto();
    await activityLogsPage.filterByModule('Calls');

    const logsByAgent = new Map<string, ActivityLogRow[]>();
    for (const activity of activityRows) {
      if (logsByAgent.has(activity.agentName)) continue;
      await activityLogsPage.searchAgent(activity.agentName);
      logsByAgent.set(activity.agentName, await activityLogsPage.getAllRows());
    }

    /** Sums every On→Off session's duration into the bucket keyed by the On event's date (YYYY-MM-DD). */
    function sumAutoCallSecondsByDate(logs: ActivityLogRow[]): Map<string, number> {
      const events = logs
        .map((r) => {
          const isOn = /Set Auto Call Successfully On\s*$/.test(r.description);
          const isOff = /Set Auto Call Successfully Off\s*$/.test(r.description);
          const ms = activityLogTimestampToMs(r.date);
          return isOn || isOff ? { ms, isOn, date: r.date.slice(0, 10) } : null;
        })
        .filter((e): e is { ms: number | null; isOn: boolean; date: string } => e !== null && e.ms !== null)
        .sort((a, b) => (a.ms as number) - (b.ms as number));

      const totals = new Map<string, number>();
      let pendingOnMs: number | null = null;
      let pendingOnDate: string | null = null;
      for (const e of events) {
        if (e.isOn) {
          pendingOnMs = e.ms;
          pendingOnDate = e.date;
        } else if (pendingOnMs !== null && pendingOnDate !== null) {
          const durationSeconds = ((e.ms as number) - pendingOnMs) / 1000;
          totals.set(pendingOnDate, (totals.get(pendingOnDate) ?? 0) + durationSeconds);
          pendingOnMs = null;
          pendingOnDate = null;
        }
      }
      return totals;
    }

    const totalsByAgent = new Map<string, Map<string, number>>();
    for (const [agentName, logs] of logsByAgent) {
      totalsByAgent.set(agentName, sumAutoCallSecondsByDate(logs));
    }

    interface AutoCallResult {
      agentName: string;
      date: string;
      activityValue: string;
      referenceHms: string;
      matches: boolean;
    }

    const rows: AutoCallResult[] = activityRows.map((activity) => {
      const referenceSeconds = totalsByAgent.get(activity.agentName)?.get(activity.date) ?? 0;
      const referenceHms = secondsToHms(referenceSeconds);
      const cmp = compareDurations(activity.autoCallOffTime, referenceHms);

      return {
        agentName: activity.agentName,
        date: activity.date,
        activityValue: activity.autoCallOffTime,
        referenceHms,
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
      'Agent Name           | Date       | Agent Activity Auto Call Off Time | Activity Logs Summed Sessions | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.activityValue.padEnd(34)} | ${r.referenceHms.padEnd(30)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('auto-call-off-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(activityRows.length, 'No Agent Activity rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
