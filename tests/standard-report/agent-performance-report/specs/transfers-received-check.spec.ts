import { test, expect } from '../../../../apr/fixtures';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { StandardReportsAgentPerformancePage } from '../../../../apr/pages/StandardReportsAgentPerformancePage';
import { CallsPage } from '../../../../apr/pages/CallsPage';
import { durationToSeconds, secondsToHms, compareDurations, compareCounts, parseCallTimestamp, textsMatch } from '../../../../apr/lib/normalize';
import { isTransferCase, statusIndicatesConnected, findDataQualityIssue, pickTransferTalkTime } from '../../../../apr/lib/transfers';
import { HourlyAgentPerformanceRow, CallRecord } from '../../../../apr/lib/types';

/**
 * Transfers Received metrics validation: cross-checks Standard Reports > Agent Performance's
 * Transfers Received / Ring Time / Talk Time / ACW / Connected (for one agent, one hour) against
 * independently-computed totals from the Calls page (/client/calls/merge-calls) — the raw
 * per-call log, used here as the source of truth per the validation brief.
 *
 * Unlike every other spec in this directory (a single column summed straight off matching calls),
 * this one must first CLASSIFY which calls are valid transfer cases — see apr/lib/transfers.ts
 * for the classification rules (isTransferCase / statusIndicatesConnected / findDataQualityIssue
 * / pickTransferTalkTime) and their live-confirmation caveats. Key differences from the
 * inbound/manual-dials pattern:
 *
 *  - Transfer Ring Time sums `Transfer Agent Ringing Duration`, NOT `Agent Ringing Duration`
 *    (the brief explicitly forbids substituting the latter — see apr/lib/transfers.ts).
 *  - Transfer Talk Time prefers `Conference Duration` per call, falling back to `Agent Talk Time`
 *    only when Conference Duration is blank for that call (pickTransferTalkTime) — the source
 *    used per call is recorded in the trace output below, per the brief's "document which field
 *    was used" instruction.
 *  - Connected Transfers excludes any transfer case flagged by findDataQualityIssue (brief rule
 *    17: flag inconsistent records rather than auto-counting them) — those are reported
 *    separately, not silently folded into either side of the count.
 *  - On ANY metric mismatch, every valid transfer case's full field set is dumped to the test
 *    report attachment (brief: "provide the underlying transfer records used in the
 *    calculation" / "identify the underlying call records responsible for the difference").
 *
 * Filters come from .env — APR_AGENT_NAME / APR_START_DATE+APR_END_DATE / APR_START_HOUR /
 * APR_CALL_TYPE (required — the brief has no default term for this validation, unlike Inbound's
 * "incoming") / APR_CAMPAIGN_NAME / APR_CAMPAIGN_TYPE (optional, applied only when set, never
 * invented).
 *
 * CAVEAT — not yet confirmed live: the "Transfers Received" etc. column headers (see
 * HourlyAgentPerformanceRow in apr/lib/types.ts), the Calls page's actual Transfer/Conference
 * column headers (see CallRecord/mapCallRow in apr/lib/types.ts), and the transfer-status string
 * classification (see apr/lib/transfers.ts). This spec should be run once against real transfer
 * data and its classification logic spot-checked before being trusted at scale.
 *
 * PASS when every one of the 5 metrics matches (counts exactly, durations within the same 5s
 * tolerance every other duration comparison in this suite uses — see apr/lib/normalize.ts).
 */
test.describe('APR — Transfers Received vs Calls page validation', () => {
  test('Transfers Received/Ring Time/Talk Time/ACW/Connected match the Calls page', async ({ page, aprConfig, aprReport }) => {
    test.setTimeout(180_000);

    if (aprConfig.agent.mode !== 'SPECIFIC') {
      throw new Error('APR_AGENT_NAME must be a specific agent (not ALL) for the Transfers Received validation');
    }
    if (!aprConfig.callType) throw new Error('APR_CALL_TYPE is required for the Transfers Received validation');

    const agentName = aprConfig.agent.name;
    const { startDate, endDate, campaignName, campaignType, callType } = aprConfig;
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

    const reportReceived = String(sumCount((r) => r.transfersReceived));
    const reportRingTime = sumDuration((r) => r.transferRingTime);
    const reportTalkTime = sumDuration((r) => r.transferTalkTime);
    const reportAcw = sumDuration((r) => r.transferAcw);
    const reportConnected = String(sumCount((r) => r.connectedTransfers));

    // --- Calls page (source of truth) ---
    const callsPage = new CallsPage(page);
    const allCalls = await callsPage.getRowsForFilters({ agentName, startDate, endDate, callType, campaignName, campaignType });

    const inWindow = allCalls.filter((c) => {
      const ts = parseCallTimestamp(c.timestamp);
      if (!ts) return false;
      return ts.isoDate >= startDate && ts.isoDate <= endDate && ts.hour === hour;
    });

    const transferCases = inWindow.filter(isTransferCase);
    const dataQualityIssues = transferCases.map((c) => findDataQualityIssue(c)).filter((issue): issue is NonNullable<typeof issue> => issue !== null);
    const flaggedCalls = new Set(dataQualityIssues.map((i) => i.call));

    const talkTimeResults = transferCases.map((c) => ({ call: c, ...pickTransferTalkTime(c) }));

    const calcReceived = transferCases.length;
    const calcRingSeconds = transferCases.reduce((acc, c) => acc + (durationToSeconds(c.transferAgentRingingDuration) ?? 0), 0);
    const calcTalkSeconds = talkTimeResults.reduce((acc, r) => acc + r.seconds, 0);
    const calcAcwSeconds = transferCases.reduce((acc, c) => acc + (durationToSeconds(c.wrapupTime) ?? 0), 0);
    const calcConnected = transferCases.filter((c) => statusIndicatesConnected(c) && !flaggedCalls.has(c)).length;

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
      { field: 'Transfers Received', reportValue: reportReceived, calcValue: String(calcReceived), matches: receivedCmp.matches, diffLabel: receivedCmp.diff === null ? 'N/A' : String(receivedCmp.diff) },
      { field: 'Transfer Ring Time', reportValue: reportRingTime, calcValue: calcRingTime, matches: ringCmp.matches, diffLabel: ringCmp.diffSeconds === null ? 'N/A' : `${ringCmp.diffSeconds}s` },
      { field: 'Transfer Talk Time', reportValue: reportTalkTime, calcValue: calcTalkTime, matches: talkCmp.matches, diffLabel: talkCmp.diffSeconds === null ? 'N/A' : `${talkCmp.diffSeconds}s` },
      { field: 'Transfer ACW', reportValue: reportAcw, calcValue: calcAcw, matches: acwCmp.matches, diffLabel: acwCmp.diffSeconds === null ? 'N/A' : `${acwCmp.diffSeconds}s` },
      { field: 'Connected Transfers', reportValue: reportConnected, calcValue: String(calcConnected), matches: connectedCmp.matches, diffLabel: connectedCmp.diff === null ? 'N/A' : String(connectedCmp.diff) },
    ];
    const anyMismatch = rows.some((r) => !r.matches);

    const traceHeader = [
      'Start Date Time',
      'Customer Name',
      'Customer Number',
      'Agent Name',
      'Call Type',
      'Campaign Name',
      'Campaign Type',
      'Transfer Status',
      'Transfer Type',
      'Transfer Duration',
      'Transferred Agent Number',
      'Transferred Agent Name',
      'Transfer Agent Ringing Duration',
      'Conference Status',
      'Conference Duration',
      'Agent Talk Time (used as Talk Time source)',
      'Wrapup Time',
      'Call Status',
    ].join(' | ');

    const traceRow = (c: CallRecord) => {
      const talkSource = talkTimeResults.find((r) => r.call === c)?.source ?? '';
      return [
        c.timestamp,
        c.customerName,
        c.customerNumber,
        c.agentName,
        c.callType,
        c.campaignName,
        c.campaignType,
        c.transferStatus,
        c.transferType,
        c.transferDuration,
        c.transferredAgentNumber,
        c.transferredAgentName,
        c.transferAgentRingingDuration,
        c.conferenceStatus,
        c.conferenceDuration,
        `${c.agentTalkTime} (talk time source used: ${talkSource})`,
        c.wrapupTime,
        c.callStatus,
      ].join(' | ');
    };

    const reportLines = [
      `Agent Name: ${agentName}`,
      `Date: ${dateLabel}`,
      `Hour: ${hourLabel}`,
      `Call Type: ${callType}`,
      `Campaign Name: ${campaignName ?? '(not applied)'}`,
      `Campaign Type: ${campaignType ?? '(not applied)'}`,
      '',
      `Calls inspected on Calls page: ${allCalls.length} total, ${inWindow.length} within the hour-${hour} window, ${transferCases.length} identified as valid transfer cases`,
      `Data-quality-flagged transfer cases (excluded from Connected Transfers): ${dataQualityIssues.length}`,
      ...dataQualityIssues.map((i) => `  - ${i.call.timestamp} (${i.call.customerName || i.call.customerNumber || 'unknown customer'}): ${i.reason}`),
      '',
      'Metric               | Standard Report  | Calls Page | Match    | Diff',
      ...rows.map(
        (r) => `${r.field.padEnd(21)} | ${r.reportValue.padEnd(17)} | ${r.calcValue.padEnd(10)} | ${r.matches ? 'Match' : 'Mismatch'} | ${r.diffLabel}`
      ),
    ];

    if (anyMismatch) {
      reportLines.push('', 'MISMATCH DETECTED — underlying transfer-case records used in the calculation:', traceHeader, ...transferCases.map(traceRow));
    }

    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('transfers-received-vs-calls-report', { body: reportText, contentType: 'text/plain' });

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
        reason: r.matches ? undefined : `Standard Report "${r.reportValue}" does not match Calls page calculation "${r.calcValue}" (diff ${r.diffLabel}) — see attached report for underlying transfer records`,
      });
    }

    expect(rows.every((r) => r.matches), reportText).toBe(true);
  });
});
