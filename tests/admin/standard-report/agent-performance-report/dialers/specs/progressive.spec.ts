import { test, expect } from '../../../../../../apr/fixtures';
import { loginAsAdmin } from '../../../../../../apr/lib/session';
import { StandardReportsAgentPerformancePage } from '../../../../../../apr/pages/StandardReportsAgentPerformancePage';
import { CallsPage } from '../../../../../../apr/pages/CallsPage';
import { durationToSeconds, secondsToHms, compareDurations, compareCounts, parseCallTimestamp, textsMatch } from '../../../../../../apr/lib/normalize';
import { HourlyAgentPerformanceRow } from '../../../../../../apr/lib/types';
import { DIALER_CAMPAIGNS } from '../campaigns';

/**
 * Progressive metrics validation: cross-checks Standard Reports > Agent Performance's Progressive
 * Dials / Ring Time / ACW / Connected / Talk Time (for one agent, one hour, one campaign +
 * campaign type) against independently-computed totals from the Calls page
 * (/client/calls/merge-calls) — the raw per-call log, used here as the source of truth per the
 * validation brief. Same structure as preview-auto.spec.ts / preview-manual.spec.ts /
 * predictive.spec.ts, just the Progressive column group instead — see preview-auto.spec.ts for
 * the fuller design rationale.
 *
 * Agent Name, Date, and Hour come from .env — see APR_AGENT_NAME / APR_START_DATE+APR_END_DATE /
 * APR_START_HOUR (apr/config.ts). Only APR_START_HOUR is used as "the hour" (the task brief's
 * convention: "Start Time: 20, End Time: 21" means the single hour 20:00:00-20:59:59). Campaign
 * Name/Type come from DIALER_CAMPAIGNS.progressive in ./campaigns.ts instead of .env — a
 * campaign's dialer type is fixed, so this must point at a Progressive Dialer campaign (a
 * Preview/Predictive campaign will not work here); confirmed live dropdown value: "Progressive
 * Dialer". Colocating the campaign per dialer type (rather than one shared APR_CAMPAIGN_NAME/
 * TYPE in .env) is what lets every dialers/*.spec.ts file run together in one `playwright test`
 * pass.
 *
 * CAVEAT — not yet confirmed live: the "Progressive Dials" etc. column headers (see
 * HourlyAgentPerformanceRow in apr/lib/types.ts — the Auto Preview equivalents were confirmed
 * live, Progressive is assumed to follow the same naming pattern but hasn't been independently
 * checked), and everything else preview-auto.spec.ts's caveat already covers (filter dialog
 * controls, Calls page table headers).
 *
 * PASS when every one of the 5 metrics matches (counts exactly, durations within the same 5s
 * tolerance every other duration comparison in this suite uses — see apr/lib/normalize.ts).
 */
test.describe('APR — Progressive vs Calls page validation', () => {
  test('Progressive Dials/Ring Time/ACW/Connected/Talk Time match the Calls page', async ({ page, aprConfig, aprReport }) => {
    test.setTimeout(180_000);

    if (aprConfig.agent.mode !== 'SPECIFIC') {
      throw new Error('APR_AGENT_NAME must be a specific agent (not ALL) for the Progressive validation');
    }
    const { name: campaignName, type: campaignType } = DIALER_CAMPAIGNS.progressive;
    if (!campaignName) throw new Error('DIALER_CAMPAIGNS.progressive.name is not set — fill it in in tests/standard-report/agent-performance-report/dialers/campaigns.ts');

    const agentName = aprConfig.agent.name;
    const { startDate, endDate } = aprConfig;
    const hour = aprConfig.startHour.h;

    await loginAsAdmin(page, aprConfig);

    // --- Standard Report > Agent Performance (report under test) ---
    const hourlyPage = new StandardReportsAgentPerformancePage(page);
    const hourlyRows = await hourlyPage.getRowsForFilters({ agentName, startDate, endDate, hour, campaignName, campaignType });
    const matchingHourlyRows = hourlyRows.filter((r) => textsMatch(r.agentName, agentName));

    const sumDuration = (pick: (r: HourlyAgentPerformanceRow) => string) =>
      secondsToHms(matchingHourlyRows.reduce((acc, r) => acc + (durationToSeconds(pick(r)) ?? 0), 0));
    const sumCount = (pick: (r: HourlyAgentPerformanceRow) => string) =>
      matchingHourlyRows.reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);

    const reportDials = String(sumCount((r) => r.progressiveDials));
    const reportRingTime = sumDuration((r) => r.progressiveRingTime);
    const reportAcw = sumDuration((r) => r.progressiveAcw);
    const reportConnected = String(sumCount((r) => r.connectedProgressive));
    const reportTalkTime = sumDuration((r) => r.progressiveTalkTime);

    // --- Calls page (source of truth) ---
    const callsPage = new CallsPage(page);
    const allCalls = await callsPage.getRowsForFilters({ agentName, startDate, endDate, campaignName, campaignType });

    const matchingCalls = allCalls.filter((c) => {
      const ts = parseCallTimestamp(c.timestamp);
      if (!ts) return false;
      return ts.isoDate >= startDate && ts.isoDate <= endDate && ts.hour === hour;
    });

    const calcDials = matchingCalls.length;
    const calcRingSeconds = matchingCalls.reduce((acc, c) => acc + (durationToSeconds(c.agentRingingDuration) ?? 0), 0);
    const calcAcwSeconds = matchingCalls.reduce((acc, c) => acc + (durationToSeconds(c.wrapupTime) ?? 0), 0);
    const calcConnected = matchingCalls.filter((c) => textsMatch(c.callStatus, 'Success')).length;
    const calcTalkSeconds = matchingCalls.reduce((acc, c) => acc + (durationToSeconds(c.agentTalkTime) ?? 0), 0);

    const calcRingTime = secondsToHms(calcRingSeconds);
    const calcAcw = secondsToHms(calcAcwSeconds);
    const calcTalkTime = secondsToHms(calcTalkSeconds);

    const dialsCmp = compareCounts(reportDials, calcDials);
    const ringCmp = compareDurations(reportRingTime, calcRingTime);
    const acwCmp = compareDurations(reportAcw, calcAcw);
    const connectedCmp = compareCounts(reportConnected, calcConnected);
    const talkCmp = compareDurations(reportTalkTime, calcTalkTime);

    const dateLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    const hourLabel = `${String(hour).padStart(2, '0')}:00-${String(hour).padStart(2, '0')}:59`;

    const rows = [
      { field: 'Progressive Dials', reportValue: reportDials, calcValue: String(calcDials), matches: dialsCmp.matches, diffLabel: dialsCmp.diff === null ? 'N/A' : String(dialsCmp.diff) },
      { field: 'Progressive Ring Time', reportValue: reportRingTime, calcValue: calcRingTime, matches: ringCmp.matches, diffLabel: ringCmp.diffSeconds === null ? 'N/A' : `${ringCmp.diffSeconds}s` },
      { field: 'Progressive Talk Time', reportValue: reportTalkTime, calcValue: calcTalkTime, matches: talkCmp.matches, diffLabel: talkCmp.diffSeconds === null ? 'N/A' : `${talkCmp.diffSeconds}s` },
      { field: 'Progressive ACW', reportValue: reportAcw, calcValue: calcAcw, matches: acwCmp.matches, diffLabel: acwCmp.diffSeconds === null ? 'N/A' : `${acwCmp.diffSeconds}s` },
      { field: 'Connected Progressive', reportValue: reportConnected, calcValue: String(calcConnected), matches: connectedCmp.matches, diffLabel: connectedCmp.diff === null ? 'N/A' : String(connectedCmp.diff) },
    ];

    const reportLines = [
      `Agent Name: ${agentName}`,
      `Date: ${dateLabel}`,
      `Hour: ${hourLabel}`,
      `Campaign Name: ${campaignName}`,
      `Campaign Type: ${campaignType}`,
      '',
      `Calls inspected on Calls page: ${allCalls.length} total, ${matchingCalls.length} within the hour-${hour} window`,
      '',
      'Metric                | Standard Report  | Calls Page | Match    | Diff',
      ...rows.map(
        (r) => `${r.field.padEnd(22)} | ${r.reportValue.padEnd(17)} | ${r.calcValue.padEnd(10)} | ${r.matches ? 'Match' : 'Mismatch'} | ${r.diffLabel}`
      ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('progressive-vs-calls-report', { body: reportText, contentType: 'text/plain' });

    for (const r of rows) {
      aprReport.compareField({
        agentName,
        agentId: matchingHourlyRows[0]?.agentId ?? '',
        date: dateLabel,
        hour: hourLabel,
        campaign: campaignName,
        field: r.field,
        aprValue: r.reportValue,
        referenceValue: r.calcValue,
        source: 'Calls page (/client/calls/merge-calls) — computed from raw call records',
        matches: r.matches,
        reason: r.matches ? undefined : `Standard Report "${r.reportValue}" does not match Calls page calculation "${r.calcValue}" (diff ${r.diffLabel})`,
      });
    }

    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
