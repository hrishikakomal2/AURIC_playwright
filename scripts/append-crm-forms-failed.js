const ExcelJS = require('exceljs');
const path = require('path');

const TYPE_FILL = {
  Positive: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } },
  Negative: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } },
  Boundary: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
  Functional: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } },
};

// Corrected actual-result text for the existing row 19 (deep-link redirect defect) — the
// "looks like throttling" note was wrong: the "Save intermittently doesn't complete" symptom
// mixed into that investigation turned out to be a separate, fully root-caused bug (see the new
// row below), not account throttling.
const UPDATED_ROW_19_ACTUAL =
  'The POST that creates the form succeeds (HTTP 200) and the form IS persisted (confirmed present in the CRM Forms ' +
  'list afterward), but the page redirects to /client/live-dashboard instead of back to the CRM Forms list. No success ' +
  'toast is shown on that page, so the user has no visible confirmation their form was saved and lands on an unrelated ' +
  'page. Reproduced consistently (2/2) in isolated, clean automated runs when the Add Form page is reached via a direct ' +
  'URL load. Root cause appears specific to arriving at /crm-forms/add without existing in-app navigation context — ' +
  'reaching the same page by clicking "Add Form" from the CRM Forms list does not exhibit this (Save correctly returns ' +
  'to the list there).';

const NEW_ROWS = [
  {
    source: 'CRM Forms',
    scenario:
      '20. [DEFECT] Form Name over 30 characters is accepted by the UI\'s 100-character limit but rejected by the database',
    preconditions: 'Logged in as admin on AURIC (https://ccaas.azalio.io), on Campaign > Create Campaign > CRM > Add Form.',
    steps:
      '1. Go to Campaign Management > Campaign > CRM > Add Form.\n' +
      '2. Enter a Form Name that is longer than 30 characters but no more than 100 (e.g. 50 repeated letters — well within ' +
      'the "0/100" counter shown under the field, and well within the 100-character hard cap the field itself enforces).\n' +
      '3. Click "Add Field", choose "Textfield", enter any Field Title, click Confirm.\n' +
      '4. Click "Generate URL".\n' +
      '5. Click Save.\n' +
      '6. Observe the result — is there a success confirmation, or does saving silently fail?',
    testData: 'Form Name: 50-character string (e.g. "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"). One Textfield field.',
    expected:
      'Per the UI\'s own stated limit (100 characters, enforced as a hard cap — see the "Form Name is hard-capped at its ' +
      '100-character limit" case), any name up to 100 characters should save successfully.',
    actual:
      'Save fails for any Form Name over 30 characters, even though the UI accepts and displays up to 100. The request is ' +
      'sent and reaches the server, which returns HTTP 400 with a raw, unhandled SQL error instead of a normal validation ' +
      'message: a SequelizeDatabaseError / MySQL "ER_DATA_TOO_LONG" — "Data too long for column \'form_name\' at row 1" — ' +
      'because the crm_forms.form_name database column is only 30 characters wide, far narrower than the 100 the frontend ' +
      'advertises and enforces. Live-bisected precisely and reproduced every time: a 30-character name saves fine, a ' +
      '31-character name fails, with no exceptions across repeated tries. Two distinct problems: (1) a functional bug — a ' +
      'perfectly reasonable, UI-legal form name silently fails with no actionable message, just a stuck form and no ' +
      'explanation; (2) an information-disclosure concern — the raw SQL INSERT statement (including this account\'s ID and ' +
      'the full JSON payload) and internal Sequelize/MySQL error internals are echoed back in the API response body, which ' +
      'a real client should never receive. Recommend either widening the database column to genuinely support 100 ' +
      'characters (matching the UI\'s promise), or capping the UI\'s Form Name field at 30 characters to match reality — ' +
      'and in either case, replacing the raw DB error with a clean validation message and removing internal error details ' +
      'from the response body.',
    type: 'Functional',
  },
];

async function main() {
  const outPath = path.join(__dirname, '..', 'test-cases', 'FailedTestCases.xlsx');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(outPath);
  const ws = wb.getWorksheet('Failed Test Cases');
  if (!ws) throw new Error('Worksheet "Failed Test Cases" not found in ' + outPath);

  // Correct the existing row 19 entry's Actual Result column (G / col 7).
  let corrected = 0;
  ws.eachRow((row, rowNumber) => {
    const scenario = String(row.getCell(2).value || '');
    if (scenario.startsWith('19. [DEFECT] Deep-linking')) {
      const cell = row.getCell(7);
      cell.value = UPDATED_ROW_19_ACTUAL;
      cell.alignment = { vertical: 'top', wrapText: true };
      corrected++;
    }
  });

  for (const r of NEW_ROWS) {
    const status = 'Fail';
    const row = ws.addRow([r.source, r.scenario, r.preconditions, r.steps, r.testData, r.expected, r.actual, r.type, status]);
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
        cell.font = { bold: true, color: { argb: 'FFC00000' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
    row.height = 200;
  }

  const lastRow = ws.rowCount;
  ws.autoFilter = { from: 'A1', to: `I${lastRow}` };

  await wb.xlsx.writeFile(outPath);
  console.log(`Corrected ${corrected} existing row(s), appended ${NEW_ROWS.length} new row(s) to ${outPath} (now ${lastRow - 1} data rows)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
