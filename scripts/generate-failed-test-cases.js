const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADERS = ['Source', 'Test Scenario', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Type', 'Status'];

const SOURCES = [
  { file: 'QueueCreationTestCases.xlsx', label: 'Queue Creation' },
  { file: 'AddUserTestCases_Agent.xlsx', label: 'Add User — Agent' },
  { file: 'LoginTestCases.xlsx', label: 'Login' },
];

const TYPE_FILL = {
  Positive: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } },
  Negative: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } },
  Boundary: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
  Functional: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } },
};

async function main() {
  const testCasesDir = path.join(__dirname, '..', 'test-cases');
  const failedRows = [];

  for (const source of SOURCES) {
    const filePath = path.join(testCasesDir, source.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping missing file: ${source.file}`);
      continue;
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);
    const ws = wb.worksheets[0];
    ws.eachRow((row, idx) => {
      if (idx === 1) return; // header
      const status = row.getCell(7).value;
      if (status !== 'Fail') return;
      failedRows.push({
        source: source.label,
        scenario: row.getCell(1).value,
        preconditions: row.getCell(2).value,
        steps: row.getCell(3).value,
        testData: row.getCell(4).value,
        expected: row.getCell(5).value,
        type: row.getCell(6).value,
        status,
      });
    });
  }

  const outWb = new ExcelJS.Workbook();
  const outWs = outWb.addWorksheet('Failed Test Cases');

  outWs.columns = [
    { width: 20 },
    { width: 42 },
    { width: 40 },
    { width: 50 },
    { width: 28 },
    { width: 60 },
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

  for (const r of failedRows) {
    const row = outWs.addRow([r.source, r.scenario, r.preconditions, r.steps, r.testData, r.expected, r.type, r.status]);
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      if (colNumber === 1) {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (colNumber === 7) {
        cell.fill = TYPE_FILL[r.type] || undefined;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (colNumber === 8) {
        cell.font = { bold: true, color: { argb: 'FFC00000' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
    row.height = 95;
  }

  outWs.autoFilter = { from: 'A1', to: `H${failedRows.length + 1}` };
  outWs.views = [{ state: 'frozen', ySplit: 1 }];

  const outPath = path.join(testCasesDir, 'FailedTestCases.xlsx');
  await outWb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${failedRows.length} failed test cases)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
