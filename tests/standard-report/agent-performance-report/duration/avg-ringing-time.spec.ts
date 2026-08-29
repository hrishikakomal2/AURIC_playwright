import { test, expect } from './fixtures';
import { durationToSeconds, secondsToHms, compareDurations } from '../../../../apr/lib/normalize';

/**
 * Avg Ringing Time validation: sums every hourly "Avg. Ringing Time" value for one agent from
 * Reports > Standard Reports > Agent Performance (the app's real hourly-granularity report — see
 * apr/pages/StandardReportsAgentPerformancePage.ts) across the configured date range, then
 * cross-checks that cumulative total against the "Avg Ringing Duration" figure for the same
 * agent/range on Insights > APR (apr/pages/InsightsAprPage.ts). "Avg Ringing Duration" is
 * confirmed live as the matching column on Insights — this app's naming convention consistently
 * swaps the hourly report's "...Time"/"...Duration" suffix on the Insights side.
 *
 * Note: like avg-acw-duration.spec.ts and avg-talk-time.spec.ts, "Avg. Ringing Time" is itself an
 * hourly *average* — summing per-hour averages is not generally equal to the single average
 * Insights reports across the whole range unless call volume happens to be even across hours. This
 * test implements the validation rule exactly as specified; a FAIL here may reflect that averaging
 * mismatch rather than a data bug.
 *
 * The Standard Report / Insights row sets are fetched once (login + filter applied a single time)
 * by the worker-scoped `durationData` fixture in ./fixtures.ts and shared across every file in
 * this directory — see that file for why.
 *
 * PASS when SUM(hourly Avg. Ringing Time) == Insights Avg Ringing Duration (within the same 5s
 * tolerance every other duration comparison in this suite uses, see apr/lib/normalize.ts).
 */
test.describe('APR — Avg Ringing Time validation', () => {
  test('cumulative hourly Avg Ringing Time matches Insights APR Avg Ringing Duration', async ({ durationData, aprReport }) => {
    test.setTimeout(300_000); // covers the shared fixture's one-time login+fetch if this is the first test to run

    const { agentName, startDate, endDate, matchingHourlyRows, insightsRow } = durationData;

    let cumulativeSeconds = 0;
    const hourlyBreakdown: string[] = [];
    for (const row of matchingHourlyRows) {
      const seconds = durationToSeconds(row.avgRingingTime) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.avgRingingTime || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insightsAvgRingingDuration = insightsRow?.avgRingingDuration ?? '(not found)';

    const cmp = compareDurations(cumulativeHms, insightsAvgRingingDuration);

    const reportLines = [
      `Agent Name: ${agentName}`,
      `APR Start Date: ${startDate}`,
      `APR End Date: ${endDate}`,
      '',
      'Hourly Avg. Ringing Time:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Avg. Ringing Time = ${cumulativeHms}`,
      `APR Insights Avg Ringing Duration = ${insightsAvgRingingDuration}`,
      `Difference                        = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('avg-ringing-time-report', { body: reportText, contentType: 'text/plain' });

    aprReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? insightsRow?.agentId ?? '',
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Avg Ringing Time',
      aprValue: cumulativeHms,
      referenceValue: insightsAvgRingingDuration,
      source: 'Insights > APR (Avg Ringing Duration) vs. Standard Reports > Agent Performance (hourly sum)',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Avg. Ringing Time "${cumulativeHms}" does not match Insights APR Avg Ringing Duration "${insightsAvgRingingDuration}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
