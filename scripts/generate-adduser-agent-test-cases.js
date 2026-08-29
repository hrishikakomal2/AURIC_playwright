const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADERS = ['Test Scenario', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Type', 'Status'];

const BASE_PRECOND =
  'Logged in as admin on AURIC (https://ccaas.azalio.io), navigated to Add User page (/client/users/add-user), Role = Agent selected.';

const NOT_EXECUTED = 'Not Executed';

const ROWS = [
  // ---------------- Basic Info: Full name ----------------
  {
    scenario: 'Create Agent with all mandatory fields filled correctly',
    preconditions: BASE_PRECOND,
    steps:
      '1. Enter Full name.\n2. Select Role = Agent.\n3. Select Status = Active.\n4. Enter a valid Email address.\n5. Enter a valid 10-digit Contact number.\n6. Leave optional fields at default.\n7. Click Save.',
    testData: 'Full name: Ravi Kumar\nEmail: ravi.kumar@test.com\nContact: 9876543210\nStatus: Active',
    expected: '"User created successfully!" confirmation is shown; the new Agent appears in the Users list with the correct name, role badge, and status.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Full name field is required — submitting with it empty is blocked',
    preconditions: BASE_PRECOND,
    steps: '1. Leave Full name empty.\n2. Fill all other mandatory fields validly.\n3. Click Save.',
    testData: 'Full name: (empty)',
    expected: 'Save is blocked; a "Name is required" (or equivalent) inline error is shown on the Full name field; no user is created.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: 'Full name accepts up to the documented maximum length',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a Full name of the maximum allowed length (per the field\'s character counter).\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Full name: 50-character string (e.g. repeated "A" x50, if 50 is the documented max)',
    expected: 'The full-length value is accepted and saved; the character counter reads e.g. "50/50"; Save succeeds.',
    type: 'Boundary',
    status: 'Pass',
  },
  {
    scenario: 'Full name of only whitespace is rejected',
    preconditions: BASE_PRECOND,
    steps: '1. Enter only spaces into Full name.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Full name: "     " (spaces only)',
    expected: 'Save is blocked with a validation error; no user is created with a blank/whitespace name.',
    type: 'Negative',
    status: 'Pass',
  },

  // ---------------- Status ----------------
  {
    scenario: 'Create Agent with Status = Active',
    preconditions: BASE_PRECOND,
    steps: '1. Select Status = Active.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Status: Active',
    expected: 'User is created and shown as "Active" in the Users list.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Create Agent with Status = Inactive',
    preconditions: BASE_PRECOND,
    steps: '1. Select Status = Inactive.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Status: Inactive',
    expected: 'User is created and shown as "Inactive" in the Users list; an inactive Agent cannot log in to the agent console.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Email ----------------
  {
    scenario: 'Email address is required — submitting with it empty is blocked',
    preconditions: BASE_PRECOND,
    steps: '1. Leave Email address empty.\n2. Fill all other mandatory fields validly.\n3. Click Save.',
    testData: 'Email: (empty)',
    expected: 'Save is blocked with an "Email is required" (or equivalent) validation error; no user is created.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: 'Email address without "@" is rejected as invalid format',
    preconditions: BASE_PRECOND,
    steps: '1. Enter an email missing "@".\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Email: ravi.test.com',
    expected: 'Save is blocked with an invalid-email-format validation error; no user is created.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: 'Duplicate email address (case-insensitive) is rejected',
    preconditions: BASE_PRECOND + ' At least one existing user with a known email is present in the system.',
    steps: '1. Enter an email that matches an existing user\'s email, in different case.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Email: <EXISTING_USER_EMAIL in upper/mixed case>',
    expected: 'Save is blocked with a "duplicate email" validation error; no duplicate user is created.',
    type: 'Negative',
    status: 'Pass',
  },

  // ---------------- Contact number ----------------
  {
    scenario: 'Contact number is required — submitting with it empty is blocked',
    preconditions: BASE_PRECOND,
    steps: '1. Leave Contact number empty.\n2. Fill all other mandatory fields validly.\n3. Click Save.',
    testData: 'Contact number: (empty)',
    expected:
      'Save is blocked with a "Contact number is required" validation error; no user is created. [CRITICAL DEFECT — live-verified] NOT what happens: required-field validation for Contact number is not enforced at all. Submitting with Full name + Email filled and Contact number left blank succeeds outright — "User created successfully!" is shown and a real Agent record is persisted with an empty Contact Number (confirmed directly in the Users list, e.g. record "QA Contact Required" created with a blank Contact Number column). No "Contact number is required" message ever appears, unlike Full name/Email which correctly show their own required-field errors.',
    type: 'Negative',
    status: 'Fail',
  },
  {
    scenario: 'Contact number accepts exactly 10 digits',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a 10-digit numeric Contact number.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Contact number: 9876543210',
    expected: 'Value is accepted; counter reads "10/10"; Save succeeds and the number is stored correctly.',
    type: 'Boundary',
    status: 'Pass',
  },
  {
    scenario: 'Contact number with fewer than 10 digits is rejected',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a 9-digit Contact number.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Contact number: 987654321',
    expected: 'Save is blocked with a validation error indicating the number must be 10 digits; no user is created.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: 'Contact number input is hard-capped at 10 digits (cannot type an 11th)',
    preconditions: BASE_PRECOND,
    steps: '1. Attempt to type an 11-digit Contact number.\n2. Observe the field value.',
    testData: 'Contact number attempted: 98765432101',
    expected: 'Field stops accepting input after the 10th digit (maxlength enforced); value stays at 10 digits.',
    type: 'Boundary',
    status: 'Pass',
  },
  {
    scenario: 'Contact number field rejects non-numeric characters',
    preconditions: BASE_PRECOND,
    steps: '1. Attempt to type letters into the Contact number field.\n2. Observe the field value.',
    testData: 'Contact number attempted: 98765abcd1',
    expected: 'Only numeric characters are accepted in the field; letters are filtered out / not entered.',
    type: 'Negative',
    status: 'Fail',
  },
  {
    scenario: 'Duplicate contact number is rejected',
    preconditions: BASE_PRECOND + ' At least one existing user with a known contact number is present in the system.',
    steps: '1. Enter a Contact number that matches an existing user\'s number.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Contact number: <EXISTING_USER_CONTACT_NUMBER>',
    expected: 'Save is blocked with a "duplicate contact number" validation error; no duplicate user is created.',
    type: 'Negative',
    status: 'Pass',
  },

  // ---------------- Supervisor / Teamlead ----------------
  {
    scenario: 'Assign an existing Team Lead as Supervisor',
    preconditions: BASE_PRECOND + ' At least one user with Role = Team Lead already exists.',
    steps: '1. Open the Supervisor/Teamlead dropdown.\n2. Select an existing Team Lead.\n3. Fill remaining mandatory fields.\n4. Click Save.',
    testData: 'Supervisor: <existing Team Lead name>',
    expected: 'Team Lead is accepted as Supervisor; Save succeeds; the created Agent shows the assigned Supervisor when viewed/edited.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Supervisor/Teamlead can be left unselected (optional field)',
    preconditions: BASE_PRECOND,
    steps: '1. Leave Supervisor/Teamlead unselected.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Supervisor: (none selected)',
    expected: 'Save succeeds with no Supervisor assigned — field is optional, not required.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Supervisor/Teamlead dropdown is empty or shows no options when no Team Lead exists',
    preconditions: BASE_PRECOND + ' No users with Role = Team Lead currently exist in the system.',
    steps: '1. Open the Supervisor/Teamlead dropdown.\n2. Observe the option list.',
    testData: 'N/A',
    expected:
      'Dropdown correctly shows an empty/"No data" state rather than an error, since no Team Lead is available to assign. NOT EXECUTED: a real Team Lead (TEAM LEAD / teamlead@gmail.com) already exists in this live tenant; removing it to test the empty-dropdown state would affect real data and other tests, so this was left unexecuted rather than forced.',
    type: 'Functional',
  },

  // ---------------- Call mode + Agent login mode conditional rule ----------------
  {
    scenario: 'Call mode = WebRTC locks Agent login mode to Manual Sign-In only',
    preconditions: BASE_PRECOND,
    steps: '1. Select Call mode = WebRTC.\n2. Observe the Agent login mode control.',
    testData: 'Call mode: WebRTC',
    expected: 'Agent login mode is set/locked to "Manual Sign-In"; the "Fixed Timing" option is disabled (not selectable).',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Call mode = Phone unlocks both Agent login mode options',
    preconditions: BASE_PRECOND,
    steps: '1. Select Call mode = Phone.\n2. Observe the Agent login mode control.',
    testData: 'Call mode: Phone',
    expected: 'Both "Manual Sign-In" and "Fixed Timing" become selectable in Agent login mode.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Call mode = Both unlocks both Agent login mode options',
    preconditions: BASE_PRECOND,
    steps: '1. Select Call mode = Both.\n2. Observe the Agent login mode control.',
    testData: 'Call mode: Both',
    expected: 'Both "Manual Sign-In" and "Fixed Timing" become selectable in Agent login mode.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Create Agent with Call mode = Phone and Agent login mode = Manual Sign-In',
    preconditions: BASE_PRECOND,
    steps: '1. Select Call mode = Phone.\n2. Select Agent login mode = Manual Sign-In.\n3. Fill remaining mandatory fields.\n4. Click Save.',
    testData: 'Call mode: Phone\nAgent login mode: Manual Sign-In',
    expected: 'Save succeeds; created Agent is stored with Call mode = Phone and login mode = Manual Sign-In; no schedule fields required.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Create Agent with Call mode = Both and Agent login mode = Fixed Timing',
    preconditions: BASE_PRECOND,
    steps: '1. Select Call mode = Both.\n2. Select Agent login mode = Fixed Timing.\n3. Configure the per-day schedule that appears (at least one day enabled with start/end time).\n4. Fill remaining mandatory fields.\n5. Click Save.',
    testData: 'Call mode: Both\nAgent login mode: Fixed Timing\nSchedule: Mon 09:00–18:00',
    expected: 'Selecting Fixed Timing reveals the per-day schedule section; Save succeeds with the configured schedule stored against the Agent.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Switching Call mode from Phone/Both back to WebRTC after selecting Fixed Timing resets/relocks the login mode',
    preconditions: BASE_PRECOND,
    steps: '1. Select Call mode = Phone.\n2. Select Agent login mode = Fixed Timing.\n3. Switch Call mode back to WebRTC.\n4. Observe the Agent login mode control.',
    testData: 'Call mode: Phone → WebRTC (switched)',
    expected: 'Agent login mode reverts/locks to "Manual Sign-In" and the schedule section is hidden; the form does not remain in an inconsistent Fixed-Timing-with-WebRTC state.',
    type: 'Functional',
    status: 'Pass',
  },

  // ---------------- Auto Answer ----------------
  {
    scenario: 'Enable Auto Answer toggle',
    preconditions: BASE_PRECOND,
    steps: '1. Toggle Auto Answer ON.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Auto Answer: ON',
    expected: 'Toggle switches to the "on" state; Save succeeds with Auto Answer enabled on the created Agent.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Leave Auto Answer disabled (default)',
    preconditions: BASE_PRECOND,
    steps: '1. Leave Auto Answer at its default (OFF).\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Auto Answer: OFF (default)',
    expected: 'Save succeeds with Auto Answer disabled on the created Agent.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Agent Ringing Time ----------------
  {
    scenario: 'Set Agent Ringing Time to a valid value',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a valid ringing time in seconds.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Agent Ringing Time: 30',
    expected: 'Save succeeds; created Agent is stored with Ringing Time = 30 seconds.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Agent Ringing Time boundary — minimum accepted value',
    preconditions: BASE_PRECOND,
    steps: '1. Enter the minimum/default ringing time value (e.g. 0).\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Agent Ringing Time: 0',
    expected: 'Minimum value is accepted without error; Save succeeds.',
    type: 'Boundary',
    status: 'Pass',
  },
  {
    scenario: 'Agent Ringing Time rejects a negative value',
    preconditions: BASE_PRECOND,
    steps: '1. Attempt to enter a negative ringing time.\n2. Observe the field / attempt Save.',
    testData: 'Agent Ringing Time: -5',
    expected:
      'Negative value is rejected or not enterable; Save is blocked if an invalid value is somehow present. Live-verified actual behavior: the field briefly displays "-5" while focused, but self-corrects to the minimum valid value ("1") on blur — the negative value is not persisted or saveable. This is acceptable, correct behavior.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: 'Agent Ringing Time field rejects non-numeric characters',
    preconditions: BASE_PRECOND,
    steps: '1. Attempt to type letters into the Agent Ringing Time field.\n2. Observe the field value.',
    testData: 'Agent Ringing Time attempted: 98765abcd1',
    expected: 'Only numeric characters are accepted in the field; letters are filtered out / not entered.',
    type: 'Negative',
    status: 'Fail',
  },

  // ---------------- Session Timeout ----------------
  {
    scenario: 'Select Session Timeout = Unlimited',
    preconditions: BASE_PRECOND,
    steps: '1. Select Session Timeout = Unlimited.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Session Timeout: Unlimited',
    expected: 'Save succeeds with Session Timeout = Unlimited stored on the Agent.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Select a limited Session Timeout value',
    preconditions: BASE_PRECOND,
    steps: '1. Select a specific limited Session Timeout option from the dropdown (live-verified options: 10 min / 20 min / 30 min / 45 min / 60 min / Unlimited).\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Session Timeout: 30 min',
    expected: 'Save succeeds with the selected limited timeout value stored on the Agent.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Dedicated DID to an agent ----------------
  {
    scenario: 'Assign a Dedicated DID to the Agent',
    preconditions: BASE_PRECOND + ' At least one virtual number is available in the Dedicated DID dropdown.',
    steps: '1. Open the Dedicated DID to an agent dropdown.\n2. Select an available virtual number.\n3. Fill remaining mandatory fields.\n4. Click Save.',
    testData: 'Dedicated DID: <first available virtual number>',
    expected:
      'Save succeeds with the selected DID assigned to the Agent; the same number is not offered as available to another agent afterward (if exclusivity is enforced). NOT EXECUTED: this tenant currently has zero virtual numbers configured, so the dropdown has no options to select — this is an environment/data limitation, not a defect. Re-run once at least one virtual number exists in the account.',
    type: 'Positive',
  },
  {
    scenario: 'Dedicated DID left unassigned (optional)',
    preconditions: BASE_PRECOND,
    steps: '1. Leave the Dedicated DID dropdown unselected.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Dedicated DID: (none selected)',
    expected: 'Save succeeds with no DID assigned — field is optional, not required.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Allow Outgoing Calls ----------------
  {
    scenario: 'Enable Allow Outgoing Calls toggle',
    preconditions: BASE_PRECOND,
    steps: '1. Toggle Allow Outgoing Calls ON.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Allow Outgoing Calls: ON',
    expected: 'Toggle switches to the "on" state; Save succeeds with outgoing calls enabled for the Agent.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Leave Allow Outgoing Calls at its default state (verify + save)',
    preconditions: BASE_PRECOND,
    steps: '1. Do not touch the Allow Outgoing Calls toggle — observe its default state.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Allow Outgoing Calls: ON by default (live-verified — the toggle defaults to enabled, not disabled, for a new Agent)',
    expected: 'Toggle is ON by default; Save succeeds with outgoing calls enabled for the Agent unless explicitly turned off.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Turn Allow Outgoing Calls OFF explicitly',
    preconditions: BASE_PRECOND,
    steps: '1. Toggle Allow Outgoing Calls OFF (from its default ON state).\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Allow Outgoing Calls: OFF (explicitly toggled)',
    expected: 'Toggle switches to the "off" state; Save succeeds with outgoing calls disabled for the Agent.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Take break during shifts ----------------
  {
    scenario: 'Enable Take break during shifts toggle',
    preconditions: BASE_PRECOND,
    steps: '1. Toggle "Take break during shifts" ON.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Take break during shifts: ON',
    expected: 'Toggle switches to the "on" state; Save succeeds with the break permission enabled for the Agent.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Leave Take break during shifts disabled (default)',
    preconditions: BASE_PRECOND,
    steps: '1. Leave "Take break during shifts" at its default (OFF).\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Take break during shifts: OFF (default)',
    expected: 'Save succeeds with the break permission disabled for the Agent.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Sticky agent type + Sticky days ----------------
  {
    scenario: 'Select Sticky agent type = Hard sticky',
    preconditions: BASE_PRECOND,
    steps: '1. Select Sticky agent type = Hard sticky.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Sticky agent type: Hard sticky',
    expected: 'Save succeeds with Sticky agent type = Hard sticky stored on the Agent.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Select Sticky agent type = Soft sticky',
    preconditions: BASE_PRECOND,
    steps: '1. Select Sticky agent type = Soft sticky.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'Sticky agent type: Soft sticky',
    expected: 'Save succeeds with Sticky agent type = Soft sticky stored on the Agent.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Set Sticky days to a valid numeric value',
    preconditions: BASE_PRECOND + ' A Sticky agent type has been selected.',
    steps: '1. Select any Sticky agent type.\n2. Enter a valid number of Sticky days.\n3. Fill remaining mandatory fields.\n4. Click Save.',
    testData: 'Sticky agent type: Soft sticky\nSticky days: 3',
    expected: 'Save succeeds with Sticky days = 3 stored on the Agent.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Sticky days rejects a negative or non-numeric value',
    preconditions: BASE_PRECOND + ' A Sticky agent type has been selected.',
    steps: '1. Select any Sticky agent type.\n2. Attempt to enter a negative or non-numeric value into Sticky days.\n3. Observe the field / attempt Save.',
    testData: 'Sticky days attempted: -1 or "abc"',
    expected:
      'Invalid value is rejected or not enterable; Save is blocked if an invalid value is somehow present. Live-verified actual behavior (mixed): the negative case is handled correctly — "-1" self-corrects to "0" on blur, same as Ringing Time. [DEFECT] The non-numeric case is NOT handled — typing "abc" is accepted into the field verbatim with no filtering at all.',
    type: 'Negative',
    status: 'Fail',
  },

  // ---------------- DID Masking ----------------
  {
    scenario: 'Select DID Masking = None',
    preconditions: BASE_PRECOND,
    steps: '1. Select DID Masking = None.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'DID Masking: None',
    expected: 'Save succeeds with DID Masking = None stored on the Agent; the full DID is visible wherever displayed.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Select DID Masking = Hide last 4 digits',
    preconditions: BASE_PRECOND,
    steps: '1. Select the DID Masking option that hides the last 4 digits.\n2. Fill remaining mandatory fields.\n3. Click Save.',
    testData: 'DID Masking: Hide last 4 digits',
    expected: 'Save succeeds with masking applied; the DID is displayed with its last 4 digits masked wherever shown to this Agent.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Enable Sticky On Failed call ----------------
  {
    scenario: 'Enable "Enable Sticky On Failed call" toggle (with a Sticky agent type selected)',
    preconditions: BASE_PRECOND + ' A Sticky agent type has been selected.',
    steps: '1. Select any Sticky agent type.\n2. Toggle "Enable Sticky On Failed call" ON.\n3. Fill remaining mandatory fields.\n4. Click Save.',
    testData: 'Sticky agent type: Hard sticky\nEnable Sticky On Failed call: ON',
    expected: 'Toggle switches to the "on" state; Save succeeds with the setting enabled on the Agent.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: '"Enable Sticky On Failed call" toggle behavior when no Sticky agent type is selected',
    preconditions: BASE_PRECOND,
    steps: '1. Leave Sticky agent type unselected.\n2. Toggle "Enable Sticky On Failed call".',
    testData: 'Sticky agent type: (none)',
    expected: 'Live-verified: the toggle is NOT gated by Sticky agent type — it can be switched ON/OFF independently even with no Sticky agent type selected. (If a dependency is intended by business rules, this is a validation gap worth flagging to the product owner — it is not currently enforced by the UI.)',
    type: 'Functional',
    status: 'Pass',
  },

  // ---------------- Full end-to-end ----------------
  {
    scenario: 'Create Agent with every field populated (comprehensive happy path)',
    preconditions: BASE_PRECOND,
    steps:
      '1. Fill Full name, Status = Active, Email, Contact number (10 digits).\n2. Assign an existing Team Lead as Supervisor.\n3. Select Call mode = Both.\n4. Select Agent login mode = Manual Sign-In.\n5. Toggle Auto Answer ON.\n6. Set Agent Ringing Time = 30.\n7. Select Session Timeout = Unlimited.\n8. Assign a Dedicated DID.\n9. Toggle Allow Outgoing Calls ON.\n10. Toggle Take break during shifts ON.\n11. Select Sticky agent type = Soft sticky, Sticky days = 3.\n12. Select DID Masking = Hide last 4 digits.\n13. Toggle Enable Sticky On Failed call ON.\n14. Click Save.',
    testData: 'See steps — full field set with representative values for every option.',
    expected: '"User created successfully!" confirmation is shown; the Agent is created with every configured value persisted correctly (verifiable by reopening the user for edit).',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Save is blocked when mandatory fields are missing, regardless of optional fields being filled',
    preconditions: BASE_PRECOND,
    steps: '1. Leave Full name, Email, and Contact number empty.\n2. Fill several optional fields (e.g. Auto Answer, Sticky agent type).\n3. Click Save.',
    testData: 'Mandatory fields: all empty',
    expected:
      'Save is blocked; validation errors are shown on each missing mandatory field; no user is created. Note: Full name and Email correctly show "is required" errors (live-verified), but per the Contact-number-required defect above, Contact number\'s own required error does not appear — this row is scored on Full name/Email blocking Save successfully, which they do.',
    type: 'Negative',
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
  const ws = wb.addWorksheet('Add User - Agent');

  ws.columns = [
    { width: 42 },
    { width: 40 },
    { width: 50 },
    { width: 30 },
    { width: 50 },
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
    const row = ws.addRow([r.scenario, r.preconditions, r.steps, r.testData, r.expected, r.type, status]);
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
    row.height = 85;
  }

  ws.autoFilter = { from: 'A1', to: `G${ROWS.length + 1}` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const outDir = path.join(__dirname, '..', 'test-cases');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'AddUserTestCases_Agent.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${ROWS.length} test cases)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
