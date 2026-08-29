import { test, expect } from '../../../apr-new-app/fixtures';
import { loginAsAdmin } from '../../../apr-new-app/lib/session';
import { resolveSpecificAgentName } from '../../../apr-new-app/lib/runner';
import { StandardReportsAgentPerformancePage } from '../../../apr-new-app/pages/StandardReportsAgentPerformancePage';
import { InsightsAprPage } from '../../../apr-new-app/pages/InsightsAprPage';
import { durationToSeconds, secondsToHms, compareDurations, textsMatch } from '../../../apr/lib/normalize';

/**
 * New Application — Avg ACW Duration validation. Same validation concept as the existing suite's
 * tests/standard-report/agent-performance-report/duration/specs/avg-acw-duration.spec.ts, but running entirely
 * against this environment's own config/Page Objects — see apr-new-app/README.md "Isolation from
 * the existing suite". "Avg Wrap Up Time" is confirmed live as the matching Insights column on this
 * account too — ACW (After Call Work) and Wrap Up are the same call-center concept under different
 * labels on the two pages.
 *
 * Note: like avg-ringing-time.spec.ts and avg-talk-time.spec.ts, "Avg. ACW Duration" is itself an
 * hourly *average* — summing per-hour averages is not generally equal to the single average
 * Insights reports across the whole range unless call volume happens to be even across hours. This
 * test implements the validation rule exactly as specified; a FAIL here may reflect that averaging
 * mismatch rather than a data bug.
 *
 * PASS when SUM(hourly Avg. ACW Duration) == Insights Avg Wrap Up Time.
 */
test.describe('New App — Avg ACW Duration validation', () => {
  test('cumulative hourly Avg ACW Duration matches Insights APR Avg Wrap Up Time', async ({ page, newAppConfig, newAppReport }) => {
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
      const seconds = durationToSeconds(row.avgAcwDuration) ?? 0;
      cumulativeSeconds += seconds;
      hourlyBreakdown.push(`  ${row.date} ${row.hour}: ${row.avgAcwDuration || '00:00:00'}`);
    }
    const cumulativeHms = secondsToHms(cumulativeSeconds);

    const insights = new InsightsAprPage(page, newAppConfig.baseUrl);
    await insights.goto();
    await insights.setDateRange(startDate, endDate);
    await insights.searchAgent(agentName);
    const insightsRows = await insights.getAllRows();
    const insightsRow = insightsRows.find((r) => textsMatch(r.agentName, agentName));
    const insightsAvgWrapUpTime = insightsRow?.avgWrapUpTime ?? '(not found)';

    const cmp = compareDurations(cumulativeHms, insightsAvgWrapUpTime);

    const reportLines = [
      `Agent Name: ${agentName}`,
      `APR Start Date: ${startDate}`,
      `APR End Date: ${endDate}`,
      '',
      'Hourly Avg. ACW Duration:',
      ...(hourlyBreakdown.length ? hourlyBreakdown : ['  (no hourly rows returned for this agent/date range)']),
      '',
      `Calculated Avg. ACW Duration = ${cumulativeHms}`,
      `APR Insights Avg Wrap Up Time = ${insightsAvgWrapUpTime}`,
      `Difference                    = ${cmp.diffSeconds === null ? 'N/A' : `${cmp.diffSeconds}s`}`,
      '',
      `Result: ${cmp.matches ? 'PASS' : 'FAIL'}`,
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('avg-acw-duration-report', { body: reportText, contentType: 'text/plain' });

    newAppReport.compareField({
      agentName,
      agentId: matchingHourlyRows[0]?.agentId ?? insightsRow?.agentId ?? '',
      date: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
      hour: '00:00-23:59',
      campaign: 'ALL',
      field: 'Avg ACW Duration',
      aprValue: cumulativeHms,
      referenceValue: insightsAvgWrapUpTime,
      source: 'Insights > APR (Avg Wrap Up Time) vs. Standard Reports > Agent Performance (hourly sum)',
      matches: cmp.matches,
      reason: cmp.matches
        ? undefined
        : `Cumulative hourly Avg. ACW Duration "${cumulativeHms}" does not match Insights APR Avg Wrap Up Time "${insightsAvgWrapUpTime}" (diff ${cmp.diffSeconds ?? 'N/A'}s)`,
    });

    expect(cmp.matches, reportText).toBe(true);
  });
});
