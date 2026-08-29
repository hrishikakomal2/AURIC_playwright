import { test, expect } from '../../../apr-new-app/fixtures';
import { loginAsAdmin } from '../../../apr-new-app/lib/session';
import { resolveSpecificAgentName } from '../../../apr-new-app/lib/runner';
import { StandardReportsAgentPerformancePage } from '../../../apr-new-app/pages/StandardReportsAgentPerformancePage';
import { InsightsAprPage } from '../../../apr-new-app/pages/InsightsAprPage';
import { durationToSeconds, secondsToHms, compareDurations, textsMatch } from '../../../apr/lib/normalize';

/**
 * New Application — Total Idle Time validation. Same validation concept as the existing suite's
 * tests/standard-report/agent-performance-report/total-ready-duration.spec.ts, but running
 * entirely against this environment's own config/Page Objects — see apr-new-app/README.md
 * "Isolation from the existing suite".
 *
 * PASS when SUM(hourly Total Idle Time) == Insights Total Waiting Time.
 */
test.describe('New App — Total Idle Time validation', () => {
  test('cumulative hourly Total Idle Time matches Insights APR Total Waiting Time', async ({ page, newAppConfig, newAppReport }) => {
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
      const seconds = durationToSeconds(row.totalIdleTime) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.totalIdleTime || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insights = new InsightsAprPage(page, newAppConfig.baseUrl);
    await insights.goto();
    await insights.setDateRange(startDate, endDate);
    await insights.searchAgent(agentName);
    const insightsRows = await insights.getAllRows();
    const insightsRow = insightsRows.find((r) => textsMatch(r.agentName, agentName));
    const insightsTotalWaitingTime = insightsRow?.totalWaitingTime ?? '(not found)';

    const cmp = compareDurations(cumulativeHms, insightsTotalWaitingTime);

    const reportLines = [
      `Agent Name: ${agentName}`,
      `APR Start Date: ${startDate}`,
      `APR End Date: ${endDate}`,
      '',
      'Hourly Total Idle Time:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Total Idle Time = ${cumulativeHms}`,
      `APR Insights Total Waiting Time = ${insightsTotalWaitingTime}`,
      `Difference                      = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('total-idle-time-report', { body: reportText, contentType: 'text/plain' });

    newAppReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? insightsRow?.agentId ?? '',
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Total Idle Time',
      aprValue: cumulativeHms,
      referenceValue: insightsTotalWaitingTime,
      source: 'Insights > APR (Total Waiting Time) vs. Standard Reports > Agent Performance (hourly sum)',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Total Idle Time "${cumulativeHms}" does not match Insights APR Total Waiting Time "${insightsTotalWaitingTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
