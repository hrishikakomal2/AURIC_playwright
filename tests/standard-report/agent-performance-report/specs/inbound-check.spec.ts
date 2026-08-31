import { test, expect } from '../../../../apr/fixtures';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { StandardReportsAgentPerformancePage } from '../../../../apr/pages/StandardReportsAgentPerformancePage';
import { CallsPage } from '../../../../apr/pages/CallsPage';
import { durationToSeconds, secondsToHms, compareDurations, compareCounts, parseCallTimestamp, textsMatch } from '../../../../apr/lib/normalize';
import { HourlyAgentPerformanceRow } from '../../../../apr/lib/types';

/**
 * Inbound metrics validation: cross-checks Standard Reports > Agent Performance's Inbound
 * Received / Ring Time / Talk Time / ACW / Connected (for one agent, one hour) against
 * independently-computed totals from the Calls page (/client/calls/merge-calls) — the raw
 * per-call log, used here as the source of truth per the validation brief. Same overall structure
 * as preview-auto.spec.ts and siblings, with two differences specific to the Inbound brief:
 *
 *  - Filtered by **Call Type** (normally "incoming") on the Calls page instead of a dialer-mode
 *    Campaign Type — see APR_CALL_TYPE (apr/config.ts) and CallsPage.selectCallType.
 *  - Campaign Name / Campaign Type are OPTIONAL here (unlike the dialer-mode specs, where a
 *    campaign is required to scope results to that dialer mode) — applied only when
 *    APR_CAMPAIGN_NAME/APR_CAMPAIGN_TYPE are set in .env, per the brief's explicit "never invent
 *    or assume missing Campaign Name or Campaign Type" rule. Leave them blank in .env for a plain
 *    Inbound validation.
 *
 * Filters come from .env — APR_AGENT_NAME / APR_START_DATE+APR_END_DATE / APR_START_HOUR /
 * APR_CALL_TYPE / APR_CAMPAIGN_NAME / APR_CAMPAIGN_TYPE. Only APR_START_HOUR is used as "the
 * hour" (the task brief's convention: "Start Time: 20, End Time: 21" means the single hour
 * 20:00:00-20:59:59).
 *
 * CAVEAT — not yet confirmed live: the "Inbound Received" etc. column headers (see
 * HourlyAgentPerformanceRow in apr/lib/types.ts — the Auto Preview equivalents were confirmed
 * live, Inbound is assumed to follow the same naming pattern but hasn't been independently
 * checked), the Calls page's "Call Type" filter option value for "incoming" (assumed to match
 * APR_CALL_TYPE verbatim), and everything else preview-auto.spec.ts's caveat already covers
 * (filter dialog controls, Calls page table headers).
 *
 * PASS when every one of the 5 metrics matches (counts exactly, durations within the same 5s
 * tolerance every other duration comparison in this suite uses — see apr/lib/normalize.ts).
 */
test.describe('APR — Inbound vs Calls page validation', () => {
  test('Inbound Received/Ring Time/Talk Time/ACW/Connected match the Calls page', async ({ page, aprConfig, aprReport }) => {
    test.setTimeout(180_000);

    if (aprConfig.agent.mode !== 'SPECIFIC') {
      throw new Error('APR_AGENT_NAME must be a specific agent (not ALL) for the Inbound validation');
    }

    const agentName = aprConfig.agent.name;
    const { startDate, endDate, campaignName, campaignType } = aprConfig;
    const hour = aprConfig.startHour.h;
    // Per the brief: Call Type is always applied for Inbound, normally "incoming" — default it
    // rather than requiring every .env to redeclare the same value, but never invent a
    // Campaign Name/Type (those stay strictly opt-in above).
    const callType = aprConfig.callType ?? 'incoming';

    await loginAsAdmin(page, aprConfig);

    // --- Standard Report > Agent Performance (report under test) ---
    const hourlyPage = new StandardReportsAgentPerformancePage(page);
    const hourlyRows = await hourlyPage.getRowsForFilters({ agentName, startDate, endDate, hour, campaignName, campaignType });
    const matchingHourlyRows = hourlyRows.filter((r) => textsMatch(r.agentName, agentName));

    const sumDuration = (pick: (r: HourlyAgentPerformanceRow) => string) =>
      secondsToHms(matchingHourlyRows.reduce((acc, r) => acc + (durationToSeconds(pick(r)) ?? 0), 0));
    const sumCount = (pick: (r: HourlyAgentPerformanceRow) => string) =>
      matchingHourlyRows.reduce((acc, r) => acc + (Number(pick(r)) || 0), 0);

    const reportReceived = String(sumCount((r) => r.inboundReceived));
    const reportRingTime = sumDuration((r) => r.inboundRingTime);
    const reportTalkTime = sumDuration((r) => r.inboundTalkTime);
    const reportAcw = sumDuration((r) => r.inboundAcw);
    const reportConnected = String(sumCount((r) => r.connectedInbound));

    // --- Calls page (source of truth) ---
    const callsPage = new CallsPage(page);
    const allCalls = await callsPage.getRowsForFilters({ agentName, startDate, endDate, callType, campaignName, campaignType });

    const matchingCalls = allCalls.filter((c) => {
      const ts = parseCallTimestamp(c.timestamp);
      if (!ts) return false;
      return ts.isoDate >= startDate && ts.isoDate <= endDate && ts.hour === hour;
    });

    const calcReceived = matchingCalls.length;
    const calcRingSeconds = matchingCalls.reduce((acc, c) => acc + (durationToSeconds(c.agentRingingDuration) ?? 0), 0);
    const calcTalkSeconds = matchingCalls.reduce((acc, c) => acc + (durationToSeconds(c.agentTalkTime) ?? 0), 0);
    const calcAcwSeconds = matchingCalls.reduce((acc, c) => acc + (durationToSeconds(c.wrapupTime) ?? 0), 0);
    const calcConnected = matchingCalls.filter((c) => textsMatch(c.callStatus, 'Success')).length;

    const calcRingTime = secondsToHms(calcRingSeconds);
    const calcTalkTime = secondsToHms(calcTalkSeconds);
    const calcAcw = secondsToHms(calcAcwSeconds);

    const receivedCmp = compareCounts(reportReceived, calcReceived);
    const ringCmp = compareDurations(reportRingTime, calcRingTime);
    const talkCmp = compareDurations(reportTalkTime, calcTalkTime);
    const acwCmp = compareDurations(reportAcw, calcAcw);
    const connectedCmp = compareCounts(reportConnected, calcConnected);

    const dateLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    const hourLabel = `${String(hour).padStart(2, '0')}:00-${String(hour).padStart(2, '0')}:59`;

    const rows = [
      { field: 'Inbound Received', reportValue: reportReceived, calcValue: String(calcReceived), matches: receivedCmp.matches, diffLabel: receivedCmp.diff === null ? 'N/A' : String(receivedCmp.diff) },
      { field: 'Inbound Ring Time', reportValue: reportRingTime, calcValue: calcRingTime, matches: ringCmp.matches, diffLabel: ringCmp.diffSeconds === null ? 'N/A' : `${ringCmp.diffSeconds}s` },
      { field: 'Inbound Talk Time', reportValue: reportTalkTime, calcValue: calcTalkTime, matches: talkCmp.matches, diffLabel: talkCmp.diffSeconds === null ? 'N/A' : `${talkCmp.diffSeconds}s` },
      { field: 'Inbound ACW', reportValue: reportAcw, calcValue: calcAcw, matches: acwCmp.matches, diffLabel: acwCmp.diffSeconds === null ? 'N/A' : `${acwCmp.diffSeconds}s` },
      { field: 'Connected Inbound', reportValue: reportConnected, calcValue: String(calcConnected), matches: connectedCmp.matches, diffLabel: connectedCmp.diff === null ? 'N/A' : String(connectedCmp.diff) },
    ];

    const reportLines = [
      `Agent Name: ${agentName}`,
      `Date: ${dateLabel}`,
      `Hour: ${hourLabel}`,
      `Call Type: ${callType}`,
      `Campaign Name: ${campaignName ?? '(not applied)'}`,
      `Campaign Type: ${campaignType ?? '(not applied)'}`,
      '',
      `Calls inspected on Calls page: ${allCalls.length} total, ${matchingCalls.length} within the hour-${hour} window`,
      '',
      'Metric             | Standard Report  | Calls Page | Match    | Diff',
      ...rows.map(
        (r) => `${r.field.padEnd(18)} | ${r.reportValue.padEnd(17)} | ${r.calcValue.padEnd(10)} | ${r.matches ? 'Match' : 'Mismatch'} | ${r.diffLabel}`
      ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('inbound-vs-calls-report', { body: reportText, contentType: 'text/plain' });

    for (const r of rows) {
      aprReport.compareField({
        agentName,
        agentId: matchingHourlyRows[0]?.agentId ?? '',
        date: dateLabel,
        hour: hourLabel,
        campaign: campaignName ?? 'ALL',
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
