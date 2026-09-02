import { test, expect } from '../fixtures';
import { durationToSeconds, secondsToHms, compareDurations } from '../../../../../../apr/lib/normalize';

/**
 * Total Active Duration validation: sums every hourly "Total Active Duration" value for one agent
 * from Reports > Standard Reports > Agent Performance (the app's real hourly-granularity report —
 * see apr/pages/StandardReportsAgentPerformancePage.ts) across the configured date range, then
 * cross-checks that cumulative total against the aggregated "Active Time" for the same agent/range
 * on Insights > APR (apr/pages/InsightsAprPage.ts).
 *
 * The Standard Report / Insights row sets are fetched once (login + filter applied a single time)
 * by the worker-scoped `durationData` fixture in ./fixtures.ts and shared across every file in
 * this directory — see that file for why.
 *
 * PASS when SUM(hourly Total Active Duration) == Insights Active Time (within the same 5s
 * tolerance every other duration comparison in this suite uses, see apr/lib/normalize.ts).
 */
test.describe('APR — Total Active Duration validation', () => {
  test('cumulative hourly Total Active Duration matches Insights APR Active Time', async ({ durationData, aprReport }) => {
    test.setTimeout(300_000); // covers the shared fixture's one-time login+fetch if this is the first test to run

    const { agentName, startDate, endDate, matchingHourlyRows, insightsRow } = durationData;

    let cumulativeSeconds = 0;
    const hourlyBreakdown: string[] = [];
    for (const row of matchingHourlyRows) {
      const seconds = durationToSeconds(row.totalActiveDuration) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.totalActiveDuration || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insightsActiveTime = insightsRow?.activeTime ?? '(not found)';

    const cmp = compareDurations(cumulativeHms, insightsActiveTime);

    const reportLines = [
      `Agent Name: ${agentName}`,
      `APR Start Date: ${startDate}`,
      `APR End Date: ${endDate}`,
      '',
      'Hourly Total Active Duration:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Total Active Duration = ${cumulativeHms}`,
      `APR Insights Active Time          = ${insightsActiveTime}`,
      `Difference                        = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-active-duration-report', { body: reportText, contentType: 'text/plain' });

    aprReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? insightsRow?.agentId ?? '',
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Total Active Duration',
      aprValue: cumulativeHms,
      referenceValue: insightsActiveTime,
      source: 'Insights > APR (Active Time) vs. Standard Reports > Agent Performance (hourly sum)',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Total Active Duration "${cumulativeHms}" does not match Insights APR Active Time "${insightsActiveTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
