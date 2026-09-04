const ExcelJS = require('exceljs');
const path = require('path');

const rows = [
  {
    id: 'cdr-check/calls-field-check.spec.ts',
    expected: 'All 101 call rows in date range 2026-07-01 to 2026-07-30 satisfy every field presence/value rule (0 failing checks out of 4949).',
    actual: '245 of 4949 field checks failed (1464 pass, 3240 N/A). Recurring failures: "Campaign Name is required" (blank on some rows), "Invalid status: Ongoing" (unrecognized Call Status value), "Total Duration required unless Call Status = Abandoned" (missing on non-abandoned calls).',
    status: 'FAIL',
    reason: 'Genuine data-validation defects in live CDR data, not a script bug — blank Campaign Name, calls stuck in "Ongoing" status, missing Total Duration on non-abandoned calls.',
  },
  {
    id: 'incoming-campaign.spec.ts #07',
    expected: 'Campaign "QA Auto Incoming ..." is created, then cleaned up via delete.',
    actual: "Cleanup step (deleteCampaignByName) timed out after 30s waiting for the row's \"...\" menu icon — the created campaign's row was never found.",
    status: 'FAIL',
    reason: "Either campaign creation silently failed, or the list didn't show/refresh to the new row in time. helpers.ts:271 can't locate the row.",
  },
  {
    id: 'incoming-campaign.spec.ts #08',
    expected: 'Newly created campaign row is visible with status "Running".',
    actual: 'Same as #07 — cleanup timed out, row never found.',
    status: 'FAIL',
    reason: 'Same root cause as #07.',
  },
  {
    id: 'incoming-campaign.spec.ts #12 [DEFECT]',
    expected: 'Campaign with a special-characters-only name is created (documenting the defect), then cleaned up.',
    actual: 'Cleanup timed out, row never found.',
    status: 'FAIL',
    reason: 'Same root cause as #07.',
  },
  {
    id: 'incoming-campaign.spec.ts #14 [DEFECT]',
    expected: 'Campaign name is stored with literal whitespace (documenting the defect), then cleaned up.',
    actual: 'Cleanup timed out, row never found.',
    status: 'FAIL',
    reason: 'Same root cause as #07.',
  },
  {
    id: 'incoming-campaign.spec.ts #15',
    expected: 'SQL injection payload stored literally, not executed; cleanup succeeds.',
    actual: 'Cleanup timed out, row never found.',
    status: 'FAIL',
    reason: 'Same root cause as #07.',
  },
  {
    id: 'incoming-campaign.spec.ts #16',
    expected: 'XSS payload stored/rendered as plain text, not executed; cleanup succeeds.',
    actual: 'Cleanup timed out, row never found.',
    status: 'FAIL',
    reason: 'Same root cause as #07.',
  },
  {
    id: 'incoming-campaign.spec.ts #17',
    expected: 'After clicking "Enable CRM", the "CRM form" field and Pop-up/Embedded buttons become visible.',
    actual: '"CRM form" text never appeared (5s timeout).',
    status: 'FAIL',
    reason: 'Likely cascading effect from an earlier failed/timed-out test in the same file leaving the Create Campaign page in a stale state, or a genuine UI regression in the toggle. Needs isolated re-run to confirm.',
  },
  {
    id: 'incoming-campaign.spec.ts #19',
    expected: '"Select Disposition" field becomes visible after toggling "Enable Disposition".',
    actual: '"Select Disposition" text never appeared (5s timeout).',
    status: 'FAIL',
    reason: 'Same pattern as #17.',
  },
  {
    id: 'incoming-campaign.spec.ts #20',
    expected: '"Select survey" field becomes visible after toggling "Enable Survey feedback".',
    actual: '"Select survey" text never appeared (5s timeout).',
    status: 'FAIL',
    reason: 'Same pattern as #17.',
  },
  {
    id: 'incoming-campaign.spec.ts #21',
    expected: '"Select Media" field becomes visible after toggling "Enable Hold music".',
    actual: '"Select Media" text never appeared (5s timeout).',
    status: 'FAIL',
    reason: 'Same pattern as #17.',
  },
  {
    id: 'incoming-campaign.spec.ts #22',
    expected: '"Select Script" field becomes visible after toggling "Enable Script".',
    actual: '"Select Script" text never appeared (5s timeout).',
    status: 'FAIL',
    reason: 'Same pattern as #17.',
  },
  {
    id: 'incoming-campaign.spec.ts #23',
    expected: '"Paste/Type URL" field becomes visible after toggling "Enable Knowledgebase".',
    actual: '"Paste/Type URL" text never appeared (5s timeout).',
    status: 'FAIL',
    reason: 'Same pattern as #17.',
  },
  {
    id: 'incoming-campaign.spec.ts #25',
    expected: 'Test campaign created, filtered/found by search, then cleaned up.',
    actual: 'Cleanup timed out, row never found.',
    status: 'FAIL',
    reason: 'Same root cause as #07.',
  },
  {
    id: 'incoming-campaign.spec.ts #26',
    expected: "Row exists and its \"...\" menu is clickable to proceed with delete confirmation.",
    actual: "row.locator('.anticon-more') timed out after 30s directly in the test body.",
    status: 'FAIL',
    reason: 'Same root cause as #07 — row/menu icon not found in time.',
  },
  {
    id: 'incoming-campaign.spec.ts #27 [BY DESIGN]',
    expected: "The row's ant-switch toggle has aria-checked=\"true\" and cannot be turned off.",
    actual: 'element(s) not found — the row filtered by campaign name (and its switch) was never located.',
    status: 'FAIL',
    reason: "Same root cause as #07 — created campaign's row missing from the list.",
  },
  {
    id: 'preview-manual-campaign.spec.ts #03',
    expected: 'Campaign created, starts in "Pending" status, then cleaned up.',
    actual: 'Cleanup (deleteCampaignByName) timed out after 30s, row never found.',
    status: 'FAIL',
    reason: 'Same root cause as incoming-campaign #07 — created campaign row not appearing.',
  },
  {
    id: 'preview-manual-campaign.spec.ts #04',
    expected: 'Schedule set via row\'s "..." > "Set time", campaign moves to "Stopped".',
    actual: "setCampaignSchedule timed out after 30s waiting for the row's \"...\" icon.",
    status: 'FAIL',
    reason: 'Same missing-row pattern as above.',
  },
  {
    id: 'preview-manual-campaign.spec.ts #05',
    expected: 'Contact list uploaded successfully to a previously scheduled campaign.',
    actual: "setCampaignSchedule timed out after 30s waiting for the row's \"...\" icon.",
    status: 'FAIL',
    reason: 'Same missing-row pattern as above.',
  },
  {
    id: 'preview-manual-campaign.spec.ts #09',
    expected: '"Abandoned Call Retry Interval (Minutes)", "Failed Call Retry Interval (Minutes)", and "Max Per Day Attempts" become visible after toggling "Enable call retry".',
    actual: '"Abandoned Call Retry Interval (Minutes)" never appeared (5s timeout).',
    status: 'FAIL',
    reason: 'Same toggle-doesn\'t-reveal-field pattern as incoming-campaign.spec.ts #17 group.',
  },
  {
    id: 'queue.spec.ts #01',
    expected: 'Agent "Hrishika Komal 1" is selected in the "Select agents" field, queue created successfully.',
    actual: 'Clicking the agent option in the dropdown timed out after 30s — element resolves in the DOM but is reported "not visible"/"not stable" on every retry.',
    status: 'FAIL',
    reason: 'Same class of bug as the virtualized-dropdown issue fixed earlier in StandardReportsAgentPerformancePage/CallsPage — the option appears to reposition faster than Playwright\'s stability check settles. helpers.ts:161 (selectQueueAgents) needs the same fix pattern.',
  },
  {
    id: 'queue.spec.ts #02',
    expected: 'Setup selects an agent, then verifies empty Queue name blocks submission.',
    actual: 'Same agent-selection timeout as #01; test never reaches its actual assertion.',
    status: 'FAIL',
    reason: 'Same root cause as #01.',
  },
  {
    id: 'queue.spec.ts #04 [DEFECT]',
    expected: 'Setup selects an agent, then verifies duplicate queue names are silently accepted.',
    actual: 'Same agent-selection timeout as #01.',
    status: 'FAIL',
    reason: 'Same root cause as #01.',
  },
  {
    id: 'queue.spec.ts #06',
    expected: 'Multiple agents (including "Hrishika Komal 1") are selected and assigned.',
    actual: 'Same agent-selection timeout as #01.',
    status: 'FAIL',
    reason: "Same root cause as #01 — directly hits the bug since this test's core purpose is assigning agents.",
  },
  {
    id: 'queue.spec.ts #07',
    expected: 'All five options (Even Call Distribution, Random, Serial Hunting, Parallel Ringing, Round Robin) are attached in the dropdown.',
    actual: '"Serial Hunting" option never attached to the DOM within 5s.',
    status: 'FAIL',
    reason: 'The Incoming Algorithm dropdown is virtualized — only options near the current scroll position exist in the DOM. Same root-cause family as the "Start Hour" virtualization bug fixed earlier in StandardReportsAgentPerformancePage.',
  },
  {
    id: 'queue.spec.ts #08',
    expected: 'Agent selected, algorithm set to Round Robin, queue created.',
    actual: 'Same agent-selection timeout as #01.',
    status: 'FAIL',
    reason: 'Same root cause as #01.',
  },
  {
    id: 'queue.spec.ts #10',
    expected: 'Agent selected, custom "Agents attempt" value set, queue created.',
    actual: 'Same agent-selection timeout as #01.',
    status: 'FAIL',
    reason: 'Same root cause as #01.',
  },
  {
    id: 'queue.spec.ts #11',
    expected: 'Agent selected, then verifies "After Attempts, Route To" is required.',
    actual: 'Same agent-selection timeout as #01.',
    status: 'FAIL',
    reason: 'Same root cause as #01.',
  },
  {
    id: 'queue.spec.ts #16',
    expected: 'Agent selected, Caller-in-queue handling configured, queue created.',
    actual: 'Same agent-selection timeout as #01.',
    status: 'FAIL',
    reason: 'Same root cause as #01.',
  },
  {
    id: 'queue.spec.ts #19',
    expected: 'Agent selected, Callback Request configured, queue created.',
    actual: 'Same agent-selection timeout as #01.',
    status: 'FAIL',
    reason: 'Same root cause as #01.',
  },
  {
    id: 'queue.spec.ts #26',
    expected: 'Agent selected, working-hour schedule configured, queue created.',
    actual: 'Same agent-selection timeout as #01.',
    status: 'FAIL',
    reason: 'Same root cause as #01.',
  },
  {
    id: 'queue.spec.ts #29 [DEFECT]',
    expected: '(Per the test, documenting a known defect) 0 "is required" messages appear after submitting an empty form.',
    actual: '1 "is required" message was found.',
    status: 'FAIL',
    reason: "App behavior appears to have changed since this defect-tracking test was written — it now surfaces one validation message where previously it showed none. Likely a partial validation fix on the app side; confirm intent and update the test's expected baseline.",
  },
];

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Test Cases');

  sheet.columns = [
    { header: 'Test Case ID', key: 'id', width: 42 },
    { header: 'Expected Result', key: 'expected', width: 60 },
    { header: 'Actual Result', key: 'actual', width: 60 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Reason', key: 'reason', width: 60 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  for (const row of rows) {
    sheet.addRow(row);
  }

  for (let i = 2; i <= rows.length + 1; i++) {
    const row = sheet.getRow(i);
    row.alignment = { vertical: 'top', wrapText: true };
    const statusCell = row.getCell('status');
    statusCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
    statusCell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'E1' };

  const outPath = path.join(__dirname, '..', 'testcase.xlsx');
  await workbook.xlsx.writeFile(outPath);
  console.log('Wrote', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
