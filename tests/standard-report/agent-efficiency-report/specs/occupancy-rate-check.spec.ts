import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { InsightsAprPage } from '../../../../apr/pages/InsightsAprPage';
import { textsMatch, durationToSeconds, clockToSeconds, comparePercent } from '../../../../apr/lib/normalize';
import { loadAgentEfficiencyConfig } from '../config';
import { AgentEfficiencyPage } from '../AgentEfficiencyPage';

/**
 * Occupancy Rate check: for every agent/date shown on Reports > Standard Reports > "Agent
 * Efficiency Report" (/client/reports/standard-reports?mode=agent_efficiency), computes
 *
 *   Occupancy Rate = ((Total Connected Duration + Wrap-Up Time) / (Last Logout − First Login)) × 100
 *
 * from that same agent's "Active Time" (this app's name for Total Connected/Active Duration —
 * see AprAgentRow.activeTime in apr/lib/types.ts), "Total Wrap Up Time" and "First Login"/"Last
 * Logout" columns on Insights > APR (apr/pages/InsightsAprPage.ts), then cross-checks the computed
 * value against the Agent Efficiency report's own "Occupancy Rate" column — same field/source
 * pairing style as ./avg-handling-time-check.spec.ts.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when, for every checked agent/date, the calculated Occupancy Rate (from Insights > APR)
 * equals the Agent Efficiency "Occupancy Rate" within 1 percentage point (see apr/lib/normalize.ts
 * comparePercent) — a tighter tolerance than the suite's 5s duration tolerance, since a percentage
 * amplifies small second-level rounding into a visible point-level gap.
 */
test.describe('Agent Efficiency Report — Occupancy Rate check', () => {
  test('Occupancy Rate equals ((Active Time + Wrap Up Time) / (Last Logout − First Login)) × 100 (from Insights APR)', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentEfficiencyConfig();
    await loginAsAdmin(page, cfg);

    // --- Agent Efficiency report (report under test) ---
    const efficiencyPage = new AgentEfficiencyPage(page);
    const allEfficiencyRows = await efficiencyPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const efficiencyRows =
      cfg.agent.mode === 'SPECIFIC' ? allEfficiencyRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allEfficiencyRows;

    // --- Insights > APR (source of truth for Active Time / Wrap Up Time / First Login / Last Logout) — fetched once, matched client-side ---
    const insights = new InsightsAprPage(page);
    await insights.goto();
    await insights.setDateRange(cfg.startDate, cfg.endDate);
    const aprRows = await insights.getAllRows();

    interface OccupancyResult {
      agentName: string;
      date: string;
      activeTime: string;
      wrapUpTime: string;
      firstLogin: string;
      lastLogout: string;
      calculatedOccupancy: string;
      reportedOccupancy: string;
      matches: boolean;
      reason?: string;
    }

    const notFound = '(agent not found on Insights APR)';

    const rows: OccupancyResult[] = efficiencyRows.map((efficiency) => {
      const apr = aprRows.find((r) => textsMatch(r.agentName, efficiency.agentName));

      if (!apr) {
        return {
          agentName: efficiency.agentName,
          date: efficiency.date,
          activeTime: notFound,
          wrapUpTime: notFound,
          firstLogin: notFound,
          lastLogout: notFound,
          calculatedOccupancy: notFound,
          reportedOccupancy: efficiency.occupancyRate,
          matches: false,
          reason: `Agent "${efficiency.agentName}" from Agent Efficiency was not found on Insights > APR`,
        };
      }

      const activeSeconds = durationToSeconds(apr.activeTime);
      const wrapUpSeconds = durationToSeconds(apr.totalWrapUpTime);
      const firstSeconds = clockToSeconds(apr.firstLogin);
      const lastSeconds = clockToSeconds(apr.lastLogout);

      const base = {
        agentName: efficiency.agentName,
        date: efficiency.date,
        activeTime: apr.activeTime,
        wrapUpTime: apr.totalWrapUpTime,
        firstLogin: apr.firstLogin,
        lastLogout: apr.lastLogout,
        reportedOccupancy: efficiency.occupancyRate,
      };

      if (activeSeconds === null || wrapUpSeconds === null) {
        return {
          ...base,
          calculatedOccupancy: '(unparseable Active Time/Wrap Up Time)',
          matches: false,
          reason: `Could not parse Active Time "${apr.activeTime}" or Total Wrap Up Time "${apr.totalWrapUpTime}" for agent "${efficiency.agentName}"`,
        };
      }

      if (firstSeconds === null || lastSeconds === null) {
        return {
          ...base,
          calculatedOccupancy: '(no First Login/Last Logout recorded)',
          matches: false,
          reason: `Agent "${efficiency.agentName}" has no First Login ("${apr.firstLogin}") / Last Logout ("${apr.lastLogout}") recorded on Insights > APR — cannot compute the denominator`,
        };
      }

      const loginDurationSeconds = lastSeconds - firstSeconds;
      if (loginDurationSeconds <= 0) {
        return {
          ...base,
          calculatedOccupancy: '(non-positive Last Logout − First Login)',
          matches: false,
          reason: `Last Logout "${apr.lastLogout}" − First Login "${apr.firstLogin}" is not positive (${loginDurationSeconds}s) for agent "${efficiency.agentName}"`,
        };
      }

      const calculatedRate = ((activeSeconds + wrapUpSeconds) / loginDurationSeconds) * 100;
      const calculatedOccupancy = `${Math.round(calculatedRate)}%`;

      const cmp = comparePercent(calculatedOccupancy, efficiency.occupancyRate);

      return {
        ...base,
        calculatedOccupancy,
        matches: cmp.matches,
        reason: cmp.matches
          ? undefined
          : `Calculated Occupancy Rate "${calculatedOccupancy}" (((${apr.activeTime} + ${apr.totalWrapUpTime}) / (${apr.lastLogout} − ${apr.firstLogin})) × 100) does not match Agent Efficiency "Occupancy Rate" "${efficiency.occupancyRate}" (diff ${cmp.diff ?? 'N/A'}pt)`,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Active Time | Wrap Up Time | First Login | Last Logout | Calculated | Reported | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.activeTime.padEnd(11)} | ${r.wrapUpTime.padEnd(13)} | ${r.firstLogin.padEnd(
            11
          )} | ${r.lastLogout.padEnd(12)} | ${r.calculatedOccupancy.padEnd(28)} | ${r.reportedOccupancy.padEnd(8)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
      '',
      ...rows.filter((r) => !r.matches).map((r) => `Mismatch: ${r.reason}`),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('occupancy-rate-check-report', { body: reportText, contentType: 'text/plain' });

    expect(efficiencyRows.length, 'No Agent Efficiency rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
