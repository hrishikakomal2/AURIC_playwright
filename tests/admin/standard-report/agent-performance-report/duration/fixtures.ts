import { test as base } from '../../../../../apr/fixtures';
import { loadAprConfig } from '../../../../../apr/config';
import { loginAsAdmin } from '../../../../../apr/lib/session';
import { resolveSpecificAgentName } from '../../../../../apr/lib/runner';
import { StandardReportsAgentPerformancePage } from '../../../../../apr/pages/StandardReportsAgentPerformancePage';
import { InsightsAprPage } from '../../../../../apr/pages/InsightsAprPage';
import { CallsPage } from '../../../../../apr/pages/CallsPage';
import { textsMatch, parseCallTimestamp } from '../../../../../apr/lib/normalize';
import { HourlyAgentPerformanceRow, AprAgentRow, CallRecord } from '../../../../../apr/lib/types';

export interface DurationData {
  agentName: string;
  startDate: string;
  endDate: string;
  /** Every hourly row for `agentName` across the full startDate..endDate range (no Hour filter) —
   *  carries every duration column, so each spec file below just reads its own field out of it. */
  matchingHourlyRows: HourlyAgentPerformanceRow[];
  insightsRow: AprAgentRow | undefined;
  /** Every call for `agentName` across the full startDate..endDate range (no Hour filter) — used
   *  by total-hold-time.spec.ts, the one field in this directory with no Insights equivalent to
   *  compare against (confirmed live: Insights > APR has no Hold Time column at all). */
  matchingCalls: CallRecord[];
  /** Set instead of throwing when the Calls page fetch itself fails — keeps that failure scoped to
   *  total-hold-time.spec.ts (the only file that uses `matchingCalls`) instead of failing fixture
   *  setup for all 11 files sharing this fixture. See the block comment on `test` below for why
   *  that isolation matters. */
  matchingCallsError: Error | undefined;
}

/**
 * Extends apr/fixtures's `test` with `durationData`. Every tests/.../duration/*.spec.ts file
 * validates a different column, but all of them read from the exact same Standard Reports >
 * Agent Performance row set, and all but total-hold-time.spec.ts read from the exact same
 * Insights > APR row set too (see apr/lib/types.ts — one row already carries every duration
 * column for its agent/hour or agent/range). Running each file as its own independent test used
 * to mean logging in and re-applying the same date/agent filter 10 times over for data that never
 * changed between files.
 *
 * `durationData` is worker-scoped: playwright.config.ts pins `workers: 1`, so every file in this
 * `duration` folder runs in the same single worker, and a worker-scoped fixture's setup function
 * runs exactly ONCE for that worker — on whichever test happens to run first — then every
 * subsequent test (in every file) reuses the same cached result instead of re-triggering it. This
 * is what actually collapses the repeated login/filter/fetch cost, while every spec file stays a
 * separate, independently reportable test.
 *
 * total-hold-time.spec.ts has no Insights equivalent (Insights > APR has no Hold Time column),
 * so it's cross-checked against the Calls page instead — that fetch happens here too, once,
 * alongside everything else. Both the Standard Report and Calls page fetches cover the WHOLE
 * configured date range (no Hour filter): total-ring-time.spec.ts used to cross-check against the
 * Calls page scoped to a single hour, but Insights turned out to have a matching "Total Ringing
 * Duration" column (confirmed live), so it now follows the same whole-range pattern as every
 * other file here — and total-hold-time.spec.ts was widened to match, which conveniently also
 * avoids a live bug in the Standard Report filter dialog's Start/End Hour dropdowns entirely
 * (no file in this directory needs to select an Hour anymore).
 *
 * Because setup for ALL of the above happens inside whichever test triggers it first, every
 * duration/*.spec.ts file sets a generous `test.setTimeout` — the first test to run pays for the
 * full fetch, not just its own field's work.
 *
 * IMPORTANT: because every file shares this one fixture, an unhandled error anywhere in its setup
 * would fail every test, not just the one whose data it was fetching (observed live: a locator bug
 * in the Calls page's Agent filter took down all 11 files, not just total-hold-time.spec.ts, and
 * — because a rejected worker-fixture promise isn't cached as a successful resolution — every
 * subsequent test re-attempted the ENTIRE setup from scratch, repeatedly re-hitting the same bug).
 * The Calls page fetch is therefore wrapped in try/catch — its failure is captured as
 * `matchingCallsError` and surfaced only by total-hold-time.spec.ts, so the other 10 files' tests
 * still run off the Standard Report / Insights data that already succeeded.
 */
export const test = base.extend<{}, { durationData: DurationData }>({
  durationData: [
    async ({ browser }, use) => {
      const cfg = loadAprConfig();
      const context = await browser.newContext();
      const page = await context.newPage();

      await loginAsAdmin(page, cfg);
      const agentName = await resolveSpecificAgentName(page, cfg);
      const { startDate, endDate } = cfg;

      const hourlyPage = new StandardReportsAgentPerformancePage(page);
      const hourlyRows = await hourlyPage.getRowsForAgent(agentName, startDate, endDate);
      const matchingHourlyRows = hourlyRows.filter((r) => textsMatch(r.agentName, agentName));

      const insights = new InsightsAprPage(page);
      await insights.goto();
      await insights.setDateRange(startDate, endDate);
      await insights.searchAgent(agentName);
      const insightsRows = await insights.getAllRows();
      const insightsRow = insightsRows.find((r) => textsMatch(r.agentName, agentName));

      let matchingCalls: CallRecord[] = [];
      let matchingCallsError: Error | undefined;
      try {
        const callsPage = new CallsPage(page);
        const allCalls = await callsPage.getRowsForFilters({ agentName, startDate, endDate });
        matchingCalls = allCalls.filter((c) => {
          const ts = parseCallTimestamp(c.timestamp);
          if (!ts) return false;
          return ts.isoDate >= startDate && ts.isoDate <= endDate;
        });
      } catch (err) {
        matchingCallsError = err instanceof Error ? err : new Error(String(err));
      }

      await use({ agentName, startDate, endDate, matchingHourlyRows, insightsRow, matchingCalls, matchingCallsError });
      await context.close();
    },
    // Setup here is login + 3 sequential page fetches (Standard Report, Insights, Calls page) —
    // comfortably over Playwright's 30s default test timeout, which is what governs fixture setup
    // unless overridden here. A `test.setTimeout()` call inside a spec file's test body does NOT
    // extend this: that only takes effect once the body starts running, which is after fixtures
    // have already resolved (or timed out). This was observed live as an intermittent "Fixture
    // durationData timeout of 30000ms exceeded" failure before this explicit timeout was added.
    { scope: 'worker', timeout: 300_000 },
  ],
});

export { expect } from '@playwright/test';
