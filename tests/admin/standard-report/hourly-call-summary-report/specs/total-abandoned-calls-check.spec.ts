import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { CallsPage } from '../../../../../apr/pages/CallsPage';
import { textsMatch, parseCallTimestamp, parseReportHourStart, compareCounts } from '../../../../../apr/lib/normalize';
import { loadHourlyCallSummaryConfig } from '../config';
import { HourlyCallSummaryPage } from '../HourlyCallSummaryPage';

/**
 * Total Abandoned Calls check: same selection/fetch pipeline as
 * ./total-offered-calls-check.spec.ts and ./total-answered-calls-check.spec.ts, but counts calls
 * whose Call Status is "Abandoned" (the Calls page status whose name matches this column
 * directly — confirmed live: these are calls the agent rejected/disconnected before connecting,
 * evidenced by their "agent_disconnect" hangup reason and zero Total Duration).
 *
 *   Total Abandoned Calls = count of matching calls whose Call Status is "Abandoned"
 *
 * PASS when the calculated count exactly equals the Hourly Call Summary row's "Total Abandoned
 * Calls" (see apr/lib/normalize.ts compareCounts — no tolerance, this is a plain count).
 */
test.describe('Hourly Call Summary — Total Abandoned Calls check', () => {
  test('Total Abandoned Calls equals the Calls page Abandoned count for Report Hour + Campaign Name + Queue Name + Call Direction', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const cfg = loadHourlyCallSummaryConfig();
    await loginAsAdmin(page, cfg);

    // --- Hourly Call Summary report (report under test) ---
    const hourlyPage = new HourlyCallSummaryPage(page);
    const allRows = await hourlyPage.getRowsForDateRange(cfg.startDate, cfg.endDate);
    const matchingRow = allRows.find(
      (r) =>
        r.reportHour === cfg.reportHour &&
        textsMatch(r.campaignName, cfg.campaignName) &&
        textsMatch(r.queueName, cfg.queueName) &&
        textsMatch(r.callDirection, cfg.callDirection)
    );

    const reportLines: string[] = [
      `Report Hour: ${cfg.reportHour}`,
      `Campaign Name: ${cfg.campaignName}`,
      `Queue Name: ${cfg.queueName}`,
      `Call Direction: ${cfg.callDirection}`,
      `Date range: ${cfg.startDate}${cfg.startDate === cfg.endDate ? '' : ` to ${cfg.endDate}`}`,
      '',
    ];

    if (!matchingRow) {
      reportLines.push(
        `No Hourly Call Summary row found matching Report Hour "${cfg.reportHour}" + Campaign Name "${cfg.campaignName}" + Queue Name "${cfg.queueName}" + Call Direction "${cfg.callDirection}" in the configured date range.`,
        `Rows seen: ${allRows.length}`
      );
      const reportText = reportLines.join('\n');
      console.log(reportText);
      await test.info().attach('total-abandoned-calls-check-report', { body: reportText, contentType: 'text/plain' });
      expect(matchingRow, reportText).toBeTruthy();
      return;
    }

    // --- Calls page (source of truth) — Campaign Name + Campaign Queue + Call Type, whole configured range ---
    const callType = cfg.callDirection.trim().toLowerCase().replace(/^[a-z]/, (c) => c.toUpperCase());

    const callsPage = new CallsPage(page);
    const allCalls = await callsPage.getRowsForFilters({
      startDate: cfg.startDate,
      endDate: cfg.endDate,
      campaignName: cfg.campaignName,
      queueName: cfg.queueName,
      callType,
    });

    const targetHour = parseReportHourStart(cfg.reportHour);
    const matchingCalls = allCalls.filter((c) => {
      const ts = parseCallTimestamp(c.timestamp);
      if (!ts || targetHour === null) return false;
      return ts.isoDate === matchingRow.reportDate && ts.hour === targetHour;
    });
    const abandonedCalls = matchingCalls.filter((c) => textsMatch(c.callStatus, 'Abandoned'));

    const calculatedCount = abandonedCalls.length;
    const cmp = compareCounts(matchingRow.totalAbandonedCalls, calculatedCount);

    reportLines.push(
      `Matched Hourly Call Summary row: Report Date ${matchingRow.reportDate}, Report Hour ${matchingRow.reportHour}`,
      `Reported Total Abandoned Calls: ${matchingRow.totalAbandonedCalls}`,
      `Calculated count (Calls page, hour-filtered, Call Status = Abandoned): ${calculatedCount}`,
      `Matching calls in the hour window before status filtering: ${matchingCalls.length}`,
      '',
      'All calls in the hour window (Start Date Time | Call Status):',
      ...matchingCalls.map((c) => `  ${c.timestamp} | ${c.callStatus}`),
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`
    );
    if (!cmp.matches) {
      reportLines.push(`Mismatch: reported ${matchingRow.totalAbandonedCalls}, calculated ${calculatedCount} (diff ${cmp.diff ?? 'N/A'})`);
    }

    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-abandoned-calls-check-report', { body: reportText, contentType: 'text/plain' });

    expect(cmp.matches, reportText).toBe(true);
  });
});
