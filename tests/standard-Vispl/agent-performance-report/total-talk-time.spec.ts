import { test, expect } from '../../../apr-new-app/fixtures';
import { loginAsAdmin } from '../../../apr-new-app/lib/session';
import { resolveSpecificAgentName } from '../../../apr-new-app/lib/runner';
import { StandardReportsAgentPerformancePage } from '../../../apr-new-app/pages/StandardReportsAgentPerformancePage';
import { InsightsAprPage } from '../../../apr-new-app/pages/InsightsAprPage';
import { durationToSeconds, secondsToHms, compareDurations, textsMatch } from '../../../apr/lib/normalize';

/**
 * New Application — Total Talk Time validation. Same validation concept as the existing suite's
 * tests/standard-report/agent-performance-report/duration/specs/total-talk-time.spec.ts, but running entirely
 * against this environment's own config/Page Objects — see apr-new-app/README.md "Isolation from
 * the existing suite". "Agent Talk Time" (under the "Total" grouped-header column, distinct from
 * "Avg Agent Talk Time") is confirmed live as the matching Insights column on this account too.
 *
 * Unlike the Avg fields elsewhere in this suite, this comparison sums hourly *totals* against an
 * aggregate *total*, so it is mathematically sound (same pattern as Total Active/Ready/Break
 * Duration).
 *
 * PASS when SUM(hourly Total Talk Time) == Insights Agent Talk Time.
 */
test.describe('New App — Total Talk Time validation', () => {
  test('cumulative hourly Total Talk Time matches Insights APR Agent Talk Time', async ({ page, newAppConfig, newAppReport }) => {
    test.setTimeout(240_000);

    await loginAsAdmin(page, newAppConfig);

    const agentName = await resolveSpecificAgentName(page, newAppConfig);
    const { startDate, endDate } = newAppConfig;

    const hourlyPage = new StandardReportsAgentPerformancePage(page, newAppConfig.baseUrl);
    const hourlyRows = await hourlyPage.getRowsForAgent(agentName, startDate, endDate);

    const matchingHourlyRows = hourlyRows.filter((r) => textsMatch(r.agentName, agentName));

    let cumulativeSeconds = 0;
    const hourlyBreakdown: string[] = [];
    for (const row of matchingHourlyRows) {
      const seconds = durationToSeconds(row.totalTalkTime) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.totalTalkTime || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insights = new InsightsAprPage(page, newAppConfig.baseUrl);
    await insights.goto();
    await insights.setDateRange(startDate, endDate);
    await insights.searchAgent(agentName);
    const insightsRows = await insights.getAllRows();
    const insightsRow = insightsRows.find((r) => textsMatch(r.agentName, agentName));
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

    newAppReport.compareField({
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
