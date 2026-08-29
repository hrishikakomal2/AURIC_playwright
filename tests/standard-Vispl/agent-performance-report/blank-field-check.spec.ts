import { test, expect } from '../../../apr-new-app/fixtures';
import { loginAsAdmin } from '../../../apr-new-app/lib/session';
import { gatherAprData, ValidationContext } from '../../../apr-new-app/lib/runner';
import { validateAgentIdentity } from '../../../apr-new-app/lib/validate';
import { AprReportRecorder } from '../../../apr/lib/reportRecorder';
import { AprAgentRow } from '../../../apr-new-app/lib/types';

/** Fails the field as a blank-value error rather than letting an "both sides blank" match silently PASS. */
function validateNotBlank(recorder: AprReportRecorder, ctx: ValidationContext, row: AprAgentRow, field: string, value: string) {
  const blank = !value || !value.trim();
  recorder.compareField({
    agentName: row.agentName,
    agentId: row.agentId,
    date: ctx.date,
    hour: ctx.hour,
    campaign: ctx.campaign,
    field: `${field} not blank`,
    aprValue: value,
    referenceValue: '(non-blank)',
    source: ctx.source,
    matches: !blank,
    reason: blank ? `${field} is blank for this agent` : undefined,
  });
}

/**
 * New Application — SME ID / Agent Name / Agent ID validation. Same validation concept as the
 * existing suite's tests/standard-report/agent-performance-report/specs/blank-field-check.spec.ts, but
 * running entirely against this environment's own config/Page Objects — see
 * apr-new-app/README.md "Isolation from the existing suite".
 */
test.describe('New App — SME ID / Agent Name / Agent ID validation', () => {
  test('Agent Name and Agent ID match the Users page for every agent in the report', async ({ page, newAppConfig, newAppReport }) => {
    test.setTimeout(240_000);

    await loginAsAdmin(page, newAppConfig);

    const result = await gatherAprData(page, newAppConfig, newAppConfig.agent);

    if (result.aprRows.length === 0) {
      newAppReport.noData({
        date: result.ctx.date,
        hour: result.ctx.hour,
        campaign: result.ctx.campaign,
        source: result.ctx.source,
        reason: 'No agent rows returned for the configured agent/date/campaign filters',
      });
    } else {
      for (const row of result.aprRows) {
        const user = result.usersByAgentId.get(row.agentId) ?? null;
        validateAgentIdentity(newAppReport, result.ctx, row, user);

        validateNotBlank(newAppReport, result.ctx, row, 'Date', result.ctx.date);
        validateNotBlank(newAppReport, result.ctx, row, 'Hour', result.ctx.hour);
        validateNotBlank(newAppReport, result.ctx, row, 'SME ID', row.agentId);
        validateNotBlank(newAppReport, result.ctx, row, 'Agent Name', row.agentName);
        validateNotBlank(newAppReport, result.ctx, row, 'Agent ID', row.agentId);
      }
    }

    const failed = newAppReport.rows.filter((r) => r.result === 'FAIL');
    expect(failed, JSON.stringify(failed, null, 2)).toHaveLength(0);
  });
});
