import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { CallsPage } from '../../../../../apr/pages/CallsPage';
import { textsMatch, parseCallTimestamp, parseReportHourStart, durationToSeconds, secondsToHms, compareDurations } from '../../../../../apr/lib/normalize';
import { loadHourlyCallSummaryConfig } from '../config';
import { HourlyCallSummaryPage } from '../HourlyCallSummaryPage';

/**
 * Total Talk Time check: same selection/fetch pipeline as ./total-offered-calls-check.spec.ts,
 * but sums each matching call's "Agent Talk Time" (CallRecord.agentTalkTime) instead of counting
 * calls. Calls that never connected (Abandoned/Ongoing/Failed) carry no Agent Talk Time and
 * contribute 0s via durationToSeconds' "-"/blank ⇒ 0 convention, so no Call Status filtering is
 * needed here — every matching call in the hour window is summed.
 *
 *   Total Talk Time = sum(Agent Talk Time) over every matching call in the Report Hour window
 *
 * PASS when the calculated sum equals the Hourly Call Summary row's "Total Talk Time" within the
 * same 5s tolerance every other cross-page duration comparison in this suite uses (see
 * apr/lib/normalize.ts compareDurations) — the two values come from separate page loads (Calls
 * page vs Hourly Call Summary), unlike a same-page arithmetic check.
 */
test.describe('Hourly Call Summary — Total Talk Time check', () => {
  test('Total Talk Time equals the summed Calls page Agent Talk Time for Report Hour + Campaign Name + Queue Name + Call Direction', async ({
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
      await test.info().attach('total-talk-time-check-report', { body: reportText, contentType: 'text/plain' });
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

    const totalTalkSeconds = matchingCalls.reduce((sum, c) => sum + (durationToSeconds(c.agentTalkTime) ?? 0), 0);
    const calculatedTotalTalkTime = secondsToHms(totalTalkSeconds);
    const cmp = compareDurations(calculatedTotalTalkTime, matchingRow.totalTalkTime);

    reportLines.push(
      `Matched Hourly Call Summary row: Report Date ${matchingRow.reportDate}, Report Hour ${matchingRow.reportHour}`,
      `Reported Total Talk Time: ${matchingRow.totalTalkTime}`,
      `Calculated Total Talk Time (sum of Agent Talk Time): ${calculatedTotalTalkTime}`,
      '',
      'Matching calls in the hour window (Start Date Time | Call Status | Agent Talk Time):',
      ...matchingCalls.map((c) => `  ${c.timestamp} | ${c.callStatus} | ${c.agentTalkTime || '-'}`),
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`
    );
    if (!cmp.matches) {
      reportLines.push(
        `Mismatch: reported ${matchingRow.totalTalkTime}, calculated ${calculatedTotalTalkTime} (diff ${cmp.diffSeconds ?? 'N/A'}s)`
      );
    }

    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-talk-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(cmp.matches, reportText).toBe(true);
  });
});
