import { test, expect } from '../../../../apr/fixtures';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { gatherAprData } from '../../../../apr/lib/runner';
import { validateAgentIdentity, ValidationContext } from '../../../../apr/lib/validate';
import { AprReportRecorder } from '../../../../apr/lib/reportRecorder';
import { AprAgentRow } from '../../../../apr/lib/types';

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
 * TC06 — SME ID / Agent Name / Agent ID validation (spec section 5).
 *
 * Opens the Agent Performance Report, reads Agent Name + Agent ID (+ SME ID, aliased to Agent ID —
 * see apr/README.md "SME ID") for every applicable agent, then cross-checks each one against the
 * Users page (/client/users) by searching for the agent there rather than trusting the APR values
 * as-is. PASS only when both Agent Name and Agent ID match their Users-page record.
 *
 * Also asserts Date, Hour, SME ID, Agent Name, and Agent ID are all non-blank for every row — a
 * matching pair of blank values (e.g. APR and Users both showing an empty Agent Name) would
 * otherwise read as a silent PASS from validateAgentIdentity alone.
 */
test.describe('APR — SME ID / Agent Name / Agent ID validation', () => {
  test('Agent Name and Agent ID match the Users page for every agent in the report', async ({ page, aprConfig, aprReport }) => {
    // ALL-agents mode cross-checks every agent against the Users page one search at a time
    // (findByAgentId per row in gatherAprData), which comfortably exceeds the 30s default when
    // the report has more than a handful of agents.
    test.setTimeout(120_000);

    await loginAsAdmin(page, aprConfig);

    const result = await gatherAprData(page, aprConfig, aprConfig.agent);

    if (result.aprRows.length === 0) {
      aprReport.noData({
        date: result.ctx.date,
        hour: result.ctx.hour,
        campaign: result.ctx.campaign,
        source: result.ctx.source,
        reason: 'No agent rows returned for the configured agent/date/campaign filters',
      });
    } else {
      for (const row of result.aprRows) {
        const user = result.usersByAgentId.get(row.agentId) ?? null;
        validateAgentIdentity(aprReport, result.ctx, row, user);

        validateNotBlank(aprReport, result.ctx, row, 'Date', result.ctx.date);
        validateNotBlank(aprReport, result.ctx, row, 'Hour', result.ctx.hour);
        validateNotBlank(aprReport, result.ctx, row, 'SME ID', row.agentId);
        validateNotBlank(aprReport, result.ctx, row, 'Agent Name', row.agentName);
        validateNotBlank(aprReport, result.ctx, row, 'Agent ID', row.agentId);
      }
    }

    const failed = aprReport.rows.filter((r) => r.result === 'FAIL');
    expect(failed, JSON.stringify(failed, null, 2)).toHaveLength(0);
  });
});
