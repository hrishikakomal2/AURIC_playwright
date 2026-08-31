import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { textsMatch, durationToSeconds, secondsToHms, compareDurations } from '../../../../apr/lib/normalize';
import { loadAgentStatusConfig } from '../config';
import { AgentStatusPage } from '../AgentStatusPage';

/**
 * Available Time check: for every agent/date shown on Reports > Standard Reports > "Agent Status"
 * (/client/reports/standard-reports?mode=agent_status), computes
 * Available Time = Total Login Time − On Call Time − Wrap-Up Time − Break Time
 * from that same row's own columns, then cross-checks the computed value against the row's own
 * "Available Time" column — an internal-consistency check, unlike ./total-login-time-check.spec.ts
 * (which cross-checks against a different report). All five fields live on one AgentStatusRow, so
 * this needs only the one report fetch.
 *
 * Filters come from ./.env — AGENT_NAME (blank/unset or "ALL" ⇒ every agent shown in the report)
 * / START_DATE+END_DATE (blank/unset ⇒ today for both). Login credentials come from the shared
 * root .env (TEST_EMAIL/TEST_PASSWORD) — see ./config.ts for why they aren't duplicated here.
 *
 * PASS when, for every checked agent/date, Total Login Time − On Call Time − Wrap-Up Time − Break
 * Time equals the row's own "Available Time" within the same 5s tolerance every other duration
 * comparison in this suite uses (see apr/lib/normalize.ts compareDurations).
 */
test.describe('Agent Status — Available Time check', () => {
  test('Available Time equals Total Login Time minus On Call, Wrap-Up and Break Time', async ({ page }) => {
    test.setTimeout(120_000);

    const cfg = loadAgentStatusConfig();
    await loginAsAdmin(page, cfg);

    const statusPage = new AgentStatusPage(page);
    const allStatusRows = await statusPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const statusRows =
      cfg.agent.mode === 'SPECIFIC' ? allStatusRows.filter((r) => textsMatch(r.agentName, cfg.agent.name)) : allStatusRows;

    interface AvailableTimeResult {
      agentName: string;
      date: string;
      totalLoginTime: string;
      onCallTime: string;
      wrapUpTime: string;
      breakTime: string;
      calculatedAvailableTime: string;
      statusAvailableTime: string;
      matches: boolean;
      reason?: string;
    }

    const rows: AvailableTimeResult[] = statusRows.map((status) => {
      const totalLoginSeconds = durationToSeconds(status.totalLoginTime);
      const onCallSeconds = durationToSeconds(status.onCallTime);
      const wrapUpSeconds = durationToSeconds(status.wrapUpTime);
      const breakSeconds = durationToSeconds(status.breakTime);

      const anyUnparseable = [totalLoginSeconds, onCallSeconds, wrapUpSeconds, breakSeconds].some((s) => s === null);
      const calculatedAvailableTime = anyUnparseable
        ? '(unparseable Total Login/On Call/Wrap-Up/Break Time)'
        : secondsToHms((totalLoginSeconds as number) - (onCallSeconds as number) - (wrapUpSeconds as number) - (breakSeconds as number));

      const cmp = compareDurations(calculatedAvailableTime, status.availableTime);

      return {
        agentName: status.agentName,
        date: status.date,
        totalLoginTime: status.totalLoginTime,
        onCallTime: status.onCallTime,
        wrapUpTime: status.wrapUpTime,
        breakTime: status.breakTime,
        calculatedAvailableTime,
        statusAvailableTime: status.availableTime,
        matches: cmp.matches,
        reason: cmp.matches
          ? undefined
          : `Calculated Available Time "${calculatedAvailableTime}" (Total Login ${status.totalLoginTime} − On Call ${status.onCallTime} − Wrap-Up ${status.wrapUpTime} − Break ${status.breakTime}) does not match Agent Status "Available Time" "${status.availableTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
      };
    });

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;

    const reportLines = [
      `Agent: ${cfg.agent.mode === 'SPECIFIC' ? cfg.agent.name : 'ALL'}`,
      `Date: ${dateLabel}`,
      '',
      `Agents checked: ${rows.length}`,
      '',
      'Agent Name           | Date       | Total Login | On Call  | Wrap-Up  | Break    | Calculated Available Time | Agent Status Available Time | Match',
      ...rows.map(
        (r) =>
          `${r.agentName.padEnd(21)} | ${r.date.padEnd(10)} | ${r.totalLoginTime.padEnd(11)} | ${r.onCallTime.padEnd(8)} | ${r.wrapUpTime.padEnd(
            8
          )} | ${r.breakTime.padEnd(8)} | ${r.calculatedAvailableTime.padEnd(26)} | ${r.statusAvailableTime.padEnd(28)} | ${
            r.matches ? 'Match' : 'Mismatch'
          }`
      ),
      '',
      ...rows.filter((r) => !r.matches).map((r) => `Mismatch: ${r.reason}`),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('available-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(statusRows.length, 'No Agent Status rows found for the configured agent/date range').toBeGreaterThan(0);
    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
