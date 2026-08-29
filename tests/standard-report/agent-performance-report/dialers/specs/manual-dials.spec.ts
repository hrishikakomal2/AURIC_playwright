import { test, expect } from '../../../../../apr/fixtures';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { StandardReportsAgentPerformancePage } from '../../../../../apr/pages/StandardReportsAgentPerformancePage';
import { CallsPage } from '../../../../../apr/pages/CallsPage';
import { durationToSeconds, secondsToHms, compareDurations, compareCounts, parseCallTimestamp, textsMatch } from '../../../../../apr/lib/normalize';
import { HourlyAgentPerformanceRow } from '../../../../../apr/lib/types';
import { DIALER_CAMPAIGNS } from '../campaigns';

/**
 * Manual Dials metrics validation: cross-checks Standard Reports > Agent Performance's Manual
 * Dials / Ring Time / Talk Time / ACW / Connected (for one agent, one hour, one campaign +
 * campaign type) against independently-computed totals from the Calls page
 * (/client/calls/merge-calls) — the raw per-call log, used here as the source of truth per the
 * validation brief. Same structure as preview-auto.spec.ts / power.spec.ts / etc., just the
 * Manual Dials column group instead — see preview-auto.spec.ts for the fuller design rationale.
 * Distinct from preview-manual.spec.ts, which validates the "Manual Preview" dialer mode, a
 * different Campaign Type from this one's "Click To Call".
 *
 * Agent Name, Date, and Hour come from .env — see APR_AGENT_NAME / APR_START_DATE+APR_END_DATE /
 * APR_START_HOUR (apr/config.ts). Only APR_START_HOUR is used as "the hour" (the task brief's
 * convention: "Start Time: 20, End Time: 21" means the single hour 20:00:00-20:59:59). Campaign
 * Name/Type come from DIALER_CAMPAIGNS.manualDials in ./campaigns.ts instead of .env — a
 * campaign's dialer type is fixed, so this must point at a "Click To Call" campaign (confirmed
 * live: the Calls page's Campaign Type dropdown lists "Click To Call" alongside Preview Auto/
 * Manual/Predictive/Progressive/Power Dialer — a Preview/Predictive/Progressive/Power campaign
 * will not work here). Colocating the campaign per dialer type (rather than one shared
 * APR_CAMPAIGN_NAME/TYPE in .env) is what lets every dialers/*.spec.ts file run together in one
 * `playwright test` pass.
 *
 * CAVEAT — not yet confirmed live: the "Manual Dials" etc. column headers (see
 * HourlyAgentPerformanceRow in apr/lib/types.ts), and everything else preview-auto.spec.ts's
 * caveat already covers (filter dialog controls, Calls page table headers).
 *
 * PASS when every one of the 5 metrics matches (counts exactly, durations within the same 5s
 * tolerance every other duration comparison in this suite uses — see apr/lib/normalize.ts).
 */
test.describe('APR — Manual Dials vs Calls page validation', () => {
  test('Manual Dials/Ring Time/Talk Time/ACW/Connected match the Calls page', async ({ page, aprConfig, aprReport }) => {
    test.setTimeout(180_000);

    if (aprConfig.agent.mode !== 'SPECIFIC') {
      throw new Error('APR_AGENT_NAME must be a specific agent (not ALL) for the Manual Dials validation');
    }
    const { name: campaignName, type: campaignType } = DIALER_CAMPAIGNS.manualDials;
    if (!campaignName) throw new Error('DIALER_CAMPAIGNS.manualDials.name is not set — fill it in in tests/standard-report/agent-performance-report/dialers/campaigns.ts');

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

    const reportDials = String(sumCount((r) => r.manualDials));
    const reportRingTime = sumDuration((r) => r.manualRingTime);
    const reportTalkTime = sumDuration((r) => r.manualTalkTime);
    const reportAcw = sumDuration((r) => r.manualAcw);
    const reportConnected = String(sumCount((r) => r.connectedManualDials));

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
    const calcTalkSeconds = matchingCalls.reduce((acc, c) => acc + (durationToSeconds(c.agentTalkTime) ?? 0), 0);
    const calcAcwSeconds = matchingCalls.reduce((acc, c) => acc + (durationToSeconds(c.wrapupTime) ?? 0), 0);
    const calcConnected = matchingCalls.filter((c) => textsMatch(c.callStatus, 'Success')).length;

    const calcRingTime = secondsToHms(calcRingSeconds);
    const calcTalkTime = secondsToHms(calcTalkSeconds);
    const calcAcw = secondsToHms(calcAcwSeconds);

    const dialsCmp = compareCounts(reportDials, calcDials);
    const ringCmp = compareDurations(reportRingTime, calcRingTime);
    const talkCmp = compareDurations(reportTalkTime, calcTalkTime);
    const acwCmp = compareDurations(reportAcw, calcAcw);
    const connectedCmp = compareCounts(reportConnected, calcConnected);

    const dateLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    const hourLabel = `${String(hour).padStart(2, '0')}:00-${String(hour).padStart(2, '0')}:59`;

    const rows = [
      { field: 'Manual Dials', reportValue: reportDials, calcValue: String(calcDials), matches: dialsCmp.matches, diffLabel: dialsCmp.diff === null ? 'N/A' : String(dialsCmp.diff) },
      { field: 'Manual Ring Time', reportValue: reportRingTime, calcValue: calcRingTime, matches: ringCmp.matches, diffLabel: ringCmp.diffSeconds === null ? 'N/A' : `${ringCmp.diffSeconds}s` },
      { field: 'Manual Talk Time', reportValue: reportTalkTime, calcValue: calcTalkTime, matches: talkCmp.matches, diffLabel: talkCmp.diffSeconds === null ? 'N/A' : `${talkCmp.diffSeconds}s` },
      { field: 'Manual ACW', reportValue: reportAcw, calcValue: calcAcw, matches: acwCmp.matches, diffLabel: acwCmp.diffSeconds === null ? 'N/A' : `${acwCmp.diffSeconds}s` },
      { field: 'Connected Manual Dials', reportValue: reportConnected, calcValue: String(calcConnected), matches: connectedCmp.matches, diffLabel: connectedCmp.diff === null ? 'N/A' : String(connectedCmp.diff) },
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
      'Metric                  | Standard Report  | Calls Page | Match    | Diff',
      ...rows.map(
        (r) => `${r.field.padEnd(23)} | ${r.reportValue.padEnd(17)} | ${r.calcValue.padEnd(10)} | ${r.matches ? 'Match' : 'Mismatch'} | ${r.diffLabel}`
      ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('manual-dials-vs-calls-report', { body: reportText, contentType: 'text/plain' });

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
