import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { CallsPage } from '../../../../apr/pages/CallsPage';
import { textsMatch, parseCallTimestamp, parseReportHourStart, compareCounts } from '../../../../apr/lib/normalize';
import { loadHourlyCallSummaryConfig } from '../config';
import { HourlyCallSummaryPage } from '../HourlyCallSummaryPage';

/**
 * Total Offered Calls check: selects the one Reports > Standard Reports > "Hourly Call Summary"
 * (/client/reports/standard-reports?mode=hourly) row matching REPORT_HOUR + CAMPAIGN_NAME +
 * QUEUE_NAME + CALL_DIRECTION (./.env), then computes a reference count from the Calls page
 * (/client/calls/merge-calls — apr/pages/CallsPage.ts):
 *
 *   Total Offered Calls = count of every call on the Calls page matching Campaign Name + Campaign
 *   Queue (Queue Name) + Call Type (Call Direction) whose Start Date Time falls within
 *   REPORT_HOUR's hour window on the matched row's Report Date — regardless of Call Status
 *   (answered, unanswered, abandoned all count).
 *
 * The Calls page itself has no Hour filter or Report Hour concept (confirmed live), so the hour
 * window is applied client-side against CallRecord.timestamp after fetching every call for the
 * campaign/queue/direction across the whole configured date range.
 *
 * Field-name note (confirmed live, not guessed): the Calls page's "Campaign Queue" filter is what
 * actually holds Queue Name values (e.g. "new queue") despite its label, and its "Call Type"
 * filter (not "Call Flow" — that field holds unrelated IVR flow names) is what holds
 * Incoming/Outgoing direction values. See CallsPage.ts selectCampaignQueue/selectCallType.
 *
 * PASS when the calculated count exactly equals the Hourly Call Summary row's "Total Offered
 * Calls" (see apr/lib/normalize.ts compareCounts — no tolerance, this is a plain count).
 */
test.describe('Hourly Call Summary — Total Offered Calls check', () => {
  test('Total Offered Calls equals the Calls page count for Report Hour + Campaign Name + Queue Name + Call Direction', async ({ page }) => {
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
      await test.info().attach('total-offered-calls-check-report', { body: reportText, contentType: 'text/plain' });
      expect(matchingRow, reportText).toBeTruthy();
      return;
    }

    // --- Calls page (source of truth) — Campaign Name + Campaign Queue + Call Type, whole configured range ---
    // The Calls page's Call Type options are Title Case ("Outgoing"/"Incoming"); the Hourly Call
    // Summary's Call Direction is upper case ("OUTGOING") — same value, different casing.
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

    const calculatedCount = matchingCalls.length;
    const cmp = compareCounts(matchingRow.totalOfferedCalls, calculatedCount);

    reportLines.push(
      `Matched Hourly Call Summary row: Report Date ${matchingRow.reportDate}, Report Hour ${matchingRow.reportHour}`,
      `Reported Total Offered Calls: ${matchingRow.totalOfferedCalls}`,
      `Calculated count (Calls page, hour-filtered): ${calculatedCount}`,
      `Calls page rows fetched (whole date range, before hour filtering): ${allCalls.length}`,
      '',
      'Matching calls (Start Date Time | Call Status):',
      ...matchingCalls.map((c) => `  ${c.timestamp} | ${c.callStatus}`),
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`
    );
    if (!cmp.matches) {
      reportLines.push(`Mismatch: reported ${matchingRow.totalOfferedCalls}, calculated ${calculatedCount} (diff ${cmp.diff ?? 'N/A'})`);
    }

    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-offered-calls-check-report', { body: reportText, contentType: 'text/plain' });

    expect(cmp.matches, reportText).toBe(true);
  });
});
