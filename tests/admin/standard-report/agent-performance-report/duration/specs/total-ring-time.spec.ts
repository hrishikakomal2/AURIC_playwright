import { test, expect } from '../fixtures';
import { durationToSeconds, secondsToHms, compareDurations } from '../../../../../../apr/lib/normalize';

/**
 * Total Ring Time validation: sums every hourly "Total Ring Time" value for one agent from
 * Reports > Standard Reports > Agent Performance (the app's real hourly-granularity report — see
 * apr/pages/StandardReportsAgentPerformancePage.ts) across the configured date range, then
 * cross-checks that cumulative total against the aggregated "Total Ringing Duration" for the same
 * agent/range on Insights > APR (apr/pages/InsightsAprPage.ts) — confirmed live (Insights > APR
 * table, under the "Total" grouped-header column, distinct from "Avg Ringing Duration").
 *
 * Previously part of a combined ring-hold-time.spec.ts that cross-checked both Ring and Hold Time
 * against the Calls page, scoped to a single hour. Split out because Insights turned out to have
 * a matching Ring Time aggregate after all — see total-hold-time.spec.ts, which still cross-checks
 * against the Calls page (Insights has no Hold Time column at all).
 *
 * The Standard Report / Insights row sets are fetched once (login + filter applied a single time)
 * by the worker-scoped `durationData` fixture in ./fixtures.ts and shared across every file in
 * this directory — see that file for why.
 *
 * PASS when SUM(hourly Total Ring Time) == Insights Total Ringing Duration (within the same 5s
 * tolerance every other duration comparison in this suite uses, see apr/lib/normalize.ts).
 */
test.describe('APR — Total Ring Time validation', () => {
  test('cumulative hourly Total Ring Time matches Insights APR Total Ringing Duration', async ({ durationData, aprReport }) => {
    test.setTimeout(300_000); // covers the shared fixture's one-time login+fetch if this is the first test to run

    const { agentName, startDate, endDate, matchingHourlyRows, insightsRow } = durationData;

    let cumulativeSeconds = 0;
    const hourlyBreakdown: string[] = [];
    for (const row of matchingHourlyRows) {
      const seconds = durationToSeconds(row.totalRingTime) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.totalRingTime || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insightsTotalRingingDuration = insightsRow?.totalRingingDuration ?? '(not found)';

    const cmp = compareDurations(cumulativeHms, insightsTotalRingingDuration);

    const reportLines = [
      `Agent Name: ${agentName}`,
      `APR Start Date: ${startDate}`,
      `APR End Date: ${endDate}`,
      '',
      'Hourly Total Ring Time:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Total Ring Time = ${cumulativeHms}`,
      `APR Insights Total Ringing Duration = ${insightsTotalRingingDuration}`,
      `Difference                          = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-ring-time-report', { body: reportText, contentType: 'text/plain' });

    aprReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? insightsRow?.agentId ?? '',
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Total Ring Time',
      aprValue: cumulativeHms,
      referenceValue: insightsTotalRingingDuration,
      source: 'Insights > APR (Total Ringing Duration) vs. Standard Reports > Agent Performance (hourly sum)',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Total Ring Time "${cumulativeHms}" does not match Insights APR Total Ringing Duration "${insightsTotalRingingDuration}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
