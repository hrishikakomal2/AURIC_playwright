import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { InsightsAprPage } from '../../../../../apr/pages/InsightsAprPage';
import { textsMatch, clockToSeconds, secondsToHms, compareDurations } from '../../../../../apr/lib/normalize';
import { loadAgentStatusConfig } from '../config';
import { AgentStatusPage } from '../AgentStatusPage';

/**
 * Total Login Time check: for every agent/date shown on Reports > Standard Reports > "Agent
 * Status" (/client/reports/standard-reports?mode=agent_status), computes
 * Total Login Time = Last Logout − First Login from that same agent's "First Login"/"Last Logout"
 * columns on Insights > APR (apr/pages/InsightsAprPage.ts), then cross-checks the computed value
 * against the Agent Status report's own "Total Login Time" column — same field/source pairing
 * style as ./tl-supervisor-name-check.spec.ts.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when, for every checked agent/date, Last Logout − First Login (from Insights > APR) equals
 * the Agent Status "Total Login Time" within the same 5s tolerance every other duration comparison
 * in this suite uses (see apr/lib/normalize.ts compareDurations). An agent with no login activity
 * recorded (First Login and Last Logout both blank/"00:00:00") is expected to show "00:00:00".
 */
test.describe('Agent Status — Total Login Time check', () => {
  test('Total Login Time equals Last Logout minus First Login (from Insights APR)', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentStatusConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Status report (report under test) ---
    const statusPage = new AgentStatusPage(page);
    const allStatusRows = await statusPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const statusRows =
      cfg.agent.mode === 'SPECIFIC' ? allStatusRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allStatusRows;

    // --- Insights > APR (source of truth for First Login / Last Logout) — fetched once, matched client-side ---
    const insights = new InsightsAprPage(page);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);
    const aprRows = await insights.getAllRows();

    interface TotalLoginTimeResult {
      agentName: string;
      date: string;
      firstLogin: string;
      lastLogout: string;
      calculatedLoginTime: string;
      statusLoginTime: string;
      matches: boolean;
      reason?: string;
    }

    const notFound = '(agent not found on Insights APR)';

    const rows: TotalLoginTimeResult[] = statusRows.map((status) => {
      const apr = aprRows.find((r) => textsMatch(r.agentName, status.agentName));

      if (!apr) {
        return {
          agentName: status.agentName,
          date: status.date,
          firstLogin: notFound,
          lastLogout: notFound,
          calculatedLoginTime: notFound,
          statusLoginTime: status.totalLoginTime,
          matches: false,
          reason: `Agent "${status.agentName}" from Agent Status was not found on Insights > APR`,
        };
      }

      const firstSeconds = clockToSeconds(apr.firstLogin);
      const lastSeconds = clockToSeconds(apr.lastLogout);

      // Both unset ⇒ no login activity recorded — matches the "00:00:00" convention used
      // elsewhere for an agent with no login at all (see clockToMinutes/clockToSeconds).
      const calculatedLoginTime =
        firstSeconds === null && lastSeconds === null
          ? '00:00:00'
          : firstSeconds === null || lastSeconds === null
            ? '(incomplete First Login/Last Logout data)'
            : secondsToHms(lastSeconds - firstSeconds);

      const cmp = compareDurations(calculatedLoginTime, status.totalLoginTime);

      return {
        agentName: status.agentName,
        date: status.date,
        firstLogin: apr.firstLogin,
        lastLogout: apr.lastLogout,
        calculatedLoginTime,
        statusLoginTime: status.totalLoginTime,
        matches: cmp.matches,
        reason: cmp.matches
          ? undefined
          : `Calculated Total Login Time "${calculatedLoginTime}" (Last Logout ${apr.lastLogout} − First Login ${apr.firstLogin}) does not match Agent Status "Total Login Time" "${status.totalLoginTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | First Login | Last Logout | Calculated Total Login Time | Agent Status Total Login Time | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.firstLogin.padEnd(11)} | ${r.lastLogout.padEnd(11)} | ${r.calculatedLoginTime.padEnd(
            28
          )} | ${r.statusLoginTime.padEnd(30)} | ${r.matches ? 'Match' : 'Mismatch'}`
      ),
      '',
      ...rows.filter((r) => !r.matches).map((r) => `Mismatch: ${r.reason}`),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-login-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(statusRows.length, 'No Agent Status rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
