const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADERS = ['Test Scenario', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Type', 'Status'];

const BASE_PRECOND =
  'Logged in as admin on AURIC (https://ccaas.azalio.io), navigated to IVR Management > Queue > Create Queue (/client/queue/add-queue).';

const NOT_EXECUTED = 'Not Executed';

const ROWS = [
  // ---------------- Queue name ----------------
  {
    scenario: 'Create a queue with all mandatory fields filled correctly',
    preconditions: BASE_PRECOND + ' At least one agent exists to assign.',
    steps: '1. Enter Queue name.\n2. Select at least one agent.\n3. Leave Incoming algorithm at default.\n4. Leave Call Handling = Route Call, After Attempts Route To = Voicemail.\n5. Click Save.',
    testData: 'Queue name: QA Test Queue\nAgents: any 1 existing agent',
    expected: 'Queue is created successfully; a "Queue added successfully" toast is shown, and the browser redirects to the Queue list; the new queue appears with the correct name, assigned agent (View link), and algorithm.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Queue name field is required — submitting with it empty is blocked',
    preconditions: BASE_PRECOND,
    steps: '1. Leave Queue name empty.\n2. Select an agent.\n3. Click Save.',
    testData: 'Queue name: (empty)',
    expected: 'Save is blocked; the Queue name field gets a red border with an inline "Name is required" message beneath it; no queue is created.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: 'Queue name accepts up to the documented maximum length',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a Queue name of the maximum allowed length (per the character counter).\n2. Select an agent.\n3. Click Save.',
    testData: 'Queue name: 50-character string',
    expected: 'Input is hard-capped at 50 characters (maxlength="50", extra characters are not accepted); character counter reads "50/50"; Save succeeds.',
    type: 'Boundary',
    status: 'Pass',
  },
  {
    scenario: 'Duplicate queue name is rejected [DEFECT]',
    preconditions: BASE_PRECOND + ' At least one existing queue (e.g. "max q") is present.',
    steps: '1. Enter a Queue name matching an existing queue exactly.\n2. Select an agent.\n3. Click Save.',
    testData: 'Queue name: max q (existing)',
    expected:
      'Save should be blocked with a "duplicate queue name" validation error; no duplicate queue should be created. Live-verified actual behavior: Save succeeds with NO warning at all — a second queue named "max q" is created, and the Queue list now shows two separate rows both named "max q" with no way to distinguish them by name.',
    type: 'Negative',
    status: 'Fail',
  },

  // ---------------- Select agents ----------------
  {
    scenario: 'Select agents field is required — submitting with no agents selected is blocked',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a valid Queue name.\n2. Leave Select agents empty.\n3. Click Save.',
    testData: 'Select agents: (none selected)',
    expected: 'Save is blocked; a "Select at least one agent" toast notification is shown; no queue is created.',
    type: 'Negative',
    status: 'Pass',
  },
  {
    scenario: 'Multiple agents can be assigned to a queue',
    preconditions: BASE_PRECOND + ' At least 2 agents exist.',
    steps: '1. Enter a valid Queue name.\n2. Select 2 or more agents.\n3. Click Save.',
    testData: 'Agents: 2+ existing agents',
    expected: 'Save succeeds; the created queue shows all selected agents under "Assigned Agents" (View link) in the Queue list; clicking View opens an "Edit Assigned Agents" page listing every assigned agent.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Incoming algorithm ----------------
  {
    scenario: 'Incoming algorithm dropdown offers all documented options',
    preconditions: BASE_PRECOND,
    steps: '1. Open the Incoming algorithm dropdown.\n2. Observe the option list.',
    testData: 'N/A',
    expected: 'Dropdown lists: Even Call Distribution (default), Random, Serial Hunting, Parallel Ringing, Round Robin. Note: the list is virtualized and only shows ~2 options at a time without scrolling/typing — use the search box or scroll to see all 5; all 5 are confirmed present.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Create a queue with Incoming algorithm = Round Robin',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a valid Queue name and agent.\n2. Select Incoming algorithm = Round Robin.\n3. Click Save.',
    testData: 'Incoming algorithm: Round Robin',
    expected: 'Save succeeds; queue is created with Round Robin shown as its Algorithm in the Queue list.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Create a queue with Incoming algorithm = Serial Hunting',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a valid Queue name and agent.\n2. Select Incoming algorithm = Serial Hunting.\n3. Click Save.',
    testData: 'Incoming algorithm: Serial Hunting',
    expected: 'Save succeeds; queue is created with Serial Hunting shown as its Algorithm in the Queue list.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Call Handling = Route Call ----------------
  {
    scenario: 'Call Handling defaults to "Route Call" with Agents attempt = 1 and After Attempts Route To = Voicemail',
    preconditions: BASE_PRECOND,
    steps: '1. Open Create Queue form.\n2. Observe the Call Handling section defaults.',
    testData: 'N/A',
    expected: '"Route Call" is selected by default (highlighted); Agents attempt defaults to 1; After Attempts, Route To defaults to Voicemail.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Create a queue with Call Handling = Route Call and a custom Agents attempt value',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a valid Queue name and agent.\n2. Keep Call Handling = Route Call.\n3. Change Agents attempt to a higher value.\n4. Click Save.',
    testData: 'Agents attempt: 3',
    expected: 'Save succeeds; the queue is created with Agents attempt = 3 and Route Call handling stored (verified by reopening the queue for edit — Agents attempt shows 3).',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: '"After Attempts, Route To" is required for Route Call handling',
    preconditions: BASE_PRECOND,
    steps: '1. Enter a valid Queue name and agent.\n2. Keep Call Handling = Route Call.\n3. Clear After Attempts, Route To using its "x" clear button.\n4. Click Save.',
    testData: 'After Attempts, Route To: (cleared)',
    expected: 'The field can be momentarily cleared via its "x" button, but Save is blocked with an inline "Route To is required" error beneath the field; no queue is created with this field unset.',
    type: 'Negative',
    status: 'Pass',
  },

  // ---------------- Call Handling = Caller in queue ----------------
  {
    scenario: 'Switching Call Handling to "Caller in queue" reveals the Caller-in-queue section and hides Route Call fields',
    preconditions: BASE_PRECOND,
    steps: '1. Click "Caller in queue" under Call Handling.\n2. Observe the form.',
    testData: 'Call Handling: Caller in queue',
    expected: 'The "Route call" card (Agents attempt / After Attempts Route To) is replaced by the "Caller in queue" card (Queue-Based Custom Music, Select Media, Announcements During queue wait, Select announcement, Enable Callback Request, Enable Voicebot).',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: '"Select Media" and "Select announcement" are shown as required (*) for Caller-in-queue handling',
    preconditions: BASE_PRECOND,
    steps: '1. Click "Caller in queue" under Call Handling.\n2. Observe the Select Media and Select announcement fields.',
    testData: 'N/A',
    expected: 'Both "Select Media" and "Select announcement" are marked with a required asterisk (*).',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Toggling "Queue-Based Custom Music" ON enables the Select Media dropdown',
    preconditions: BASE_PRECOND,
    steps: '1. Click "Caller in queue".\n2. Toggle "Queue-Based Custom Music" ON.\n3. Observe the Select Media dropdown.',
    testData: 'Queue-Based Custom Music: ON',
    expected: 'Toggle switches to the "on" state; the Select Media dropdown becomes enabled/interactive (it is disabled while the toggle is off).',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Toggling "Announcements During queue wait" ON enables the Select announcement dropdown',
    preconditions: BASE_PRECOND,
    steps: '1. Click "Caller in queue".\n2. Toggle "Announcements During queue wait" ON.\n3. Observe the Select announcement dropdown.',
    testData: 'Announcements During queue wait: ON',
    expected: 'Toggle switches to the "on" state; the Select announcement dropdown becomes enabled/interactive (it is disabled while the toggle is off).',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Create a queue with Call Handling = Caller in queue, Custom Music and Announcement configured',
    preconditions: BASE_PRECOND + ' At least one media file and one announcement are available to select.',
    steps: '1. Enter a valid Queue name and agent.\n2. Select "Caller in queue".\n3. Toggle Queue-Based Custom Music ON and select a media file.\n4. Toggle Announcements During queue wait ON and select an announcement.\n5. Click Save.',
    testData: 'Call Handling: Caller in queue\nMedia: any available file\nAnnouncement: any available option',
    expected: 'Save succeeds; queue is created with the caller-in-queue configuration (custom music + announcement) persisted.',
    type: 'Positive',
    status: 'Pass',
  },

  // ---------------- Enable Callback Request (depends on Announcements During queue wait) ----------------
  {
    scenario: '"Enable Callback Request" only becomes enabled after "Announcements During queue wait" is toggled ON',
    preconditions: BASE_PRECOND,
    steps: '1. Click "Caller in queue".\n2. With "Announcements During queue wait" OFF, observe the "Enable Callback Request" toggle.\n3. Toggle "Announcements During queue wait" ON.\n4. Observe the "Enable Callback Request" toggle again.',
    testData: 'Announcements During queue wait: OFF, then ON',
    expected:
      '"Enable Callback Request" is disabled while "Announcements During queue wait" is OFF. Once "Announcements During queue wait" is toggled ON, "Enable Callback Request" becomes enabled and interactive.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Enabling Callback Request (after Announcements During queue wait is ON) enables its dependent fields',
    preconditions: BASE_PRECOND + ' "Announcements During queue wait" must be toggled ON first.',
    steps: '1. Click "Caller in queue".\n2. Toggle "Announcements During queue wait" ON.\n3. Click the "Enable Callback Request" toggle.\n4. Observe the toggle state and the "Callback Input Timeout (Seconds)" / "Callback Disconnect media" fields.',
    testData: 'Announcements During queue wait: ON → Enable Callback Request: click once',
    expected:
      'Toggle switches to the "on" state; "Callback Input Timeout (Seconds)" and "Callback Disconnect media" become enabled and interactive.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Create a queue with Enable Callback Request configured',
    preconditions: BASE_PRECOND + ' At least one announcement is available to select.',
    steps: '1. Enter a valid Queue name and agent.\n2. Click "Caller in queue".\n3. Click "Announcements During queue wait" toggle, then Select announcement.\n4. Enable toggle of "Enable Callback Request".\n5. Give Callback Input Timeout (Seconds).\n6. Select Callback Disconnect media.\n7. Click Save.',
    testData: 'Announcements During queue wait: ON\nCallback Input Timeout: 10 seconds\nCallback Disconnect media: any available option',
    expected: 'Save succeeds with callback-request settings persisted on the queue.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: 'Callback Input Timeout is capped at the documented maximum of 60 seconds',
    preconditions: BASE_PRECOND + ' "Announcements During queue wait" and "Enable Callback Request" must be toggled ON first.',
    steps: '1. Toggle Announcements During queue wait ON.\n2. Toggle Enable Callback Request ON.\n3. Attempt to enter a value greater than 60 in Callback Input Timeout.',
    testData: 'Callback Input Timeout attempted: 90',
    expected: 'Value is capped/rejected at 60 (per the "Max seconds is 60" hint text) — entering 90 and blurring the field results in the value snapping to 60.',
    type: 'Boundary',
    status: 'Pass',
  },

  // ---------------- Enable Voicebot (depends on Announcements During queue wait) ----------------
  {
    scenario: '"Enable Voicebot" only becomes enabled after "Announcements During queue wait" is toggled ON',
    preconditions: BASE_PRECOND,
    steps: '1. Click "Caller in queue".\n2. With "Announcements During queue wait" OFF, observe the "Enable Voicebot" toggle.\n3. Toggle "Announcements During queue wait" ON.\n4. Observe the "Enable Voicebot" toggle again.',
    testData: 'Announcements During queue wait: OFF, then ON',
    expected:
      '"Enable Voicebot" is disabled while "Announcements During queue wait" is OFF. Once "Announcements During queue wait" is toggled ON, "Enable Voicebot" becomes enabled and interactive.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Enabling Voicebot (after Announcements During queue wait is ON) enables its dependent fields',
    preconditions: BASE_PRECOND + ' "Announcements During queue wait" must be toggled ON first.',
    steps: '1. Click "Caller in queue".\n2. Toggle "Announcements During queue wait" ON.\n3. Click the "Enable Voicebot" toggle.\n4. Observe the toggle state and the Select voicebot / Max queue wait threshold / Max queue size threshold / Voicebot fallback / Redirect To fields.',
    testData: 'Announcements During queue wait: ON → Enable Voicebot: click once',
    expected:
      'Toggle switches to the "on" state; the voicebot-related fields (Select voicebot, Max queue wait threshold, Max queue size threshold, Voicebot fallback, Redirect To) become enabled and interactive.',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Create a queue with Enable Voicebot configured [BLOCKED — missing test data]',
    preconditions:
      BASE_PRECOND + ' At least one announcement AND at least one voicebot agent are available to select.',
    steps: '1. Enter a valid Queue name and agent.\n2. Click "Caller in queue".\n3. Click "Announcements During queue wait" toggle, then Select announcement.\n4. Enable toggle of "Enable Voicebot".\n5. Select a voicebot agent, set thresholds, and enter a fallback message.\n6. Click Save.',
    testData: 'Announcements During queue wait: ON\nVoicebot fallback message: "Sorry, please hold for an agent."',
    expected:
      'Save succeeds with voicebot settings persisted on the queue. Live-verified: the "Select voicebot" dropdown has ZERO options in this AURIC account (no voicebot agent is configured), so Save correctly gets blocked with an inline "Voicebot agent is required" error — this is expected required-field behavior, not a defect, but the full positive flow cannot be executed until a voicebot agent exists in this environment.',
    type: 'Positive',
  },
  {
    scenario: 'Voicebot fallback message field enforces its documented 500-character limit',
    preconditions: BASE_PRECOND + ' "Announcements During queue wait" and "Enable Voicebot" must be toggled ON first.',
    steps: '1. Toggle Announcements During queue wait ON.\n2. Toggle Enable Voicebot ON.\n3. Attempt to type more than 500 characters into the Voicebot fallback message field.',
    testData: 'Voicebot fallback message attempted: 600-character string',
    expected: 'Input is hard-capped at 500 characters (typing 600 characters results in only 500 being accepted); counter reads "500/500".',
    status: 'Pass',
    type: 'Boundary',
  },

  // ---------------- Set working hour ----------------
  {
    scenario: '"Set working hour" toggle responds to a click and reveals the per-day schedule',
    preconditions: BASE_PRECOND,
    steps: '1. Toggle "Set working hour" ON.\n2. Observe the revealed section.',
    testData: 'Set working hour: ON',
    expected: 'Toggle switches to the "on" state; a per-day (MON–SUN) availability schedule appears (enable toggle + start time + end time + computed duration per day, "Copy all" button), plus "Select music to be played during non-working days & hours" and "After-Hours Call Routing".',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: 'Create a queue with a working-hour schedule configured for at least one day',
    preconditions: BASE_PRECOND + ' At least one media file is available to select for non-working days & hours.',
    steps: '1. Enter a valid Queue name and agent.\n2. Toggle Set working hour ON.\n3. Enable at least one day (e.g. MON) and set a start/end time.\n4. Select an option in "Select music to be played during non-working days & hours" (required).\n5. Click Save.',
    testData: 'Working hour: MON 9:00 AM – 5:00 PM\nNon-working days & hours music: any available option',
    expected:
      'Save succeeds; the queue is created with the configured working-hour schedule persisted (verifiable by reopening the queue for edit). Note: "Select music to be played during non-working days & hours" is a required field when Set working hour is ON — omitting it blocks Save with a "Please select media to be played during non working days and hours" inline error, even though it has no visible asterisk.',
    type: 'Positive',
    status: 'Pass',
  },
  {
    scenario: '"Copy all" propagates one day\'s schedule to all other days',
    preconditions: BASE_PRECOND,
    steps: '1. Toggle Set working hour ON.\n2. Enable MON and set its start/end time.\n3. Click "Copy all".\n4. Observe TUES–SUN.',
    testData: 'MON: 10:00 AM – 6:00 PM (enabled), then Copy all',
    expected: 'All other days (TUES–SUN) are updated to match MON\'s enabled state, start/end time, and computed duration (e.g. "8h 0m").',
    type: 'Functional',
    status: 'Pass',
  },
  {
    scenario: '"After-Hours Call Routing" toggle can be enabled and configured',
    preconditions: BASE_PRECOND,
    steps: '1. Toggle Set working hour ON.\n2. Toggle "After-Hours Call Routing" ON.\n3. Observe the revealed routing configuration.',
    testData: 'After-Hours Call Routing: ON',
    expected: 'Toggle switches to the "on" state; a required "Select route *" dropdown is revealed, defaulting to "Voicemail", for routing calls received after configured working hours.',
    type: 'Functional',
    status: 'Pass',
  },

  // ---------------- Overall validation / feedback ----------------
  {
    scenario: 'Submitting the Create Queue form completely empty gives no visible error feedback [DEFECT]',
    preconditions: BASE_PRECOND,
    steps: '1. Leave every field at its default/empty state (do not fill Queue name or Select agents).\n2. Click Save.\n3. Observe the page for any validation message, red border, or toast.',
    testData: 'All fields: default/empty',
    expected:
      'Save is blocked and a clear validation error is shown (e.g. "Queue name is required", "Select agents is required") so the user understands why nothing happened. Live-verified actual behavior: Save IS correctly blocked (no queue is created — list count does not increase), but there is NO visible error text, red border, or toast anywhere on the page — the user gets zero feedback that anything went wrong, indistinguishable from a silent failure.',
    type: 'Negative',
    status: 'Fail',
  },
  {
    scenario: 'Cancel button discards the in-progress queue form without creating anything',
    preconditions: BASE_PRECOND,
    steps: '1. Fill in a Queue name and other fields.\n2. Click Cancel.',
    testData: 'Queue name: "Discard Me"',
    expected: 'Navigates back to the Queue list (/client/queue/list-queue) without creating any new queue; "Discard Me" does not appear in the list.',
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
  const ws = wb.addWorksheet('Queue Creation');

  ws.columns = [
    { width: 42 },
    { width: 40 },
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
  const outPath = path.join(outDir, 'QueueCreationTestCases.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${ROWS.length} test cases)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
