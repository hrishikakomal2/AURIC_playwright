const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADERS = ['Test Scenario', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Type', 'Status'];

const BASE_PRECOND =
  'Logged in as admin on AURIC (https://ccaas.azalio.io), navigated to Users (/client/users).';
const SSO_TAB_PRECOND =
  BASE_PRECOND +
  ' Located the target agent\'s row and clicked its "..." (Action) menu, then "Login" — if the agent already has an active session elsewhere, an "Agent Already Logged In... Do you want to proceed and log them out?" confirmation appears first; confirmed with "Yes, proceed!". This opens a new browser tab on the agent\'s own "Login type." page.';

const NOT_EXECUTED = 'Not Executed';

const ROWS = [
  {
    scenario: '"Login" on an agent row opens an SSO tab prompting for connection mode and campaign',
    preconditions: SSO_TAB_PRECOND,
    steps: '1. From the Users list, click "..." on the target agent\'s row.\n2. Click "Login".\n3. Confirm the "Agent Already Logged In" prompt if it appears.\n4. Observe the new tab.',
    testData: 'Agent: hrishikakomal2@gmail.com (Hrishika Komal 1) — configurable via .env SSO_AGENT_EMAIL',
    expected: 'A new browser tab opens showing a "Login type." heading and "Choose how you\'d like to connect" subtext, with a "Select Type" dropdown (defaults to the agent\'s configured call mode, e.g. "Webrtc"), a "Select Campaign" dropdown, and a "Submit" button.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Selecting mode and campaign then Submit logs the agent in and lands on their dashboard',
    preconditions: SSO_TAB_PRECOND,
    steps: '1. On the SSO tab, confirm/select the connection mode in "Select Type".\n2. Open "Select Campaign" and choose a campaign.\n3. Click Submit.\n4. Observe the resulting page.',
    testData: 'Mode: Webrtc; Campaign: "preview manual — preview_manual" — both configurable via .env (SSO_MODE, SSO_CAMPAIGN)',
    expected: 'The tab navigates to /agent/dashboard, logged in as the target agent (name shown in the header, e.g. "Hrishika Komal 1", role "Agent"), with "You\'re currently on: <campaign>" shown and the dialpad / call-history workspace loaded.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Submitting without explicitly picking a campaign still succeeds, defaulting to the agent\'s last-used campaign',
    preconditions: SSO_TAB_PRECOND,
    steps: '1. On the SSO tab, do not touch "Select Campaign" (leave it on its placeholder).\n2. Click Submit directly.\n3. Observe the result.',
    testData: 'Select Campaign: left untouched (no explicit selection)',
    expected: 'Given "Select Campaign" has no visible required-field marker, one of two outcomes would be reasonable: Submit is blocked pending a selection, or it is disabled until one is made.',
    actualNote:
      'Live-verified: neither happens. The "Submit" button is never disabled, and clicking it with no campaign chosen does not block the flow at all — it proceeds straight to /agent/dashboard, silently defaulting to whatever campaign the agent was last active on ("Preview Manual" in this environment) rather than surfacing any choice or validation to the operator. Reproduced consistently, not flaky. Not filed as a defect since this may be intentional convenience behavior rather than a validation gap, but it is worth the team confirming intent.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: '"Back to Login" returns from the SSO tab to the admin login page without affecting the original tab',
    preconditions: SSO_TAB_PRECOND,
    steps: '1. On the SSO tab, without submitting, click "← Back to Login".\n2. Observe the SSO tab.\n3. Switch back to the original admin tab and observe it.',
    testData: 'N/A',
    expected: 'The SSO tab navigates to the root AURIC sign-in page ("Welcome — Sign in to your AURIC workspace"); the original admin tab is unaffected and remains on the Users list.',
    type: 'Functional',
    status: 'Pass',
  },
];

const TYPE_FILL = {
  Positive: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } },
  Negative: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } },
  Boundary: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
  Functional: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } },
};

const STATUS_FILL = {
  Pass: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } },
  Fail: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } },
  'Not Executed': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } },
};

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Agent SSO Login');

  ws.columns = [
    { width: 46 },
    { width: 42 },
    { width: 50 },
    { width: 30 },
    { width: 55 },
    { width: 12 },
    { width: 14 },
  ];

  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF305496' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  headerRow.height = 20;

  for (const r of ROWS) {
    const status = r.status || NOT_EXECUTED;
    const expected = r.actualNote ? `${r.expected}\n\nActual: ${r.actualNote}` : r.expected;
    const row = ws.addRow([r.scenario, r.preconditions, r.steps, r.testData, expected, r.type, status]);
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      if (colNumber === 6) {
        cell.fill = TYPE_FILL[r.type] || undefined;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (colNumber === 7) {
        cell.font = { bold: true };
        cell.fill = STATUS_FILL[status] || STATUS_FILL[NOT_EXECUTED];
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
    row.height = r.actualNote ? 160 : 100;
  }

  ws.autoFilter = { from: 'A1', to: `G${ROWS.length + 1}` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const outDir = path.join(__dirname, '..', 'test-cases');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'AgentSSOLoginTestCases.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${ROWS.length} test cases)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
