import { test, expect } from './fixtures';
import { durationToSeconds, secondsToHms, compareDurations } from '../../../../apr/lib/normalize';

/**
 * Total Idle Time validation: sums every hourly "Total Idle Time" value for one agent from
 * Reports > Standard Reports > Agent Performance (the app's real hourly-granularity report — see
 * apr/pages/StandardReportsAgentPerformancePage.ts) across the configured date range, then
 * cross-checks that cumulative total against the aggregated "Total Waiting Time" for the same
 * agent/range on Insights > APR (apr/pages/InsightsAprPage.ts). "Total Waiting Time" and "Total
 * Idle Time" are the same call-center concept under different labels on the two pages, same
 * pattern as the ACW/Wrap Up and Ringing Time/Ringing Duration fields elsewhere in this suite.
 *
 * The Standard Report / Insights row sets are fetched once (login + filter applied a single time)
 * by the worker-scoped `durationData` fixture in ./fixtures.ts and shared across every file in
 * this directory — see that file for why.
 *
 * PASS when SUM(hourly Total Idle Time) == Insights Total Waiting Time (within the same 5s
 * tolerance every other duration comparison in this suite uses, see apr/lib/normalize.ts).
 */
test.describe('APR — Total Idle Time validation', () => {
  test('cumulative hourly Total Idle Time matches Insights APR Total Waiting Time', async ({ durationData, aprReport }) => {
    test.setTimeout(300_000); // covers the shared fixture's one-time login+fetch if this is the first test to run

    const { agentName, startDate, endDate, matchingHourlyRows, insightsRow } = durationData;

    let cumulativeSeconds = 0;
    const hourlyBreakdown: string[] = [];
    for (const row of matchingHourlyRows) {
      const seconds = durationToSeconds(row.totalIdleTime) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.totalIdleTime || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insightsTotalWaitingTime = insightsRow?.totalWaitingTime ?? '(not found)';

    const cmp = compareDurations(cumulativeHms, insightsTotalWaitingTime);

    const reportLines = [
      `Agent Name: ${agentName}`,
      `APR Start Date: ${startDate}`,
      `APR End Date: ${endDate}`,
      '',
      'Hourly Total Idle Time:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Total Idle Time = ${cumulativeHms}`,
      `APR Insights Total Waiting Time = ${insightsTotalWaitingTime}`,
      `Difference                      = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-idle-time-report', { body: reportText, contentType: 'text/plain' });

    aprReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? insightsRow?.agentId ?? '',
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Total Idle Time',
      aprValue: cumulativeHms,
      referenceValue: insightsTotalWaitingTime,
      source: 'Insights > APR (Total Waiting Time) vs. Standard Reports > Agent Performance (hourly sum)',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Total Idle Time "${cumulativeHms}" does not match Insights APR Total Waiting Time "${insightsTotalWaitingTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
