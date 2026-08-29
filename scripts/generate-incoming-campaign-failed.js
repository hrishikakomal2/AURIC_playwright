const ExcelJS = require('exceljs');
const path = require('path');

const HEADERS = ['Source', 'Test Scenario', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Actual Result (Failure)', 'Type', 'Status'];

const TYPE_FILL = {
  Positive: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } },
  Negative: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } },
  Boundary: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
  Functional: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } },
};

const ROWS = [
  {
    scenario: '17. Enable CRM toggle reveals a mandatory "CRM form" field and Display mode option',
    preconditions: 'Logged in as admin on AURIC (https://ccaas.azalio.io). On Campaign > Create Campaign (/client/campaign/create-campaign), Incoming Campaign selected (default).',
    steps:
      '1. Go to Campaign Management > Campaign > Create Campaign.\n' +
      '2. Confirm "Incoming Campaign" is the selected tab (default).\n' +
      '3. Scroll to the "Enable CRM" toggle row and switch it ON.\n' +
      '4. Check whether a "CRM form" field appears, and whether "Pop-up" / "Embedded" display-mode buttons appear next to it.',
    testData: 'No specific data required — only toggling the switch.',
    expected: 'Toggling "Enable CRM" ON reveals a mandatory "CRM form" field, plus "Pop-up" and "Embedded" display-mode buttons.',
    actual: 'After turning the toggle ON, the "CRM form" field/label does not appear anywhere on the page (waited 5s). Reproduced in the latest full automated run (2026-08-18), single clean attempt, no login/network issues.',
    type: 'Functional',
  },
  {
    scenario: '19. Enable Disposition toggle reveals a mandatory "Select Disposition" field',
    preconditions: 'Logged in as admin on AURIC. On Campaign > Create Campaign, Incoming Campaign selected (default).',
    steps:
      '1. Go to Campaign Management > Campaign > Create Campaign.\n' +
      '2. Scroll to the "Enable Disposition" toggle row and switch it ON.\n' +
      '3. Check whether a "Select Disposition" field appears.',
    testData: 'No specific data required — only toggling the switch.',
    expected: 'Toggling "Enable Disposition" ON reveals a mandatory "Select Disposition" field.',
    actual: 'After turning the toggle ON, "Select Disposition" does not appear anywhere on the page (waited 5s). Reproduced in the latest full automated run (2026-08-18), single clean attempt, no login/network issues.',
    type: 'Functional',
  },
  {
    scenario: '20. Enable Survey feedback toggle reveals a mandatory "Select survey" field',
    preconditions: 'Logged in as admin on AURIC. On Campaign > Create Campaign, Incoming Campaign selected (default).',
    steps:
      '1. Go to Campaign Management > Campaign > Create Campaign.\n' +
      '2. Scroll to the "Enable Survey feedback" toggle row and switch it ON.\n' +
      '3. Check whether a "Select survey" field appears.',
    testData: 'No specific data required — only toggling the switch.',
    expected: 'Toggling "Enable Survey feedback" ON reveals a mandatory "Select survey" field.',
    actual: 'After turning the toggle ON, "Select survey" does not appear anywhere on the page (waited 5s). Reproduced in the latest full automated run (2026-08-18), single clean attempt, no login/network issues.',
    type: 'Functional',
  },
  {
    scenario: '21. Enable Hold music toggle reveals a mandatory "Select Media" field',
    preconditions: 'Logged in as admin on AURIC. On Campaign > Create Campaign, Incoming Campaign selected (default).',
    steps:
      '1. Go to Campaign Management > Campaign > Create Campaign.\n' +
      '2. Scroll to the "Enable Hold music" toggle row and switch it ON.\n' +
      '3. Check whether a "Select Media" field appears.',
    testData: 'No specific data required — only toggling the switch.',
    expected: 'Toggling "Enable Hold music" ON reveals a mandatory "Select Media" field.',
    actual: 'After turning the toggle ON, "Select Media" does not appear anywhere on the page (waited 5s). Reproduced in the latest full automated run (2026-08-18), single clean attempt, no login/network issues.',
    type: 'Functional',
  },
  {
    scenario: '22. Enable Script toggle reveals a mandatory "Select Script" field',
    preconditions: 'Logged in as admin on AURIC. On Campaign > Create Campaign, Incoming Campaign selected (default).',
    steps:
      '1. Go to Campaign Management > Campaign > Create Campaign.\n' +
      '2. Scroll to the "Enable Script" toggle row and switch it ON.\n' +
      '3. Check whether a "Select Script" field appears.',
    testData: 'No specific data required — only toggling the switch.',
    expected: 'Toggling "Enable Script" ON reveals a mandatory "Select Script" field.',
    actual: 'After turning the toggle ON, "Select Script" does not appear anywhere on the page (waited 5s). Reproduced in the latest full automated run (2026-08-18), single clean attempt, no login/network issues.',
    type: 'Functional',
  },
  {
    scenario: '23. Enable Knowledgebase toggle reveals a mandatory "Paste/Type URL" field',
    preconditions: 'Logged in as admin on AURIC. On Campaign > Create Campaign, Incoming Campaign selected (default).',
    steps:
      '1. Go to Campaign Management > Campaign > Create Campaign.\n' +
      '2. Scroll to the "Enable Knowledgebase" toggle row and switch it ON.\n' +
      '3. Check whether a "Paste/Type URL" field appears.',
    testData: 'No specific data required — only toggling the switch.',
    expected: 'Toggling "Enable Knowledgebase" ON reveals a mandatory "Paste/Type URL" field.',
    actual: 'After turning the toggle ON, "Paste/Type URL" does not appear anywhere on the page (waited 5s). Reproduced in the latest full automated run (2026-08-18), single clean attempt, no login/network issues.',
    type: 'Functional',
  },
  {
    scenario: '27. [BY DESIGN] An Incoming Campaign\'s Stop/Run toggle cannot be turned off',
    preconditions: 'Logged in as admin on AURIC. An Incoming campaign exists in the Campaign list (create one named e.g. "QA Manual AlwaysOn <date>" first if none exists).',
    steps:
      '1. Go to Campaign Management > Campaign, and locate an Incoming campaign row in the list (or create one via Create Campaign, filling Name + a DID + Call flow = Incoming, then Save).\n' +
      '2. Confirm the row\'s Stop/Run toggle is ON (checked/green).\n' +
      '3. Hover the mouse pointer over the toggle without clicking.\n' +
      '4. Check whether a tooltip appears with text "This Campaign is always active to handle incoming calls and cannot be turned off."\n' +
      '5. Try clicking the toggle and confirm it stays ON (no effect).',
    testData: 'Campaign Name: "QA Manual AlwaysOn <unique>" (only needed if no Incoming campaign already exists to test with).',
    expected: 'Hovering the toggle shows the explanatory tooltip. Clicking the toggle has no effect — it remains ON. (This is the intended/by-design behavior, not a defect.)',
    actual: 'The automated click step failed with a timeout: the toggle button already renders with the HTML "disabled" attribute (aria-checked="true", disabled), so Playwright cannot dispatch a click on it at all — the hover/tooltip assertion right before it passed. This looks consistent with the by-design behavior (a disabled control cannot be toggled), but needs a human to manually hover and visually confirm the tooltip text and confirm no click is possible, since the automated script cannot fully exercise a disabled element.',
    type: 'Functional',
  },
];

async function main() {
  const outWb = new ExcelJS.Workbook();
  const outWs = outWb.addWorksheet('Failed Test Cases');

  outWs.columns = [
    { width: 20 },
    { width: 42 },
    { width: 40 },
    { width: 45 },
    { width: 26 },
    { width: 50 },
    { width: 55 },
    { width: 12 },
    { width: 10 },
  ];

  const headerRow = outWs.addRow(HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  headerRow.height = 20;

  for (const r of ROWS) {
    const status = 'Fail';
    const row = outWs.addRow(['Incoming Campaign', r.scenario, r.preconditions, r.steps, r.testData, r.expected, r.actual, r.type, status]);
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      if (colNumber === 1) {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (colNumber === 8) {
        cell.fill = TYPE_FILL[r.type] || undefined;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (colNumber === 9) {
        const isFail = status === 'Fail';
        cell.font = { bold: true, color: { argb: isFail ? 'FFC00000' : 'FF9C6500' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isFail ? 'FFF8CBAD' : 'FFFFE699' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
    row.height = 110;
  }

  outWs.autoFilter = { from: 'A1', to: `I${ROWS.length + 1}` };
  outWs.views = [{ state: 'frozen', ySplit: 1 }];

  const outPath = path.join(__dirname, '..', 'test-cases', 'FailedTestCases.xlsx');
  await outWb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${ROWS.length} rows)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
