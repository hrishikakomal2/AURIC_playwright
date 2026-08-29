import { test, expect } from '../../../apr-new-app/fixtures';
import { loginAsAdmin } from '../../../apr-new-app/lib/session';
import { resolveSpecificAgentName } from '../../../apr-new-app/lib/runner';
import { StandardReportsAgentPerformancePage } from '../../../apr-new-app/pages/StandardReportsAgentPerformancePage';
import { InsightsAprPage } from '../../../apr-new-app/pages/InsightsAprPage';
import { durationToSeconds, secondsToHms, compareDurations, textsMatch } from '../../../apr/lib/normalize';

/**
 * New Application — Avg Handling Time validation. Same validation concept as the existing suite's
 * tests/standard-report/agent-performance-report/avg-handling-time.spec.ts, but running entirely
 * against this environment's own config/Page Objects — see apr-new-app/README.md "Isolation from
 * the existing suite". Both pages use the same "Avg Handling Time" name (just missing the period
 * on Insights) — confirmed live on this account too.
 *
 * Note: like avg-ringing-time.spec.ts, avg-talk-time.spec.ts, and avg-acw-duration.spec.ts,
 * "Avg. Handling Time" is itself an hourly *average* — summing per-hour averages is not generally
 * equal to the single average Insights reports across the whole range unless call volume happens
 * to be even across hours. This test implements the validation rule exactly as specified; a FAIL
 * here may reflect that averaging mismatch rather than a data bug.
 *
 * PASS when SUM(hourly Avg. Handling Time) == Insights Avg Handling Time.
 */
test.describe('New App — Avg Handling Time validation', () => {
  test('cumulative hourly Avg Handling Time matches Insights APR Avg Handling Time', async ({ page, newAppConfig, newAppReport }) => {
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
      const seconds = durationToSeconds(row.avgHandlingTime) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.avgHandlingTime || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insights = new InsightsAprPage(page, newAppConfig.baseUrl);
    await insights.goto();
    await insights.setDateRange(startDate, endDate);
    await insights.searchAgent(agentName);
    const insightsRows = await insights.getAllRows();
    const insightsRow = insightsRows.find((r) => textsMatch(r.agentName, agentName));
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
      `APR Insights Avg. Handling Time = ${insightsAvgHandlingTime}`,
      `Difference                      = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('avg-handling-time-report', { body: reportText, contentType: 'text/plain' });

    newAppReport.compareField({
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
