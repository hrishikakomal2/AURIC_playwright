import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { CallsPage } from '../../../../apr/pages/CallsPage';
import { textsMatch, parseCallTimestamp, parseReportHourStart, compareCounts } from '../../../../apr/lib/normalize';
import { loadHourlyCallSummaryConfig } from '../config';
import { HourlyCallSummaryPage } from '../HourlyCallSummaryPage';

/**
 * Total Answered Calls check: same selection/fetch pipeline as ./total-offered-calls-check.spec.ts
 * (selects the one Hourly Call Summary row matching REPORT_HOUR + CAMPAIGN_NAME + QUEUE_NAME +
 * CALL_DIRECTION, then fetches every matching call from the Calls page across the configured date
 * range and narrows to REPORT_HOUR's hour window on the matched row's Report Date), but counts
 * only calls the customer actually answered instead of every offered call.
 *
 *   Total Answered Calls = count of matching calls whose Call Status is "Success"
 *
 * "Success" was confirmed as the answered-call status live: it's the only Call Status among
 * Success/Abandoned/Ongoing/Failed that consistently carries a non-zero Total Duration/Agent Talk
 * Time — Abandoned/Failed never connected, and Ongoing hasn't finished yet (see
 * ./total-offered-calls-check.spec.ts's finding that Total Offered Calls itself excludes Ongoing
 * calls, i.e. only counts calls that have actually concluded one way or another).
 *
 * PASS when the calculated count exactly equals the Hourly Call Summary row's "Total Answered
 * Calls" (see apr/lib/normalize.ts compareCounts — no tolerance, this is a plain count).
 */
test.describe('Hourly Call Summary — Total Answered Calls check', () => {
  test('Total Answered Calls equals the Calls page Success count for Report Hour + Campaign Name + Queue Name + Call Direction', async ({
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
      await test.info().attach('total-answered-calls-check-report', { body: reportText, contentType: 'text/plain' });
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
    const answeredCalls = matchingCalls.filter((c) => textsMatch(c.callStatus, 'Success'));

    const calculatedCount = answeredCalls.length;
    const cmp = compareCounts(matchingRow.totalAnsweredCalls, calculatedCount);

    reportLines.push(
      `Matched Hourly Call Summary row: Report Date ${matchingRow.reportDate}, Report Hour ${matchingRow.reportHour}`,
      `Reported Total Answered Calls: ${matchingRow.totalAnsweredCalls}`,
      `Calculated count (Calls page, hour-filtered, Call Status = Success): ${calculatedCount}`,
      `Matching calls in the hour window before status filtering: ${matchingCalls.length}`,
      '',
      'All calls in the hour window (Start Date Time | Call Status):',
      ...matchingCalls.map((c) => `  ${c.timestamp} | ${c.callStatus}`),
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`
    );
    if (!cmp.matches) {
      reportLines.push(`Mismatch: reported ${matchingRow.totalAnsweredCalls}, calculated ${calculatedCount} (diff ${cmp.diff ?? 'N/A'})`);
    }

    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-answered-calls-check-report', { body: reportText, contentType: 'text/plain' });

    expect(cmp.matches, reportText).toBe(true);
  });
});
