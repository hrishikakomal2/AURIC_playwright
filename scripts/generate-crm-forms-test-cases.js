const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADERS = ['Test Scenario', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Type', 'Status'];

const BASE_PRECOND =
  'Logged in as admin on AURIC (https://ccaas.azalio.io), navigated to Campaign Management > Campaign > CRM (/client/campaign/crm-forms).';
const ADD_FORM_PRECOND = BASE_PRECOND + ' On Add CRM Form (reached by clicking "Add Form" from the list).';

const NOT_EXECUTED = 'Not Executed';

const ROWS = [
  // ---------------- Page load ----------------
  {
    scenario: 'CRM Forms list page loads with Add Form button, search box and table headers',
    preconditions: BASE_PRECOND,
    steps: '1. Navigate to Campaign Management > Campaign > CRM.\n2. Observe the page.',
    testData: 'N/A',
    expected: 'Page shows "CRM Forms" heading, an "Add Form" button, a "Search by form name" box, and a table with columns Form Name, Form URL, Date Time, Action.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Add CRM Form page loads with Form Name, Form URL and Add Field controls',
    preconditions: BASE_PRECOND,
    steps: '1. Click "Add Form".\n2. Observe the page.',
    testData: 'N/A',
    expected: '"Add CRM Form" heading is shown, along with a Form Name input (0/100 counter), a Form URL field with a "Generate URL" button, an "Add Field" button, "No fields added yet. Click \\"Add Field\\" to begin." placeholder text, and Save / Cancel buttons.',
    type: 'Functional',
    status: 'Pass',
  },

  // ---------------- Field-type picker ----------------
  {
    scenario: 'Add Field opens a picker listing all five field types',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Click "Add Field".\n2. Observe the "Select Field Type" dialog.',
    testData: 'N/A',
    expected: 'Dialog lists exactly five field type options: Textfield, Dropdown, Date, Radio, Big Textfield.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Selecting Textfield opens a Configure textfield modal with Field Title and Required',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Click "Add Field".\n2. Click "Textfield".\n3. Observe the "Configure textfield" dialog.',
    testData: 'N/A',
    expected: 'Dialog shows a "Field Title" input (0/50 counter), a "Required" checkbox, and Cancel / Confirm buttons.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Confirming a field adds it to the Form Fields list with its type and Required tags',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Click "Add Field" > "Textfield".\n2. Enter Field Title.\n3. Check "Required".\n4. Click Confirm.',
    testData: 'Field Title: Customer Name; Required: checked',
    expected: 'A new row "Customer Name" appears under Form Fields, tagged "textfield" and "Required".',
    type: 'Functional',
    status: 'Pass',
  },

  // ---------------- Mandatory field validation ----------------
  {
    scenario: 'Save without a Form Name shows "Form name is required"',
    preconditions: ADD_FORM_PRECOND + ' One field already added.',
    steps: '1. Leave Form Name empty.\n2. Add one Textfield field.\n3. Click Save.',
    testData: 'Form Name: (empty)',
    expected: 'Save is blocked; "Form name is required" message is shown; the page stays on Add CRM Form.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: 'Save without any Form Field shows "At least one form field is required"',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Enter a Form Name.\n2. Do not add any field.\n3. Click Save.',
    testData: 'Form Name: any valid name; Form Fields: (none)',
    expected: 'Save is blocked; "At least one form field is required" message is shown; the page stays on Add CRM Form.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: '[Form URL has no visible required-marker, but] Save without generating a Form URL is blocked',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Enter a Form Name.\n2. Add one Textfield field.\n3. Do NOT click "Generate URL".\n4. Click Save.',
    testData: 'Form Name: any valid name; Form URL: not generated',
    expected:
      'Neither "Form URL" nor "Generate URL" is marked with a required-field asterisk in the UI, yet Save is silently blocked with "Please generate a Form URL before saving"; the page stays on Add CRM Form.',
    type: 'Negative',
    status: 'Pass',
  },

  // ---------------- Successful creation ----------------
  {
    scenario: 'Create a CRM form with one required textfield succeeds and appears in the list',
    preconditions: ADD_FORM_PRECOND,
    steps:
      '1. Enter a Form Name.\n2. Click "Add Field" > "Textfield", enter a Field Title, check Required, click Confirm.\n' +
      '3. Click "Generate URL".\n4. Click Save.',
    testData: 'Form Name: "QA Test Form"; Field: "Customer Name" (textfield, required)',
    expected: '"Form saved successfully" toast is shown, the page returns to the CRM Forms list, and the new form appears there by name.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Newly created form shows a Date Time value in the CRM Forms list',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Create a CRM form with a Form Name, one field, and a generated URL.\n2. Click Save.\n3. Find the new row in the list.',
    testData: 'Form Name: any valid name; one field',
    expected: 'The new row\'s Date Time column shows a real timestamp (not a blank "—" placeholder).',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Cancel ----------------
  {
    scenario: 'Cancel button returns to the CRM Forms list without saving',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Enter a Form Name.\n2. Add one field.\n3. Click Cancel (not Save).\n4. Search the list for the name used.',
    testData: 'Form Name: "QA Cancel Test"',
    expected: 'Navigates back to the CRM Forms list; the form was never created — searching for its name returns no results.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Form Name / Field Title field behavior ----------------
  {
    scenario: 'Form Name is hard-capped at its 100-character limit',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Paste or type 110 characters into Form Name.\n2. Observe the field value and counter.',
    testData: '"A" repeated 110 times',
    expected: 'Only the first 100 characters are accepted (value is truncated); the counter reads "100 / 100".',
    type: 'Boundary',
    status: 'Pass',
  },
  {
    scenario: 'Field Title is hard-capped at its 50-character limit',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Click "Add Field" > "Textfield".\n2. Paste or type 60 characters into Field Title.\n3. Observe the field value and counter.',
    testData: '"B" repeated 60 times',
    expected: 'Only the first 50 characters are accepted (value is truncated); the counter reads "50 / 50".',
    type: 'Boundary',
    status: 'Pass',
  },

  // ---------------- Form URL ----------------
  {
    scenario: 'Generate URL populates the Form URL field with a form link',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Click "Generate URL".\n2. Observe the Form URL field.',
    testData: 'N/A',
    expected: 'Form URL field is populated with a link of the form "https://ccaas.azalio.io/form/<uuid>".',
    type: 'Functional',
    status: 'Pass',
  },

  // ---------------- List / search / view / edit / delete ----------------
  {
    scenario: 'Search by form name filters the CRM Forms list',
    preconditions: BASE_PRECOND + ' At least one CRM form exists (create one if needed).',
    steps: '1. Create a CRM form with a unique, identifiable name.\n2. Go to the CRM Forms list.\n3. Type the form\'s full name into "Search by form name".\n4. Confirm the matching row is shown.\n5. Clean up by deleting the test form.',
    testData: 'Form Name: "QA Search <unique>"',
    expected: 'The CRM Forms list filters down to show only the matching form(s) by name.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'View action shows a preview with the field count and field type/required tags',
    preconditions: BASE_PRECOND + ' A CRM form with one required Textfield exists (create one if needed).',
    steps: '1. Locate the form in the CRM Forms list.\n2. Click the eye (View) icon in its Action column.\n3. Observe the preview dialog.',
    testData: 'A CRM form with 1 field: "Customer Name" (textfield, required)',
    expected: 'A preview dialog opens showing "1 field", the field name "Customer Name", and tags "textfield" and "Required".',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Edit action opens Edit CRM Form pre-filled with the existing name and fields',
    preconditions: BASE_PRECOND + ' A CRM form exists (create one if needed).',
    steps: '1. Locate the form in the CRM Forms list.\n2. Click the pencil (Edit) icon in its Action column.\n3. Observe the Edit CRM Form page.',
    testData: 'An existing CRM form with 1 field',
    expected: '"Edit CRM Form" page opens with the Form Name input pre-filled with the existing name, and the existing field(s) listed under Form Fields.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Delete form functionality removes the form after confirmation',
    preconditions: BASE_PRECOND + ' A CRM form exists (create one if needed).',
    steps:
      '1. Locate the form in the CRM Forms list.\n2. Click the trash (Delete) icon in its Action column.\n' +
      '3. Confirm the "Are you sure you want to delete this form?" prompt by clicking Yes.',
    testData: 'An existing CRM form',
    expected: '"Form deleted" toast is shown; the row disappears from the list.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Known defects ----------------
  {
    scenario: '[DEFECT] Deep-linking straight to Add CRM Form misroutes Save to the dashboard, not the CRM Forms list',
    preconditions: 'Logged in as admin on AURIC. Reach the Add CRM Form page via a direct URL load (bookmark, browser refresh, or shared link) rather than clicking "Add Form" from the list — i.e. load https://ccaas.azalio.io/client/campaign/crm-forms/add directly.',
    steps:
      '1. Load https://ccaas.azalio.io/client/campaign/crm-forms/add directly in the browser address bar.\n' +
      '2. Enter a Form Name.\n3. Add one Textfield field.\n4. Click "Generate URL".\n5. Click Save.\n' +
      '6. Observe which page you land on.\n7. Separately, go to Campaign Management > Campaign > CRM and check whether the form was actually created.',
    testData: 'Form Name: "QA DeepLink <unique>"; one Textfield field',
    expected: 'After a successful Save, the user should be returned to the CRM Forms list with a "Form saved successfully" confirmation and the new form visible (as happens when reaching this page via "Add Form").',
    actualNote:
      'Live-verified: the POST succeeds (HTTP 200) and the form IS persisted (visible in the list afterward), but the page redirects to /client/live-dashboard instead of back to the CRM Forms list — no success toast is shown, so the user has no confirmation their form was saved and lands on an unrelated page. Reproduced consistently, not flaky.',
    type: 'Negative',
    status: 'Fail',
  },
  {
    scenario: '[DEFECT] Form Name over 30 characters is accepted by the UI\'s 100-char limit but rejected by the database',
    preconditions: ADD_FORM_PRECOND,
    steps: '1. Enter a Form Name longer than 30 characters but no more than 100 (e.g. 50 repeated letters).\n2. Add one Textfield field.\n3. Click "Generate URL".\n4. Click Save.\n5. Observe the result.',
    testData: 'Form Name: 50-character string (e.g. "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")',
    expected: 'Per the UI\'s own stated limit (100 characters, hard-capped), any name up to 100 characters should save successfully.',
    actualNote:
      'Live-verified: Save fails for any Form Name over 30 characters, even though the UI accepts and displays up to 100. The request reaches the server, which returns HTTP 400 with a raw, unhandled SQL error instead of a validation message — a MySQL "ER_DATA_TOO_LONG" ("Data too long for column \'form_name\' at row 1") because the crm_forms.form_name database column is only 30 characters wide. Bisected precisely: 30 chars saves, 31 chars fails, every time. The raw SQL INSERT statement and internal error details are also echoed back in the response body (information-disclosure concern).',
    type: 'Negative',
    status: 'Fail',
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
  const ws = wb.addWorksheet('CRM Forms');

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
    row.height = r.actualNote ? 160 : 85;
  }

  ws.autoFilter = { from: 'A1', to: `G${ROWS.length + 1}` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const outDir = path.join(__dirname, '..', 'test-cases');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'CRMFormsTestCases.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${ROWS.length} test cases)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
