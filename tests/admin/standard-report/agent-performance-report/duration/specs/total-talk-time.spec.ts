import { test, expect } from '../fixtures';
import { durationToSeconds, secondsToHms, compareDurations } from '../../../../../../apr/lib/normalize';

/**
 * Total Talk Time validation: sums every hourly "Total Talk Time" value for one agent from
 * Reports > Standard Reports > Agent Performance (the app's real hourly-granularity report — see
 * apr/pages/StandardReportsAgentPerformancePage.ts) across the configured date range, then
 * cross-checks that cumulative total against the "Agent Talk Time" figure (under the "Total"
 * grouped-header column, distinct from "Avg Agent Talk Time") for the same agent/range on
 * Insights > APR (apr/pages/InsightsAprPage.ts) — confirmed live.
 *
 * Unlike the Avg fields elsewhere in this suite, this comparison sums hourly *totals* against an
 * aggregate *total*, so it is mathematically sound (same pattern as Total Active/Ready/Break
 * Duration).
 *
 * The Standard Report / Insights row sets are fetched once (login + filter applied a single time)
 * by the worker-scoped `durationData` fixture in ./fixtures.ts and shared across every file in
 * this directory — see that file for why.
 *
 * PASS when SUM(hourly Total Talk Time) == Insights Agent Talk Time (within the same 5s tolerance
 * every other duration comparison in this suite uses, see apr/lib/normalize.ts).
 */
test.describe('APR — Total Talk Time validation', () => {
  test('cumulative hourly Total Talk Time matches Insights APR Agent Talk Time', async ({ durationData, aprReport }) => {
    test.setTimeout(300_000); // covers the shared fixture's one-time login+fetch if this is the first test to run

    const { agentName, startDate, endDate, matchingHourlyRows, insightsRow } = durationData;

    let cumulativeSeconds = 0;
    const hourlyBreakdown: string[] = [];
    for (const row of matchingHourlyRows) {
      const seconds = durationToSeconds(row.totalTalkTime) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.totalTalkTime || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insightsAgentTalkTime = insightsRow?.agentTalkTime ?? '(not found)';

    const cmp = compareDurations(cumulativeHms, insightsAgentTalkTime);

    const reportLines = [
      `Agent Name: ${agentName}`,
      `APR Start Date: ${startDate}`,
      `APR End Date: ${endDate}`,
      '',
      'Hourly Total Talk Time:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Total Talk Time = ${cumulativeHms}`,
      `APR Insights Agent Talk Time = ${insightsAgentTalkTime}`,
      `Difference                   = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-talk-time-report', { body: reportText, contentType: 'text/plain' });

    aprReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? insightsRow?.agentId ?? '',
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Total Talk Time',
      aprValue: cumulativeHms,
      referenceValue: insightsAgentTalkTime,
      source: 'Insights > APR (Agent Talk Time) vs. Standard Reports > Agent Performance (hourly sum)',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Total Talk Time "${cumulativeHms}" does not match Insights APR Agent Talk Time "${insightsAgentTalkTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
