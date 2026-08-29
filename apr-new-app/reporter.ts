import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

interface AttachedPayload {
  testCase: string;
  params: Record<string, string>;
  startedAt: string;
  finishedAt: string;
  summary: { total: number; passed: number; failed: number; noData: number; agentsChecked: number; errors: number };
  rows: Array<Record<string, string>>;
  errors: Array<{ kind: string; message: string; context?: string }>;
}

interface RenderedTest extends AttachedPayload {
  status: string;
  screenshots: string[];
}

/**
 * Aggregates every new-application test's `new-app-comparison` JSON attachment (see
 * apr-new-app/fixtures.ts) into apr-new-app-reports/*.html + *.json — completely separate from
 * apr-reports/*.html (the existing suite's output). Scans for a distinct attachment name
 * ('new-app-comparison' vs. the existing suite's 'apr-comparison'), so even though both reporters
 * run over the same overall test session, neither ever picks up the other's tests. Register
 * alongside './apr/reporter.ts' in playwright.config.ts. See apr-new-app/README.md.
 */
export default class NewAppReporter implements Reporter {
  private tests: RenderedTest[] = [];
  private outDir = path.join(process.cwd(), 'apr-new-app-reports');

  onTestEnd(test: TestCase, result: TestResult) {
    const attachment = result.attachments.find((a) => a.name === 'new-app-comparison');
    if (!attachment || !attachment.body) return;
    const payload = JSON.parse(attachment.body.toString('utf-8')) as AttachedPayload;
    const screenshots = result.attachments.filter((a) => a.name === 'screenshot' && a.path).map((a) => a.path as string);
    this.tests.push({ ...payload, status: result.status, screenshots });
  }

  onEnd(_result: FullResult) {
    if (this.tests.length === 0) return;
    fs.mkdirSync(this.outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(this.outDir, `new-app-report-${stamp}.json`);
    const htmlPath = path.join(this.outDir, `new-app-report-${stamp}.html`);
    fs.writeFileSync(jsonPath, JSON.stringify(this.tests, null, 2));
    fs.writeFileSync(htmlPath, renderHtml(this.tests));
    // eslint-disable-next-line no-console
    console.log(`\nNew Application Standard Report written to:\n  ${htmlPath}\n  ${jsonPath}\n`);
  }
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function renderHtml(tests: RenderedTest[]): string {
  const totals = tests.reduce(
    (acc, p) => ({
      total: acc.total + p.summary.total,
      passed: acc.passed + p.summary.passed,
      failed: acc.failed + p.summary.failed,
      noData: acc.noData + p.summary.noData,
      errors: acc.errors + p.summary.errors,
    }),
    { total: 0, passed: 0, failed: 0, noData: 0, errors: 0 }
  );

  const sections = tests
    .map((p) => {
      const rows = p.rows
        .map(
          (r) => `
      <tr class="${r.result === 'PASS' ? 'pass' : r.result === 'FAIL' ? 'fail' : 'nodata'}">
        <td>${esc(r.field)}</td>
        <td>${esc(r.agentName)}</td>
        <td>${esc(r.agentId)}</td>
        <td>${esc(r.date)}</td>
        <td>${esc(r.hour)}</td>
        <td>${esc(r.campaign)}</td>
        <td>${esc(r.aprValue)}</td>
        <td>${esc(r.referenceValue)}</td>
        <td>${esc(r.source)}</td>
        <td><b>${esc(r.result)}</b></td>
        <td>${esc(r.reason ?? '')}</td>
      </tr>`
        )
        .join('');

      const errorItems = p.errors.map((e) => `<li><b>${esc(e.kind)}</b>: ${esc(e.message)}${e.context ? ` (${esc(e.context)})` : ''}</li>`).join('');
      const shots = p.screenshots.map((s) => `<div>${esc(s)}</div>`).join('');

      return `
      <section>
        <h2>${esc(p.testCase)} <span class="status ${esc(p.status)}">${esc(p.status)}</span></h2>
        <p class="params">Params: ${esc(JSON.stringify(p.params))}</p>
        <p class="meta">Started: ${esc(p.startedAt)} &middot; Finished: ${esc(p.finishedAt)}</p>
        <p class="summary">Checked: ${p.summary.total} &middot; Passed: ${p.summary.passed} &middot; Failed: ${p.summary.failed} &middot; No Data: ${p.summary.noData} &middot; Agents: ${p.summary.agentsChecked} &middot; Errors: ${p.summary.errors}</p>
        ${p.errors.length ? `<ul class="errors">${errorItems}</ul>` : ''}
        ${p.screenshots.length ? `<div class="shots"><b>Failure screenshots:</b>${shots}</div>` : ''}
        <div class="table-wrap">
        <table>
          <thead><tr><th>Field</th><th>Agent Name</th><th>Agent ID</th><th>Date</th><th>Hour</th><th>Campaign</th><th>APR Value</th><th>Reference Value</th><th>Source</th><th>Result</th><th>Reason</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
      </section>`;
    })
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>New Application Standard Report — Validation Report</title>
<style>
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; margin: 24px; color: #1a1a1a; background: #fff; }
  h1 { margin-bottom: 4px; }
  .totals { margin-bottom: 24px; color: #444; }
  section { margin-bottom: 40px; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; white-space: nowrap; }
  th { background: #f5f5f5; position: sticky; top: 0; }
  tr.pass td:last-child { color: #0a7a2f; }
  tr.fail { background: #fff4f4; }
  tr.fail td:last-child { color: #b00020; font-weight: 600; }
  tr.nodata td:last-child { color: #8a6d00; }
  .status.passed { color: #0a7a2f; } .status.failed { color: #b00020; } .status.skipped { color: #8a6d00; }
  .errors { color: #b00020; }
  .params, .meta, .summary { font-family: monospace; font-size: 12px; color: #555; }
</style></head>
<body>
  <h1>New Application &mdash; Standard Report Validation</h1>
  <p class="totals">Total checks: ${totals.total} &middot; Passed: ${totals.passed} &middot; Failed: ${totals.failed} &middot; No Data: ${totals.noData} &middot; Errors: ${totals.errors} &middot; Generated: ${esc(new Date().toISOString())}</p>
  ${sections}
</body></html>`;
}
