import { test, expect } from '../fixtures';
import { durationToSeconds, secondsToHms, compareDurations } from '../../../../../../apr/lib/normalize';

/**
 * Total Hold Time validation: sums every hourly "Total Hold Time" value for one agent from
 * Reports > Standard Reports > Agent Performance (the app's real hourly-granularity report — see
 * apr/pages/StandardReportsAgentPerformancePage.ts) across the configured date range, then
 * cross-checks that cumulative total against an independently-computed total from the Calls page
 * (/client/calls/merge-calls) — the raw per-call log, used as the source of truth since Insights
 * > APR has no Hold Time column at all (confirmed live — see total-ring-time.spec.ts, which DOES
 * have an Insights equivalent for Ring Time and compares against that instead).
 *
 * Whole date range, no Hour filter, no Call Type/Campaign filtering — sums across every call for
 * the agent/range on the Calls page. Previously part of a combined ring-hold-time.spec.ts scoped
 * to a single hour (APR_START_HOUR); widened to the whole range when split out, both for
 * consistency with every other file in this directory and because it avoids a live bug in the
 * Standard Report filter dialog's Start/End Hour dropdowns.
 *
 * Field sourcing: Total Hold Time = SUM(Hold Time) — NOT Hold Time Detail/Mute Time/Mute Time
 * Detail (see CallRecord in apr/lib/types.ts).
 *
 * The Standard Report / Calls page row sets are fetched once (login + filter applied a single
 * time) by the worker-scoped `durationData` fixture in ./fixtures.ts and shared across every file
 * in this directory — see that file for why.
 *
 * On a mismatch, the individual matching calls (Start Date Time, Agent Name, Hold Time, Call
 * Status, Total Duration) plus a running per-call calculation breakdown are dumped to the
 * attached report, per the original ring-hold-time.spec.ts's "trace the difference to individual
 * calls" requirement.
 *
 * PASS when SUM(hourly Total Hold Time) == SUM(Calls page Hold Time) (within the same 5s
 * tolerance every other duration comparison in this suite uses, see apr/lib/normalize.ts).
 */
test.describe('APR — Total Hold Time vs Calls page validation', () => {
  test('cumulative hourly Total Hold Time matches Calls page Hold Time', async ({ durationData, aprReport }) => {
    test.setTimeout(300_000); // covers the shared fixture's one-time login+fetch if this is the first test to run

    const { agentName, startDate, endDate, matchingHourlyRows, matchingCalls, matchingCallsError } = durationData;
    if (matchingCallsError) throw matchingCallsError;

    let cumulativeSeconds = 0;
    const hourlyBreakdown: string[] = [];
    for (const row of matchingHourlyRows) {
      const seconds = durationToSeconds(row.totalHoldTime) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.totalHoldTime || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const holdSecondsPerCall = matchingCalls.map((c) => durationToSeconds(c.holdTime) ?? 0);
    const calcHoldSeconds = holdSecondsPerCall.reduce((acc, s) => acc + s, 0);
    const calcHoldTime = secondsToHms(calcHoldSeconds);

    const cmp = compareDurations(cumulativeHms, calcHoldTime);
    const dateLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

    const reportLines = [
      `Agent Name: ${agentName}`,
      `Date: ${dateLabel}`,
      '(No Hour / Call Type / Campaign Name / Campaign Type filters applied)',
      '',
      `Calls inspected: ${matchingCalls.length}`,
      '',
      'Hourly Total Hold Time:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Total Hold Time = ${cumulativeHms}`,
      `Calls Page Total Hold Time  = ${calcHoldTime}`,
      `Difference                  = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];

    if (!cmp.matches) {
      reportLines.push(
        '',
        'MISMATCH DETECTED — underlying calls used in the calculation:',
        'Start Date Time | Agent Name | Hold Time | Call Status | Total Duration',
        ...matchingCalls.map((c) => `${c.timestamp} | ${c.agentName} | ${c.holdTime} | ${c.callStatus} | ${c.totalDuration}`),
        '',
        'Total Hold Time Calculation:',
        ...matchingCalls.map((c, i) => `Call ${i + 1} (${c.timestamp}) = ${c.holdTime || '00:00:00'} (${holdSecondsPerCall[i]}s)`),
        '-'.repeat(24),
        `Total = ${calcHoldTime} (${calcHoldSeconds}s)`
      );
    }

    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-hold-time-report', { body: reportText, contentType: 'text/plain' });

    aprReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? '',
      date: dateLabel,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Total Hold Time',
      aprValue: cumulativeHms,
      referenceValue: calcHoldTime,
      source: 'Calls page (/client/calls/merge-calls) — computed from raw call records',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Total Hold Time "${cumulativeHms}" does not match Calls page calculation "${calcHoldTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s) — see attached report for underlying call records`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
