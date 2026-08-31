const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADERS = ['Test Scenario', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Type', 'Status'];

const BASE_PRECOND =
  'Logged in as admin on AURIC (https://ccaas.azalio.io), navigated to Campaign Management > Campaign > Disposition (/client/campaign/dispositions).';
const ADD_PRECOND = BASE_PRECOND + ' On Add Disposition (reached by clicking "Add Disposition" from the list).';

const NOT_EXECUTED = 'Not Executed';

const ROWS = [
  // ---------------- Page load ----------------
  {
    scenario: 'Dispositions list page loads with Add Disposition button, search box and table headers',
    preconditions: BASE_PRECOND,
    steps: '1. Navigate to Campaign Management > Campaign > Disposition.\n2. Observe the page.',
    testData: 'N/A',
    expected: 'Page shows "Dispositions" heading, an "Add Disposition" button, a "Search dispositions" box, and a table with columns Disposition Name, Sub-dispositions, Created.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Add Disposition page loads with a root node input and Save/Cancel/Reset controls',
    preconditions: BASE_PRECOND,
    steps: '1. Click "Add Disposition".\n2. Observe the page.',
    testData: 'N/A',
    expected: '"Add Disposition" heading is shown with a Level 1 (root) name input, an "Add Node" button (disabled until the root name is filled), and Save / Cancel / Reset buttons.',
    type: 'Functional',
    status: 'Pass',
  },

  // ---------------- Tree building ----------------
  {
    scenario: 'Filling the root name enables "Add Node", which adds a Level 2 sibling',
    preconditions: ADD_PRECOND,
    steps: '1. Confirm "Add Node" is disabled.\n2. Enter a root node name.\n3. Confirm "Add Node" becomes enabled.\n4. Click "Add Node" and name the new node.',
    testData: 'Root: "QA Root"; new node: "QA Child A"',
    expected: '"Add Node" is disabled while the root name is empty, becomes enabled once it is filled, and clicking it adds a new Level 2 node card that accepts and displays the typed name.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'A node\'s "+" (plus-circle) icon adds a child one level deeper',
    preconditions: ADD_PRECOND,
    steps: '1. Fill the root name.\n2. Add a Level 2 node.\n3. Click the "+" icon on that Level 2 node.\n4. Name the resulting Level 3 node.',
    testData: 'Root: "QA Root"; L2: "QA Child A"; L3: "QA Grandchild"',
    expected: 'A new node card appears one level below the clicked node, correctly nested as its child, and accepts the typed name.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'A tree can be built down to Level 5, and Level 5 nodes cannot get a child',
    preconditions: ADD_PRECOND,
    steps: '1. Fill the root name (L1).\n2. Add a child (L2).\n3. Add a child of that child (L3).\n4. Repeat down to L4 and L5.\n5. Inspect the "+" icon on the L5 node.',
    testData: 'L1: "QA L1"; L2: "QA L2"; L3: "QA L3"; L4: "QA L4"; L5: "QA L5"',
    expected: 'The tree builds correctly through all 5 levels; the L5 node\'s "+" (plus-circle) icon is disabled, preventing a 6th level.',
    type: 'Boundary',
    status: 'Pass',
  },

  // ---------------- Deleting nodes ----------------
  {
    scenario: 'Deleting a leaf node removes it after confirmation',
    preconditions: ADD_PRECOND,
    steps: '1. Fill the root name.\n2. Add a Level 2 leaf node.\n3. Click its delete (trash) icon.\n4. Confirm the popover prompt.',
    testData: 'Root: "QA Root"; leaf: "QA Leaf"',
    expected: 'A confirmation popover appears; confirming removes the node from the tree.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Deleting a node with children cascades — the node and all its descendants are removed',
    preconditions: ADD_PRECOND,
    steps: '1. Fill the root name.\n2. Add a Level 2 node ("branch").\n3. Add a Level 3 child under it ("sub").\n4. Delete the Level 2 "branch" node and confirm.',
    testData: 'Root: "QA Root"; L2: "QA Branch"; L3: "QA Sub"',
    expected: 'Both the deleted branch node and its child ("QA Sub") are removed from the tree — deletion cascades to all descendants.',
    type: 'Functional',
    status: 'Pass',
  },

  // ---------------- Validation ----------------
  {
    scenario: 'Save with an empty node name shows "Every disposition node needs a name"',
    preconditions: ADD_PRECOND,
    steps: '1. Fill the root name.\n2. Click "Add Node" but leave the new node\'s name empty.\n3. Click Save.',
    testData: 'Root: "QA Root"; new node: (empty)',
    expected: 'Save is blocked; "Every disposition node needs a name" message is shown; the page stays on Add Disposition (URL still contains /dispositions/add).',
    type: 'Negative',
    status: 'Pass',
  },

  // ---------------- Successful creation ----------------
  {
    scenario: 'A root-only disposition (no children) saves successfully',
    preconditions: ADD_PRECOND,
    steps: '1. Fill only the root name.\n2. Click Save.\n3. Locate the new row in the Dispositions list.',
    testData: 'Root: unique name, e.g. "QA RootOnly <unique>"',
    expected: '"Disposition created" toast is shown, the page returns to the Dispositions list, and the new row shows a Sub-dispositions count of 0.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'A disposition with a nested tree saves successfully and shows the correct sub-disposition count',
    preconditions: ADD_PRECOND,
    steps:
      '1. Fill the root name.\n2. Add two Level 2 children ("Child A", "Child B").\n' +
      '3. Add a Level 3 child under "Child A" ("Grandchild").\n4. Click Save.\n5. Locate the new row in the list.',
    testData: 'Root: unique name; L2: "QA Child A", "QA Child B"; L3 (under Child A): "QA Grandchild"',
    expected: '"Disposition created" toast is shown, and the new row\'s Sub-dispositions count correctly totals 3 (all non-root nodes, across all levels).',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Known defects ----------------
  {
    scenario: '[DEFECT] Duplicate sibling disposition names are accepted, not rejected',
    preconditions: ADD_PRECOND,
    steps: '1. Fill the root name.\n2. Add a Level 2 node named "QA Same Name".\n3. Add a second Level 2 node, also named "QA Same Name" (same parent — the root).\n4. Click Save.',
    testData: 'Root: unique name; two identically-named L2 siblings: "QA Same Name"',
    expected: 'Creating two sibling nodes with the exact same name under the same parent should be blocked with a validation error (or at least warned about), since the resulting tree is ambiguous — there is no way to tell the two apart when picking a disposition.',
    actualNote:
      'Live-verified: no such check exists. Save succeeds outright and both identically-named siblings are persisted and shown side by side in the tree with no distinguishing mark. The new row\'s Sub-dispositions count (2) confirms both were saved as separate nodes. Reproduced consistently, not flaky.',
    type: 'Negative',
    status: 'Fail',
  },

  // ---------------- Field behavior ----------------
  {
    scenario: 'Disposition node name is hard-capped at its 50-character limit',
    preconditions: ADD_PRECOND,
    steps: '1. Paste or type 60 characters into the root node name.\n2. Observe the field value and counter.',
    testData: '"A" repeated 60 times',
    expected: 'Only the first 50 characters are accepted (value is truncated); the counter reads "50/50".',
    type: 'Boundary',
    status: 'Pass',
  },

  // ---------------- Cancel / Reset ----------------
  {
    scenario: 'Cancel button discards the in-progress tree without saving',
    preconditions: ADD_PRECOND,
    steps: '1. Fill the root name.\n2. Add a Level 2 child node.\n3. Click Cancel (not Save).\n4. Search the Dispositions list for the name used.',
    testData: 'Root: unique name, e.g. "QA Cancel <unique>"; L2: "QA Child"',
    expected: 'Navigates back to the Dispositions list; the disposition was never created — searching for its name returns no results.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Reset button discards changes back to a single blank root node',
    preconditions: ADD_PRECOND,
    steps: '1. Fill the root name.\n2. Add a Level 2 child node.\n3. Click Reset.\n4. Confirm the "Discard changes?" dialog.',
    testData: 'Root: "QA WillBeReset"; L2: "QA Child"',
    expected: 'The confirmation dialog is shown; confirming clears the root name input back to empty and removes the added child node, returning the canvas to a single blank root.',
    type: 'Functional',
    status: 'Pass',
  },

  // ---------------- List / search / view / edit / delete ----------------
  {
    scenario: 'Search by disposition name filters the Dispositions list',
    preconditions: BASE_PRECOND + ' At least one disposition exists (create one if needed).',
    steps: '1. Create a disposition with a unique, identifiable root name.\n2. Go to the Dispositions list.\n3. Type the full name into "Search dispositions".\n4. Confirm the matching row is shown.\n5. Clean up by deleting the test disposition.',
    testData: 'Root: "QA Search <unique>"',
    expected: 'The Dispositions list filters down to show the matching disposition by name.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'View action shows a read-only tree that cannot be edited',
    preconditions: BASE_PRECOND + ' A disposition with at least one child node exists (create one if needed).',
    steps: '1. Locate the disposition in the list.\n2. Click the eye (View) icon in its Action column.\n3. Observe the "View Disposition" page.',
    testData: 'A saved disposition with root + 1 child ("QA Viewable Child")',
    expected: '"View Disposition" heading is shown; the root name input has the `readonly` attribute; the existing child node is visible in the tree; and no "Add Node" button is present (read-only, cannot be edited).',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Edit action opens the tree pre-filled and editable, and Save updates it',
    preconditions: BASE_PRECOND + ' A disposition with at least one child node exists (create one if needed).',
    steps:
      '1. Locate the disposition in the list.\n2. Click the pencil (Edit) icon in its Action column.\n' +
      '3. Confirm the tree is pre-filled with the existing name and child.\n4. Add a further child node.\n5. Click Save.',
    testData: 'Existing: root + "QA Original Child"; new addition: "QA New Grandchild" (under "QA Original Child")',
    expected: '"Edit Disposition" page opens with the root name and existing child pre-filled and editable; after adding a node and saving, "Disposition updated" toast is shown, the page returns to the list, and the Sub-dispositions count reflects the added node (2).',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Delete (list-level) removes the disposition after confirmation',
    preconditions: BASE_PRECOND + ' A disposition exists (create one if needed).',
    steps:
      '1. Locate the disposition in the list.\n2. Click the trash (Delete) icon in its Action column.\n' +
      '3. Confirm the "Are you sure you want to delete this disposition?" prompt by clicking Yes.',
    testData: 'An existing disposition',
    expected: '"Disposition removed" toast is shown; the row disappears from the list.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Deep link ----------------
  {
    scenario: 'Deep-linking straight to Add Disposition works correctly (unlike the equivalent CRM Forms page)',
    preconditions: 'Logged in as admin on AURIC. Reach the Add Disposition page via a direct URL load (bookmark, browser refresh, or shared link) rather than clicking "Add Disposition" from the list — i.e. load https://ccaas.azalio.io/client/campaign/dispositions/add directly.',
    steps: '1. Load /client/campaign/dispositions/add directly in the browser address bar.\n2. Fill the root name.\n3. Click Save.\n4. Observe which page you land on and whether the disposition appears in the list.',
    testData: 'Root: "QA DeepLink <unique>"',
    expected: 'After a successful Save, the "Disposition created" toast is shown, the page correctly returns to the Dispositions list, and the new disposition appears there by name — unlike the equivalent CRM Forms "Add Form" deep-link, which misroutes to the dashboard.',
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
  const ws = wb.addWorksheet('Dispositions');

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
  const outPath = path.join(outDir, 'DispositionsTestCases.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${ROWS.length} test cases)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
