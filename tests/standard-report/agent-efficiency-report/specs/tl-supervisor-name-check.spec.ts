import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { UsersPage } from '../../../../apr/pages/UsersPage';
import { textsMatch } from '../../../../apr/lib/normalize';
import { loadAgentEfficiencyConfig } from '../config';
import { AgentEfficiencyPage } from '../AgentEfficiencyPage';

/**
 * TL/Supervisor Name check: for every agent/date shown on Reports > Standard Reports > "Agent
 * Efficiency Report" (/client/reports/standard-reports?mode=agent_efficiency), cross-checks that
 * report's "TL/Supervisor Name" column against the same agent's row on the Users page
 * (/client/users) "Team Lead" column — same field/source pairing already validated for Agent
 * Activity (see ../../agent-activity-report/specs/field-check.spec.ts) and Agent Status (see
 * ../../agent-status-report/specs/tl-supervisor-name-check.spec.ts).
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when every checked agent/date's Agent Efficiency "TL/Supervisor Name" matches the Users
 * page "Team Lead" for that agent (exact text match, case/whitespace-insensitive).
 */
test.describe('Agent Efficiency Report — TL/Supervisor Name check', () => {
  test('TL/Supervisor Name matches the Users page Team Lead', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentEfficiencyConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Efficiency report (report under test) ---
    // Always fetch every agent for the date range and filter to the configured agent client-side
    // — this report's Filter dialog has no Agent Name field at all (see AgentEfficiencyPage's
    // class doc comment).
    const efficiencyPage = new AgentEfficiencyPage(page);
    const allEfficiencyRows = await efficiencyPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const efficiencyRows =
      cfg.agent.mode === 'SPECIFIC' ? allEfficiencyRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allEfficiencyRows;

    // --- Users page (source of truth for Team Lead) — fetched once, matched client-side ---
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    const allUsers = await usersPage.getAllRows();

    interface TlSupervisorResult {
      agentName: string;
      date: string;
      efficiencyValue: string;
      referenceValue: string;
      matches: boolean;
    }

    const notFound = '(agent not found on Users page)';

    const rows: TlSupervisorResult[] = efficiencyRows.map((efficiency) => {
      const user = allUsers.find((u) => textsMatch(u.name, efficiency.agentName));

      return {
        agentName: efficiency.agentName,
        date: efficiency.date,
        efficiencyValue: efficiency.tlSupervisorName,
        referenceValue: user?.teamLead ?? notFound,
        matches: user ? textsMatch(efficiency.tlSupervisorName, user.teamLead) : false,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Agent Efficiency TL/Supervisor Name | Users page Team Lead | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.efficiencyValue.padEnd(36)} | ${r.referenceValue.padEnd(21)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('tl-supervisor-name-check-report', { body: reportText, contentType: 'text/plain' });

    expect(efficiencyRows.length, 'No Agent Efficiency rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
