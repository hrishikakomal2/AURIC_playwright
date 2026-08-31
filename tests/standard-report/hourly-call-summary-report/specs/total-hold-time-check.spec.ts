import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { CallsPage } from '../../../../apr/pages/CallsPage';
import { textsMatch, parseCallTimestamp, parseReportHourStart, durationToSeconds, secondsToHms, compareDurations } from '../../../../apr/lib/normalize';
import { loadHourlyCallSummaryConfig } from '../config';
import { HourlyCallSummaryPage } from '../HourlyCallSummaryPage';

/**
 * Total Hold Time check: same selection/fetch pipeline as ./total-talk-time-check.spec.ts, but
 * sums each matching call's "Hold Time" (CallRecord.holdTime) instead of Agent Talk Time. Calls
 * with no hold event carry no Hold Time and contribute 0s via durationToSeconds' "-"/blank ⇒ 0
 * convention, so no Call Status filtering is needed — every matching call in the hour window is
 * summed.
 *
 *   Total Hold Time = sum(Hold Time) over every matching call in the Report Hour window
 *
 * PASS when the calculated sum equals the Hourly Call Summary row's "Total Hold Time" within the
 * same 5s tolerance every other cross-page duration comparison in this suite uses (see
 * apr/lib/normalize.ts compareDurations).
 */
test.describe('Hourly Call Summary — Total Hold Time check', () => {
  test('Total Hold Time equals the summed Calls page Hold Time for Report Hour + Campaign Name + Queue Name + Call Direction', async ({
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
      await test.info().attach('total-hold-time-check-report', { body: reportText, contentType: 'text/plain' });
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

    const totalHoldSeconds = matchingCalls.reduce((sum, c) => sum + (durationToSeconds(c.holdTime) ?? 0), 0);
    const calculatedTotalHoldTime = secondsToHms(totalHoldSeconds);
    const cmp = compareDurations(calculatedTotalHoldTime, matchingRow.totalHoldTime);

    reportLines.push(
      `Matched Hourly Call Summary row: Report Date ${matchingRow.reportDate}, Report Hour ${matchingRow.reportHour}`,
      `Reported Total Hold Time: ${matchingRow.totalHoldTime}`,
      `Calculated Total Hold Time (sum of Hold Time): ${calculatedTotalHoldTime}`,
      '',
      'Matching calls in the hour window (Start Date Time | Call Status | Hold Time):',
      ...matchingCalls.map((c) => `  ${c.timestamp} | ${c.callStatus} | ${c.holdTime || '-'}`),
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`
    );
    if (!cmp.matches) {
      reportLines.push(
        `Mismatch: reported ${matchingRow.totalHoldTime}, calculated ${calculatedTotalHoldTime} (diff ${cmp.diffSeconds ?? 'N/A'}s)`
      );
    }

    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-hold-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(cmp.matches, reportText).toBe(true);
  });
});
