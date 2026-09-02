import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { CallsPage } from '../../../../../apr/pages/CallsPage';
import { textsMatch, parseCallTimestamp, parseReportHourStart, durationToSeconds, secondsToHms, compareDurations } from '../../../../../apr/lib/normalize';
import { loadHourlyCallSummaryConfig } from '../config';
import { HourlyCallSummaryPage } from '../HourlyCallSummaryPage';

/**
 * Average Talk Time check: same selection/fetch pipeline as ./total-talk-time-check.spec.ts, but
 * divides the summed Agent Talk Time by the number of ANSWERED calls (Call Status = "Success" —
 * see ./total-answered-calls-check.spec.ts) rather than reporting the raw sum.
 *
 *   Average Talk Time = round(Total Talk Time / Total Answered Calls)
 *
 * Answered-call count is used as the divisor (not Total Offered Calls) because unconnected calls
 * (Abandoned/Ongoing/Failed) carry no Agent Talk Time at all — averaging talk time over calls
 * that were never talked on would be meaningless. This divisor choice is a hypothesis to be
 * confirmed by this test's own live PASS/FAIL result, same as
 * ./total-unanswered-calls-check.spec.ts's Failed→Unanswered mapping.
 *
 * PASS when the calculated average exactly equals the Hourly Call Summary row's "Average Talk
 * Time" (0s tolerance, not the suite's usual 5s fetch-drift tolerance — see
 * agent-efficiency-report/specs/avg-handling-time-check.spec.ts for why: this is a same-data
 * arithmetic average, not two values independently fetched with timing drift between them, so any
 * difference is a real formula mismatch. Confirmed live: round() overshoots by 1s (round(34/5) =
 * 7 vs a reported 6) while floor() lands exactly (floor(34/5) = 6) — this app truncates rather
 * than rounds.
 */
test.describe('Hourly Call Summary — Average Talk Time check', () => {
  test('Average Talk Time equals floor(Total Talk Time / Total Answered Calls) for Report Hour + Campaign Name + Queue Name + Call Direction', async ({
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
      await test.info().attach('avg-talk-time-check-report', { body: reportText, contentType: 'text/plain' });
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

    const totalTalkSeconds = matchingCalls.reduce((sum, c) => sum + (durationToSeconds(c.agentTalkTime) ?? 0), 0);
    const calculatedAvgSeconds = answeredCalls.length > 0 ? Math.floor(totalTalkSeconds / answeredCalls.length) : 0;
    const calculatedAvgTalkTime = secondsToHms(calculatedAvgSeconds);
    const cmp = compareDurations(calculatedAvgTalkTime, matchingRow.avgTalkTime, 0);

    reportLines.push(
      `Matched Hourly Call Summary row: Report Date ${matchingRow.reportDate}, Report Hour ${matchingRow.reportHour}`,
      `Reported Average Talk Time: ${matchingRow.avgTalkTime}`,
      `Total Talk Time (sum): ${secondsToHms(totalTalkSeconds)} (${totalTalkSeconds}s)`,
      `Answered calls (Call Status = Success): ${answeredCalls.length}`,
      `Calculated Average Talk Time = floor(${totalTalkSeconds}s / ${answeredCalls.length}) = ${calculatedAvgTalkTime}`,
      '',
      'Answered calls (Start Date Time | Agent Talk Time):',
      ...answeredCalls.map((c) => `  ${c.timestamp} | ${c.agentTalkTime || '-'}`),
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`
    );
    if (!cmp.matches) {
      reportLines.push(
        `Mismatch: reported ${matchingRow.avgTalkTime}, calculated ${calculatedAvgTalkTime} (diff ${cmp.diffSeconds ?? 'N/A'}s)`
      );
    }

    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('avg-talk-time-check-report', { body: reportText, contentType: 'text/plain' });

    expect(cmp.matches, reportText).toBe(true);
  });
});
