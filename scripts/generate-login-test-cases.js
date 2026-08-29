const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADERS = [
  'Test Scenario',
  'Preconditions',
  'Test Steps',
  'Test Data',
  'Expected Result',
  'Type',
  'Status',
];

const ROWS = [
  {
    scenario: 'Log in with valid credentials',
    preconditions: 'User is on the AURIC login page (https://ccaas.azalio.io) and is not already logged in.',
    steps:
      '1. Navigate to the login page.\n' +
      '2. Enter a valid username in the Username field.\n' +
      '3. Enter the matching password in the Password field.\n' +
      '4. Click the "Sign In" button.',
    testData: 'Username: 20002666\nPassword: 123456',
    expected: 'User is authenticated and redirected to the live dashboard (/client/live-dashboard).',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Log in with invalid credentials',
    preconditions: 'User is on the AURIC login page (https://ccaas.azalio.io) and is not already logged in.',
    steps:
      '1. Navigate to the login page.\n' +
      '2. Enter an invalid username in the Username field.\n' +
      '3. Enter an incorrect password in the Password field.\n' +
      '4. Click the "Sign In" button.',
    testData: 'Username: invalid_user\nPassword: wrong_password',
    expected: 'Login is rejected; user remains on the login page and is not redirected to the dashboard.',
    type: 'Negative',
    status: 'Pass',
  },
];

const STATUS_FILL = {
  Pass: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } },
  Fail: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } },
  'Not Executed': { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } },
};

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Login Test Cases');

  ws.columns = [
    { width: 32 },
    { width: 40 },
    { width: 45 },
    { width: 28 },
    { width: 45 },
    { width: 12 },
    { width: 12 },
  ];

  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF305496' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  headerRow.height = 20;

  for (const r of ROWS) {
    const row = ws.addRow([r.scenario, r.preconditions, r.steps, r.testData, r.expected, r.type, r.status]);
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      if (colNumber === HEADERS.length) {
        cell.font = { bold: true };
        cell.fill = STATUS_FILL[r.status] || STATUS_FILL['Not Executed'];
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
    row.height = 70;
  }

  ws.autoFilter = { from: 'A1', to: `G${ROWS.length + 1}` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const outDir = path.join(__dirname, '..', 'test-cases');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'LoginTestCases.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
