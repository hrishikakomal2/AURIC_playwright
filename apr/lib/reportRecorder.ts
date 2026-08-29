import { TestInfo } from '@playwright/test';

export type ComparisonResult = 'PASS' | 'FAIL' | 'NO DATA';

export interface ComparisonRow {
  testCase: string;
  field: string; // Date | Hour | SME ID | Agent Name | Agent ID | Total Active Duration | Campaign | ...
  agentName: string;
  agentId: string;
  date: string;
  hour: string;
  campaign: string;
  aprValue: string;
  referenceValue: string;
  result: ComparisonResult;
  reason?: string;
  source: string; // which reference page/value this was checked against
}

export type ErrorKind = 'UI ERROR' | 'FILTER ERROR' | 'DATA ERROR';

export interface ErrorRow {
  testCase: string;
  kind: ErrorKind;
  message: string;
  context?: string;
}

/**
 * Per-test collector for the APR suite's field-by-field comparison table (see section 12 of the
 * requirements: Field | APR Value | Reference Value | Result, plus totals). Attached to the test
 * result as JSON on teardown (see apr/fixtures.ts); apr/reporter.ts aggregates every test's
 * attachment into the final apr-reports/*.html + *.json report.
 */
export class AprReportRecorder {
  readonly testCase: string;
  readonly params: Record<string, string>;
  readonly startedAt: string;
  rows: ComparisonRow[] = [];
  errors: ErrorRow[] = [];
  private agentsChecked = new Set<string>();

  constructor(testCase: string, params: Record<string, string> = {}) {
    this.testCase = testCase;
    this.params = params;
    this.startedAt = new Date().toISOString();
  }

  private record(row: Omit<ComparisonRow, 'testCase'>) {
    this.rows.push({ testCase: this.testCase, ...row });
    if (row.agentId) this.agentsChecked.add(row.agentId);
  }

  compareField(opts: {
    agentName: string;
    agentId: string;
    date: string;
    hour: string;
    campaign: string;
    field: string;
    aprValue: string;
    referenceValue: string;
    source: string;
    matches: boolean;
    reason?: string;
  }) {
    const { matches, ...rest } = opts;
    this.record({ ...rest, result: matches ? 'PASS' : 'FAIL' });
  }

  noData(opts: {
    agentName?: string;
    agentId?: string;
    date: string;
    hour: string;
    campaign: string;
    source: string;
    reason: string;
  }) {
    this.record({
      agentName: opts.agentName ?? '',
      agentId: opts.agentId ?? '',
      date: opts.date,
      hour: opts.hour,
      campaign: opts.campaign,
      field: 'Data',
      aprValue: '',
      referenceValue: '',
      result: 'NO DATA',
      reason: opts.reason,
      source: opts.source,
    });
  }

  error(kind: ErrorKind, message: string, context?: string) {
    this.errors.push({ testCase: this.testCase, kind, message, context });
  }

  summary() {
    const total = this.rows.length;
    const passed = this.rows.filter((r) => r.result === 'PASS').length;
    const failed = this.rows.filter((r) => r.result === 'FAIL').length;
    const noData = this.rows.filter((r) => r.result === 'NO DATA').length;
    return { total, passed, failed, noData, agentsChecked: this.agentsChecked.size, errors: this.errors.length };
  }

  /** True if every recorded comparison passed (NO DATA counts as acceptable, not a failure). */
  allPassed(): boolean {
    return this.rows.every((r) => r.result !== 'FAIL');
  }

  /**
   * `attachmentName` defaults to 'apr-comparison' (the existing Standard Report suite's name,
   * scanned for by apr/reporter.ts) so every existing caller is unaffected. Other environments
   * (e.g. apr-new-app/fixtures.ts) pass their own name so their reporter only ever aggregates
   * their own tests — never the existing suite's, and vice versa.
   */
  async attach(testInfo: TestInfo, attachmentName = 'apr-comparison') {
    const payload = {
      testCase: this.testCase,
      params: this.params,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      summary: this.summary(),
      rows: this.rows,
      errors: this.errors,
    };
    await testInfo.attach(attachmentName, {
      body: JSON.stringify(payload, null, 2),
      contentType: 'application/json',
    });
  }
}
