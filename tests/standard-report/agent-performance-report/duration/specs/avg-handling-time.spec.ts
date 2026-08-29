import { test, expect } from '../fixtures';
import { durationToSeconds, secondsToHms, compareDurations } from '../../../../../apr/lib/normalize';

/**
 * Avg Handling Time validation: sums every hourly "Avg. Handling Time" value for one agent from
 * Reports > Standard Reports > Agent Performance (the app's real hourly-granularity report — see
 * apr/pages/StandardReportsAgentPerformancePage.ts) across the configured date range, then
 * cross-checks that cumulative total against the "Avg Handling Time" figure for the same
 * agent/range on Insights > APR (apr/pages/InsightsAprPage.ts). Unlike the ACW/Ringing/Talk Time
 * fields elsewhere in this suite, both pages use the same name for this field (just missing the
 * period on the hourly side) — confirmed live.
 *
 * Note: like avg-acw-duration.spec.ts, avg-ringing-time.spec.ts and avg-talk-time.spec.ts, "Avg.
 * Handling Time" is itself an hourly *average* — summing per-hour averages is not generally equal
 * to the single average Insights reports across the whole range unless call volume happens to be
 * even across hours. This test implements the validation rule exactly as specified; a FAIL here
 * may reflect that averaging mismatch rather than a data bug.
 *
 * The Standard Report / Insights row sets are fetched once (login + filter applied a single time)
 * by the worker-scoped `durationData` fixture in ./fixtures.ts and shared across every file in
 * this directory — see that file for why.
 *
 * PASS when SUM(hourly Avg. Handling Time) == Insights Avg Handling Time (within the same 5s
 * tolerance every other duration comparison in this suite uses, see apr/lib/normalize.ts).
 */
test.describe('APR — Avg Handling Time validation', () => {
  test('cumulative hourly Avg Handling Time matches Insights APR Avg Handling Time', async ({ durationData, aprReport }) => {
    test.setTimeout(300_000); // covers the shared fixture's one-time login+fetch if this is the first test to run

    const { agentName, startDate, endDate, matchingHourlyRows, insightsRow } = durationData;

    let cumulativeSeconds = 0;
    const hourlyBreakdown: string[] = [];
    for (const row of matchingHourlyRows) {
      const seconds = durationToSeconds(row.avgHandlingTime) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.avgHandlingTime || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insightsAvgHandlingTime = insightsRow?.avgHandlingTime ?? '(not found)';

    const cmp = compareDurations(cumulativeHms, insightsAvgHandlingTime);

    const reportLines = [
      `Agent Name: ${agentName}`,
      `APR Start Date: ${startDate}`,
      `APR End Date: ${endDate}`,
      '',
      'Hourly Avg. Handling Time:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Avg. Handling Time = ${cumulativeHms}`,
      `APR Insights Avg Handling Time = ${insightsAvgHandlingTime}`,
      `Difference                     = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('avg-handling-time-report', { body: reportText, contentType: 'text/plain' });

    aprReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? insightsRow?.agentId ?? '',
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Avg Handling Time',
      aprValue: cumulativeHms,
      referenceValue: insightsAvgHandlingTime,
      source: 'Insights > APR (Avg Handling Time) vs. Standard Reports > Agent Performance (hourly sum)',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Avg. Handling Time "${cumulativeHms}" does not match Insights APR Avg Handling Time "${insightsAvgHandlingTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
