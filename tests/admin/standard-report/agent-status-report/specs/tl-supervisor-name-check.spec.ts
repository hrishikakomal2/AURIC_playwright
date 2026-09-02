import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { UsersPage } from '../../../../../apr/pages/UsersPage';
import { textsMatch } from '../../../../../apr/lib/normalize';
import { loadAgentStatusConfig } from '../config';
import { AgentStatusPage } from '../AgentStatusPage';

/**
 * TL/Supervisor Name check: for every agent/date shown on Reports > Standard Reports > "Agent
 * Status" (/client/reports/standard-reports?mode=agent_status), cross-checks that report's
 * "TL/Supervisor Name" column against the same agent's row on the Users page (/client/users)
 * "Team Lead" column — same field/source pairing already validated for the Agent Activity report
 * (see ../agent-activity-report/field-check.spec.ts).
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when every checked agent/date's Agent Status "TL/Supervisor Name" matches the Users page
 * "Team Lead" for that agent (exact text match, case/whitespace-insensitive).
 */
test.describe('Agent Status — TL/Supervisor Name check', () => {
  test('TL/Supervisor Name matches the Users page Team Lead', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentStatusConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Status report (report under test) ---
    // Always fetch every agent for the date range and filter to the configured agent client-side
    // — following AgentActivityPage's precedent, since this report's own Agent Name filter has
    // not been independently confirmed reliable (see AgentStatusPage's class doc comment).
    const statusPage = new AgentStatusPage(page);
    const allStatusRows = await statusPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const statusRows =
      cfg.agent.mode === 'SPECIFIC' ? allStatusRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allStatusRows;

    // --- Users page (source of truth for Team Lead) — fetched once, matched client-side ---
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    const allUsers = await usersPage.getAllRows();

    interface TlSupervisorResult {
      agentName: string;
      date: string;
      activityValue: string;
      referenceValue: string;
      matches: boolean;
    }

    const notFound = '(agent not found on Users page)';

    const rows: TlSupervisorResult[] = statusRows.map((status) => {
      const user = allUsers.find((u) => textsMatch(u.name, status.agentName));

      return {
        agentName: status.agentName,
        date: status.date,
        activityValue: status.tlSupervisorName,
        referenceValue: user?.teamLead ?? notFound,
        matches: user ? textsMatch(status.tlSupervisorName, user.teamLead) : false,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Agent Status TL/Supervisor Name | Users page Team Lead | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.activityValue.padEnd(32)} | ${r.referenceValue.padEnd(21)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('tl-supervisor-name-check-report', { body: reportText, contentType: 'text/plain' });

    expect(statusRows.length, 'No Agent Status rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
