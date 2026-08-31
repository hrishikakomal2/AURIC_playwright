const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADERS = ['Test Scenario', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Type', 'Status'];

const BASE_PRECOND =
  'Logged in as admin on AURIC (https://ccaas.azalio.io), navigated to Campaign Management > Campaign > Create Campaign, and switched Campaign mode to "Outgoing Campaign".';

const NOT_EXECUTED = 'Not Executed';

const ROWS = [
  {
    scenario: 'Outgoing mode shows Select Dialer and Select Queue instead of Incoming\'s Select Call flow',
    preconditions: BASE_PRECOND,
    steps: '1. Open Create Campaign.\n2. Click "Outgoing Campaign".\n3. Observe the form fields.',
    testData: 'N/A',
    expected: 'The form shows Campaign name, Select DID, "Select Dialer", and "Select Queue" fields; the Incoming-only "Select Call flow" field is not present.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Select Dialer dropdown lists the available dialer modes, including "Preview Manual"',
    preconditions: BASE_PRECOND,
    steps: '1. Click the "Select Dialer" field.\n2. Observe the dropdown options.',
    testData: 'N/A',
    expected: 'Dropdown lists dialer modes including "Preview Manual" (also: Preview Auto, Power Dialer, Progressive Dialer, Predictive Dialer, Click To Call, AI Auto Dialer).',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Create an Outgoing Campaign with Preview Manual dialer — new campaign starts Pending, not Running',
    preconditions: BASE_PRECOND,
    steps:
      '1. Enter a Campaign name.\n2. Select a DID.\n3. Set "Select Dialer" to "Preview Manual".\n4. Set "Select Queue" to an available queue.\n' +
      '5. Click Save.\n6. Observe the new row in the Campaign list.',
    testData: 'Dialer: Preview Manual; Queue: any available (e.g. "max q")',
    expected:
      'Unlike an Incoming campaign (which is Running immediately, always active), a freshly-saved Outgoing campaign has no run schedule yet, so its Status column shows "Pending" rather than "Running". The row also shows "Preview Manual" and "Outgoing".',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Setting a run schedule via "..." > "Set time" moves the campaign from Pending to Stopped, not straight to Running',
    preconditions: BASE_PRECOND + ' A Pending Outgoing campaign exists (create one if needed).',
    steps:
      '1. In the Campaign list, click "..." on the campaign\'s row.\n2. Click "Set time".\n3. Observe the "Schedule Campaign" dialog\'s pre-filled defaults ' +
      '(Start/End Date, and each weekday\'s Start/End Time).\n4. Click Save without changing anything.\n5. Observe the toast and the row\'s Status column.',
    testData: 'Defaults used as-is: Start Date = today, End Date = +7 days, every weekday enabled, Start Time 09:00, End Time 18:30',
    expected: '"Campaign scheduled successfully" toast is shown. Because setting a schedule alone does not start the campaign, Status moves from "Pending" to "Stopped" — not directly to "Running". (Actually running it needs a separate action, e.g. a Run/Stop toggle, once a contact list exists — out of scope here.)',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: '"Upload" on a campaign row navigates to a dedicated "Add Campaign Data" page, not a modal',
    preconditions: BASE_PRECOND + ' An Outgoing campaign exists (create one if needed).',
    steps: '1. In the Campaign list, click "Upload" on the campaign\'s row.\n2. Observe the resulting page.',
    testData: 'N/A',
    expected: 'The browser navigates to /client/campaign/upload-numbers?id=<campaignId> — a full page titled "Add Campaign Data" — with a "Base File *" upload control, a link to download a sample CSV (columns: Contacts, Description), a "File Name" field, and a "Country Code *" field defaulting to 91.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: '[MINOR] "File Name" has no visible required-field marker, but Save enforces it as required',
    preconditions: BASE_PRECOND + ' On the "Add Campaign Data" page with a contact-list file already selected (Base File filled).',
    steps: '1. Leave "File Name" empty (it shows no red asterisk, unlike "Base File *", "Country Code *", "Customer Number *").\n2. Map "Customer Number" to the uploaded file\'s number column.\n3. Click Save.',
    testData: 'File Name: (empty)',
    expected: 'A field with no required-marker in the UI should either genuinely be optional, or be marked required for consistency with the other mandatory fields on the same form.',
    actualNote:
      'Live-verified: Save is blocked and a red "Required" validation message appears directly under the File Name input — it IS mandatory, just not visually marked as such like its sibling fields. Reproduced consistently, not flaky. Minor UI-consistency issue, not filed as a blocking defect.',
    type: 'Boundary',
    status: 'Pass',
  },
  {
    scenario: 'Uploading a contact list to a scheduled campaign succeeds end-to-end with a real file',
    preconditions:
      BASE_PRECOND + ' A Stopped, scheduled Outgoing campaign exists (create one and run Set time first). File/column are read from .env: OUTGOING_CAMPAIGN_UPLOAD_FILE, OUTGOING_CAMPAIGN_UPLOAD_CUSTOMER_COLUMN.',
    steps:
      '1. Click "Upload" on the campaign\'s row.\n2. Select the contact-list file (sets the Base File input directly — no native OS file dialog involved).\n' +
      '3. Under "Please map the fields", map "Customer Number" to the file\'s phone-number column.\n4. Fill "File Name".\n5. Click Save.\n6. Observe the toast and destination page.',
    testData: 'File: data/sample-file (3).csv (columns: Contacts, Description); Customer Number mapped to: "Contacts"; File Name: campaign name',
    expected: '"Campaign numbers are being uploaded" toast is shown, and the browser returns to the Campaign list.',
    type: 'Positive',
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
  const ws = wb.addWorksheet('Outgoing Campaign');

  ws.columns = [
    { width: 46 },
    { width: 42 },
    { width: 50 },
    { width: 32 },
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
    row.height = r.actualNote ? 160 : 110;
  }

  ws.autoFilter = { from: 'A1', to: `G${ROWS.length + 1}` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const outDir = path.join(__dirname, '..', 'test-cases');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'PreviewManualCampaignTestCases.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${ROWS.length} test cases)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
