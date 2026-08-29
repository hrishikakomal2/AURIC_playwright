import { test, expect } from '../../../apr-new-app/fixtures';
import { loginAsAdmin } from '../../../apr-new-app/lib/session';
import { resolveSpecificAgentName } from '../../../apr-new-app/lib/runner';
import { StandardReportsAgentPerformancePage } from '../../../apr-new-app/pages/StandardReportsAgentPerformancePage';
import { InsightsAprPage } from '../../../apr-new-app/pages/InsightsAprPage';
import { durationToSeconds, secondsToHms, compareDurations, textsMatch } from '../../../apr/lib/normalize';

/**
 * New Application — Total ACW Duration validation. Same validation concept as the existing suite's
 * tests/standard-report/agent-performance-report/total-acw-duration.spec.ts, but running entirely
 * against this environment's own config/Page Objects — see apr-new-app/README.md "Isolation from
 * the existing suite". "Total Wrap Up Time" (under the "Total" grouped-header column, distinct
 * from "Avg Wrap Up Time") is confirmed live as the matching Insights column on this account too.
 *
 * Unlike the Avg fields elsewhere in this suite, this comparison sums hourly *totals* against an
 * aggregate *total*, so it is mathematically sound (same pattern as Total Active/Ready/Break/Talk
 * Duration).
 *
 * PASS when SUM(hourly Total ACW Duration) == Insights Total Wrap Up Time.
 */
test.describe('New App — Total ACW Duration validation', () => {
  test('cumulative hourly Total ACW Duration matches Insights APR Total Wrap Up Time', async ({ page, newAppConfig, newAppReport }) => {
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
      const seconds = durationToSeconds(row.totalAcwDuration) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.totalAcwDuration || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insights = new InsightsAprPage(page, newAppConfig.baseUrl);
    await insights.goto();
    await insights.setDateRange(startDate, endDate);
    await insights.searchAgent(agentName);
    const insightsRows = await insights.getAllRows();
    const insightsRow = insightsRows.find((r) => textsMatch(r.agentName, agentName));
    const insightsTotalWrapUpTime = insightsRow?.totalWrapUpTime ?? '(not found)';

    const cmp = compareDurations(cumulativeHms, insightsTotalWrapUpTime);

    const reportLines = [
      `Agent Name: ${agentName}`,
      `APR Start Date: ${startDate}`,
      `APR End Date: ${endDate}`,
      '',
      'Hourly Total ACW Duration:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Total ACW Duration = ${cumulativeHms}`,
      `APR Insights Total Wrap Up Time = ${insightsTotalWrapUpTime}`,
      `Difference                      = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-acw-duration-report', { body: reportText, contentType: 'text/plain' });

    newAppReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? insightsRow?.agentId ?? '',
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Total ACW Duration',
      aprValue: cumulativeHms,
      referenceValue: insightsTotalWrapUpTime,
      source: 'Insights > APR (Total Wrap Up Time) vs. Standard Reports > Agent Performance (hourly sum)',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Total ACW Duration "${cumulativeHms}" does not match Insights APR Total Wrap Up Time "${insightsTotalWrapUpTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
