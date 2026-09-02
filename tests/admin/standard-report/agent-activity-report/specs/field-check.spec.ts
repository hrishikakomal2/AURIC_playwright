import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { UsersPage } from '../../../../../apr/pages/UsersPage';
import { InsightsAprPage } from '../../../../../apr/pages/InsightsAprPage';
import { textsMatch, compareTimeOfDay, compareClockTime } from '../../../../../apr/lib/normalize';
import { loadAgentActivityConfig } from '../config';
import { AgentActivityPage } from '../AgentActivityPage';

/**
 * Field consistency check: for every agent shown on Reports > Standard Reports > "Agent Activity"
 * (/client/reports/standard-reports?mode=agent_activity), cross-checks these fields against the
 * same agent's row on the Users page (/client/users) and on Insights > APR
 * (/client/insights) — the pages should agree:
 *
 *  - Agent Activity "TL/Supervisor Name"     <-> Users page "Team Lead"
 *  - Agent Activity "Shift Start Time"       <-> Users page "In Time"
 *  - Agent Activity "Shift End Time"         <-> Users page "Out Time"
 *  - Agent Activity "Logged-in Time"         <-> Insights > APR "First Login"
 *  - Agent Activity "Last Logged-out Time"   <-> Insights > APR "Last Logout"
 *
 * (Agent Activity "Active Time" <-> Insights > APR "Active Time" is checked separately — see
 * ./active-time-check.spec.ts.)
 *
 * The Shift/In-Out fields are compared by clock value, not raw text — confirmed live, Agent
 * Activity renders them 24-hour ("00:00:00") while the Users page renders 12-hour AM/PM ("12:00
 * AM"), so a literal string match would report a false mismatch even for identical times. See
 * apr/lib/normalize.ts compareTimeOfDay.
 *
 * The Logged-in/Last Logged-out fields are also compared by clock value, via compareClockTime —
 * both sides use the same "00:00:00 means not logged in" convention as First Login/Last Logout
 * elsewhere in this suite (see apr/lib/validate.ts validateDateHourWindow), so "00:00:00" isn't
 * treated as literal midnight there.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when every checked agent's Agent Activity value matches the corresponding reference value
 * for all five fields.
 */
test.describe('Agent Activity — field consistency check', () => {
  test('Team Lead, Shift/Login times match the Users page and Insights APR', async ({ page }) => {
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

    // --- Users page (source of truth for Team Lead / In-Out Time) — fetched once, matched client-side ---
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    const allUsers = await usersPage.getAllRows();

    // --- Insights > APR (source of truth for First Login / Last Logout) — fetched once, matched client-side ---
    const insightsPage = new InsightsAprPage(page);
    await insightsPage.goto();
    await insightsPage.setDateRange(cfg.startDate, cfg.endDate);
    const allInsightsRows = await insightsPage.getAllRows();

    interface FieldResult {
      agentName: string;
      date: string;
      field: string;
      activityValue: string;
      referenceValue: string;
      referenceSource: string;
      matches: boolean;
    }

    const notFound = (source: string) => `(agent not found on ${source})`;

    const rows: FieldResult[] = activityRows.flatMap((activity) => {
      const user = allUsers.find((u) => textsMatch(u.name, activity.agentName));
      const insightsRow = allInsightsRows.find((r) => textsMatch(r.agentName, activity.agentName));

      const shiftStartCmp = compareTimeOfDay(activity.shiftStartTime, user?.inTime);
      const shiftEndCmp = compareTimeOfDay(activity.shiftEndTime, user?.outTime);
      const loginCmp = compareClockTime(activity.loggedInTime, insightsRow?.firstLogin);
      const logoutCmp = compareClockTime(activity.lastLoggedOutTime, insightsRow?.lastLogout);

      return [
        {
          agentName: activity.agentName,
          date: activity.date,
          field: 'Team Lead',
          activityValue: activity.tlSupervisorName,
          referenceValue: user?.teamLead ?? notFound('Users page'),
          referenceSource: 'Users page (Team Lead)',
          matches: user ? textsMatch(activity.tlSupervisorName, user.teamLead) : false,
        },
        {
          agentName: activity.agentName,
          date: activity.date,
          field: 'Shift Start Time',
          activityValue: activity.shiftStartTime,
          referenceValue: user?.inTime ?? notFound('Users page'),
          referenceSource: 'Users page (In Time)',
          matches: user ? shiftStartCmp.matches : false,
        },
        {
          agentName: activity.agentName,
          date: activity.date,
          field: 'Shift End Time',
          activityValue: activity.shiftEndTime,
          referenceValue: user?.outTime ?? notFound('Users page'),
          referenceSource: 'Users page (Out Time)',
          matches: user ? shiftEndCmp.matches : false,
        },
        {
          agentName: activity.agentName,
          date: activity.date,
          field: 'Logged-in Time',
          activityValue: activity.loggedInTime,
          referenceValue: insightsRow?.firstLogin ?? notFound('Insights APR'),
          referenceSource: 'Insights APR (First Login)',
          matches: insightsRow ? loginCmp.matches : false,
        },
        {
          agentName: activity.agentName,
          date: activity.date,
          field: 'Last Logged-out Time',
          activityValue: activity.lastLoggedOutTime,
          referenceValue: insightsRow?.lastLogout ?? notFound('Insights APR'),
          referenceSource: 'Insights APR (Last Logout)',
          matches: insightsRow ? logoutCmp.matches : false,
        },
      ];
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${activityRows.length} (${rows.length} field comparisons)`,
      '',
      'Agent Name           | Date       | Field                 | Agent Activity Value | Reference Value      | Reference Source            | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.field.padEnd(21)} | ${r.activityValue.padEnd(21)} | ${r.referenceValue.padEnd(21)} | ${r.referenceSource.padEnd(
            28
          )} | ${r.matches ? 'Match' : 'Mismatch'}`
      ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('field-check-report', { body: reportText, contentType: 'text/plain' });

    expect(activityRows.length, 'No Agent Activity rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
