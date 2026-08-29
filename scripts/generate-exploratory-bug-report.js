const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Bugs found via manual exploratory testing in Chrome (live AURIC session), not via the
// Playwright suite — kept as a separate file from the per-feature test-case workbooks.

const HEADERS = ['Bug ID', 'Title', 'Module / Page', 'Severity', 'Steps to Reproduce', 'Expected Result', 'Actual Result', 'Status'];

const BASE = 'Logged in as admin on AURIC (https://ccaas.azalio.io).';
const BASE_ADMIN =
  'Logged in to the separate AURIC Admin Portal (https://ccaas.azalio.io, id "admin") — a distinct, platform-level login from the Client-role account used for BUG-01 through BUG-11, landing on /admin/dashboard with its own sidebar (Dashboard, User Management, DID Management, Agents, OPS).';

const BUGS = [
  {
    id: 'BUG-01',
    title: 'Validation toast renders on top of the header, obscuring wallet/notifications/account menu',
    module: 'IVR Management > Add IVR Flow; Campaign Management > Add Survey IVR (shared flow-builder component)',
    severity: 'Medium',
    steps:
      `${BASE}\n` +
      '1. Go to Campaign Management > IVR Management > Call Flow, click "Add IVR Flow".\n' +
      '2. Leave "Call Flow Name" empty.\n' +
      '3. Click "Save Flow".\n' +
      '4. Observe where the validation message appears.\n' +
      '5. Repeat steps 1-4 on Campaign Management > Survey > "Add Survey IVR" ("Flow Name" field, same "Save Flow" button).',
    expected:
      'The validation toast ("Please enter call flow name" / "Please enter a flow name") should appear in a clear space below the header, like every other toast/notification in the app (e.g. "Disposition created", "Campaign created").',
    actual:
      'The toast renders directly on top of the header bar, overlapping and obscuring the Wallet balance, Notification bell, and Account name/menu — both fields (balance amount, account name) become partly unreadable while the toast is visible. Reproduced on the IVR Call Flow builder, the Survey IVR builder (shared component), and Availability > Holidays\' "Select date" field (see BUG-05) — a global toast-positioning issue, not isolated to one page. Reproduced consistently on both a single click and repeated clicks (which stack multiple overlapping toasts). Confirmed NOT present on other pages (e.g. "Add Script"), where the equivalent validation renders correctly as an inline red message under the field instead of a toast.',
    status: 'Open',
  },
  {
    id: 'BUG-02',
    title: 'Sidebar retains stale "active" highlighting from a previously visited section after navigating elsewhere',
    module: 'Global sidebar navigation',
    severity: 'Low',
    steps:
      `${BASE}\n` +
      '1. Navigate to IVR Management > Call Flow (its sidebar section expands, "Call Flow" is highlighted).\n' +
      '2. Navigate to Call Management > Callback Request via the sidebar.\n' +
      '3. Observe the sidebar state.',
    expected:
      'Only the section and item matching the currently open page should be expanded/highlighted (here: "Call Management" expanded with "Callback Request" highlighted); previously visited sections should collapse or at least lose their highlighted state.',
    actual:
      'Both sections remain expanded and highlighted at once: "Call Management > Callback Request" (correct, matches the current page) AND "IVR Management > Call Flow" (stale — left over from the earlier visit, unrelated to the current page). Reproduced consistently when switching between top-level sidebar sections.',
    status: 'Open',
  },
  {
    id: 'BUG-03',
    title: 'Duplicate, inconsistently-formatted character counter on the "Report Name" field',
    module: 'Reports > Custom Reports > Add Report',
    severity: 'Low',
    steps:
      `${BASE}\n` +
      '1. Go to Reports > Custom Reports, click "Add Report".\n' +
      '2. Look at the "Report Name" field and its surrounding area.',
    expected: 'A single character counter for the 50-character limit, shown once, consistently formatted (e.g. "0/50").',
    actual: 'The counter is shown twice: once next to the "Report Name" label at the top ("0/50", no spaces) and again inside/below the input field itself ("0 / 50", with spaces around the slash) — duplicated and inconsistently formatted between the two instances.',
    status: 'Open',
  },
  {
    id: 'BUG-04',
    title: '"Call Waiting Type" column on the Queue list shows raw internal values instead of human-readable labels',
    module: 'IVR Management > Queue',
    severity: 'Low',
    steps:
      `${BASE}\n` +
      '1. Go to IVR Management > Queue.\n' +
      '2. Look at the "Call Waiting Type" column across the listed queues.',
    expected: 'A human-readable label describing the call-waiting behavior (e.g. "Retry", "Wait Time"), consistent with how the rest of the table (e.g. "Algorithm": "Even Call Distribution") is displayed.',
    actual: 'The column displays raw internal/technical values verbatim — "queue_retry", "wait_time" — instead of a formatted label. Reproduced across every row in the list, not a one-off.',
    status: 'Open',
  },
  {
    id: 'BUG-05',
    title: 'Inconsistent validation feedback within the same form — one required field uses a toast, the others use inline errors',
    module: 'Availability > Holidays',
    severity: 'Low',
    steps:
      `${BASE}\n` +
      '1. Go to Availability > Holidays.\n' +
      '2. Leave "Holiday name *", "Select date *" and "Select Media *" all empty.\n' +
      '3. Click "Save".\n' +
      '4. Observe how each of the three required fields reports its validation error.',
    expected: 'All required fields on the same form should report validation errors the same way (e.g. all inline, under the field) for a consistent experience.',
    actual: '"Holiday name" and "Select Media" show a clean inline red error message directly under the field ("Required" / "Please select a media file"). "Select date" instead shows its error ("Please select a date") as a toast notification — which also reproduces BUG-01\'s header-overlap issue. The same form uses two different validation UI patterns for equally-required fields.',
    status: 'Open',
  },
  {
    id: 'BUG-06',
    title: 'Typo and bad punctuation in the API KEY field placeholder text: "Genrate" instead of "Generate", and "API\'s" used as a plural',
    module: 'Integration > API Integration',
    severity: 'Low',
    steps:
      `${BASE}\n` +
      '1. Go to Integration > API Integration.\n' +
      '2. Look at the placeholder text inside the "API KEY" input field.',
    expected: 'Placeholder text reads "Generate API Key to use the APIs" (or similar) — correctly spelled, and using a plain plural rather than a possessive apostrophe.',
    actual: 'Placeholder text reads "Genrate API Key to use the API\'s" — "Genrate" is misspelled, and "API\'s" incorrectly uses an apostrophe for a plural (a "greengrocer\'s apostrophe" — the same mistake recurs verbatim in BUG-07\'s "Webhook API\'s" heading on Custom Callback API).',
    status: 'Open',
  },
  {
    id: 'BUG-07',
    title: 'Inconsistent capitalization of product/brand terms across the app: "WhatsApp" vs "Whatsapp", "API" vs "Api", "Days" vs "days"',
    module: 'Campaign Management > Create Campaign; Integration > CRM Configuration & Custom Callback API; Availability > Closed Days',
    severity: 'Low',
    steps:
      `${BASE}\n` +
      '1. Go to Campaign Management > Campaign > Create Campaign. Compare the "Whatsapp Configuration" section heading to the sidebar\'s own "WhatsApp" nav item and to Integration > End Call Notification\'s "WhatsApp Template" label.\n' +
      '2. Go to Integration > CRM (CRM Configuration) and Integration > CRM > Custom Callback API. Compare the "Generate Api Key" button text to the "API KEY" label directly above it.\n' +
      '3. Go to Availability > Closed Days. Compare the page heading "Closed days Settings" to the sibling page Availability > Working hours\' heading "Working Hours Settings".',
    expected: 'The same product/brand term is capitalized the same way everywhere it appears: "WhatsApp" (capital A), "API" (all caps), "Closed Days Settings" (title case, matching "Working Hours Settings").',
    actual: 'Each term has at least one inconsistent variant, reproduced live: "Whatsapp Configuration" (Create Campaign) vs "WhatsApp" everywhere else; "Generate Api Key" (CRM Configuration and Custom Callback API, both) sitting directly under an "API KEY" label that gets it right; "Closed days Settings" vs the sibling "Working Hours Settings" heading — the two pages share a design template but disagree on this word\'s casing.',
    status: 'Open',
  },
  {
    id: 'BUG-08',
    title: 'Minor grammar inconsistencies: singular/plural mismatches and inconsistent terminology',
    module: 'Dashboard (Live Performance); IVR Management > Queue > Create Queue; Users > Add User',
    severity: 'Low',
    steps:
      `${BASE}\n` +
      '1. Go to the Dashboard. Look at the "CALL TRAFFIC — LAST 1 HOURS" section heading and its "Last 1 hours" dropdown.\n' +
      '2. Go to IVR Management > Queue, click "Create new queue". Look at the "Set working hour" section heading near the bottom.\n' +
      '3. Go to Users, click "Add User". Compare its "Supervisor / Teamlead" field label to the "Team Lead" role badge shown elsewhere on the Users list.',
    expected: '"Last 1 hour" (singular, matching the "1"); "Set working hours" (plural, matching the sibling Availability > Working hours page\'s own naming); consistent terminology — either "Team Lead" or "Teamlead" everywhere, not both.',
    actual: '"LAST 1 HOURS" / "Last 1 hours" incorrectly pluralizes "hour" after "1". "Set working hour" is missing its plural "s" (the equivalent standalone settings page is titled "Working Hours Settings"). Add User\'s field is labelled "Supervisor / Teamlead" (one word) while the Users list displays the same role as "Team Lead" (two words) in its role badge.',
    status: 'Open',
  },
  {
    id: 'BUG-09',
    title: '"Password" field on Add SMS Configuration is a plain text input — typed credentials are shown unmasked',
    module: 'SMS > Configuration > Add Configuration',
    severity: 'Medium',
    steps:
      `${BASE}\n` +
      '1. Go to SMS > Configuration, click "Add Configuration".\n' +
      '2. Click into the "Password" field and type any value (e.g. a test SMS gateway password).\n' +
      '3. Observe how the typed value is displayed.',
    expected: 'Like the login page\'s own Password field (which masks input and offers a show/hide eye-icon toggle), this field should mask the typed credential by default.',
    actual: 'The field is a plain, unmasked text input — the typed password is fully visible in clear text as it\'s typed, with no masking and no show/hide toggle. Since this stores real SMS gateway credentials, this risks exposing them via shoulder-surfing or screen-sharing. Reproduced consistently.',
    status: 'Open',
  },
  {
    id: 'BUG-10',
    title: 'Filter modal: a dropdown field\'s open option list never auto-closes, and overlaps/blocks the Clear all, Cancel, Apply filters, and even the modal\'s own Close (X) buttons underneath it',
    module: 'Filter modal (shared component) — reproduced on Users > Filter ("Agent Type") and IVR Management > Call Flow > Filter ("Hold Music"); same UI pattern is used by the Filter/Filters modal on Queue, Voicemail, Callback Request, Blacklist, CRM, Survey, Script and Custom Reports, so likely affects any of those with a dropdown field too',
    severity: 'High',
    steps:
      `${BASE}\n` +
      '1. Go to Users, click "Filter".\n' +
      '2. Click the "Agent Type" dropdown and select any option (e.g. "Phone").\n' +
      '3. Without clicking anywhere else first, try to click "Apply filters" (or "Cancel", or the modal\'s "X").\n' +
      '4. Repeat on IVR Management > Call Flow > Filter, using the "Hold Music" dropdown instead.',
    expected: 'Selecting a dropdown option closes its option list, after which Clear all / Cancel / Apply filters / Close (X) are all normally clickable.',
    actual: 'The option list stays open after a selection is made and visually sits on top of Clear all, Cancel, Apply filters, and the modal\'s Close (X) button. Clicking where those buttons appear just re-toggles the same dropdown instead of triggering the button — reproduced repeatedly and consistently, including a case where clicking the modal\'s own "X" reopened the dropdown instead of closing the modal. The only reliable workaround found was clicking an inert area of the modal (e.g. its title) first to dismiss the dropdown, then clicking the intended button in a second, separate click. Once successfully applied via this workaround, the filter\'s own logic worked correctly (e.g. Hold Music: Enabled correctly narrowed the IVR Flows list to matching rows) — this is a UI interaction bug, not a filtering-logic bug.',
    status: 'Open',
  },
  {
    id: 'BUG-11',
    title: 'Filter modal can take several seconds to appear after clicking "Filter"/"Filters", with no loading indicator shown in the meantime',
    module: 'Filter modal (shared component) — reproduced on Customer Contacts > Contacts and Campaign Management > DNC',
    severity: 'Low',
    steps:
      `${BASE}\n` +
      '1. Go to Customer Contacts > Contacts (or Campaign Management > DNC).\n' +
      '2. Click "Filter" (or "Filters").\n' +
      '3. Observe the page immediately after clicking, and how long it takes for the filter panel to appear.',
    expected: 'The filter panel opens promptly, or — if it genuinely needs a few seconds — a loading indicator is shown so the delay reads as "working," not "broken."',
    actual: 'Only the background dims (as if a modal is about to open); no panel and no loading indicator appear for several seconds (observed up to ~5-9s) before the "Filter Contacts" / "Filter DNC" panel finally renders. In that window the page looks unresponsive, and it would be reasonable for a user to assume the button didn\'t work and click it again.',
    status: 'Open',
  },
  {
    id: 'BUG-12',
    title: 'Dashboard "Activity" chart shows a raw, unrounded floating-point value as an axis label',
    module: 'Admin Portal > Dashboard',
    severity: 'Low',
    steps:
      `${BASE_ADMIN}\n` +
      '1. Go to Dashboard.\n' +
      '2. Look at the Y-axis labels on the "Activity" bar chart.',
    expected: 'Clean, evenly-spaced axis labels, e.g. "0.2, 0.4, 0.6, 0.8, 1".',
    actual: 'One label reads "0.6000000000000001" instead of "0.6" — a classic unrounded floating-point-arithmetic artifact (e.g. 0.2 + 0.4 in JS) rendered directly to the user instead of being formatted/rounded first. Confirmed via the raw page text, not just visual rendering.',
    status: 'Open',
  },
  {
    id: 'BUG-13',
    title: '"Billing Type" is displayed with inconsistent casing for the same value across different customer rows',
    module: 'Admin Portal > User Management > Manage Clients',
    severity: 'Low',
    steps:
      `${BASE_ADMIN}\n` +
      '1. Go to User Management > User List (Manage Clients).\n' +
      '2. Compare the "Billing Type" badge text across all rows.',
    expected: 'The same underlying value always renders with the same casing, e.g. always "PREPAID" / "POSTPAID".',
    actual: '"PREPAID" is consistently uppercase everywhere it appears, but the postpaid value is not: one row (customer VISPL09692) shows lowercase "postpaid" while two other rows (customers 20002683 and 20002692) show uppercase "POSTPAID" — the same value rendered two different ways depending on the row.',
    status: 'Open',
  },
  {
    id: 'BUG-14',
    title: 'Multiple date/time columns across OPS reports show a raw, unformatted ISO 8601 timestamp instead of a human-readable date/time',
    module: 'Admin Portal > OPS > Recording Download ("Date/Time"), SIP Code Detail ("Date & Time"), CLI Report ("Allocation Date")',
    severity: 'Low',
    steps:
      `${BASE_ADMIN}\n` +
      '1. Go to OPS > Recording Download. Look at the "Date/Time" column value for any row.\n' +
      '2. Go to OPS > SIP Code Detail. Look at the "Date & Time" column.\n' +
      '3. Go to OPS > CLI Report. Look at the "Allocation Date" column.',
    expected: 'A human-readable date/time, consistent with the format used everywhere else in the app (e.g. "16 Jul 2026" on Manage Clients, or "2026-07-31" on Contacts).',
    actual: 'All three columns, on all three pages, show the raw ISO 8601 timestamp verbatim, including milliseconds and the "Z" suffix — e.g. "2026-08-19T10:20:40.000Z" / "2026-08-19T10:20:28.000Z" / "2026-08-12T12:37:37.000Z" — the same un-formatted-value pattern repeated across at least 3 different OPS reports, suggesting a shared underlying formatter (or lack of one) rather than 3 independent mistakes.',
    status: 'Open',
  },
  {
    id: 'BUG-15',
    title: '"Call Type" column text wraps mid-word instead of at a word boundary, splitting "OUTGOING" into "OUTGOI" / "NG"',
    module: 'Admin Portal > OPS > Recording Download',
    severity: 'Low',
    steps:
      `${BASE_ADMIN}\n` +
      '1. Go to OPS > Recording Download.\n' +
      '2. Look at the "Call Type" column for a row whose value is "OUTGOING".',
    expected: 'The column is wide enough to show "OUTGOING" on one line, or the text wraps/truncates at a sensible boundary (e.g. an ellipsis) rather than splitting the word itself.',
    actual: 'The column is too narrow for the word and CSS wraps it mid-character, rendering as "OUTGOI" on one line and "NG" on the next.',
    status: 'Open',
  },
  {
    id: 'BUG-16',
    title: '"Failed to fetch external log count" error is shown to the admin on two OPS pages, indicating a broken backend integration rather than a cosmetic issue',
    module: 'Admin Portal > OPS > Third Party API, Channel Utilization',
    severity: 'Medium',
    steps:
      `${BASE_ADMIN}\n` +
      '1. Go to OPS > Third Party API.\n' +
      '2. Observe the top-right corner of the page.\n' +
      '3. Go to OPS > Channel Utilization and observe the same.',
    expected: 'Either the underlying "external log count" data loads successfully, or — if it\'s expected to be unavailable — no raw error toast is shown to the admin (e.g. the widget is hidden, or a friendlier message is shown only where relevant).',
    actual: 'Both pages show a persistent red error notification reading "Failed to fetch external log count" in the top-right corner. On Third Party API this coincides with the page\'s own table showing "No data" (plausibly the same broken call); on Channel Utilization the page\'s own table loads fine (all rows show real data), yet the same unrelated error still displays — suggesting this is a shared component embedded on multiple OPS pages whose backend call is currently failing outright, not a one-off empty state.',
    status: 'Open',
  },
  {
    id: 'BUG-17',
    title: 'Required-field validation messages are worded inconsistently on the same form/step',
    module: 'Admin Portal > User Management > Create Enterprise (Add New Customer, Step 1: Basic information)',
    severity: 'Low',
    steps:
      `${BASE_ADMIN}\n` +
      '1. Go to User Management > Create Enterprise.\n' +
      '2. Leave every field on Step 1 empty and click "Next".\n' +
      '3. Compare the error text shown under each now-required field.',
    expected: 'One consistent wording for "this field is required" across the whole form, e.g. always "Required", or always "<Field> is required".',
    actual: 'Four different phrasings appear simultaneously on the same step: "Required" (Business Name, First Name, Plan, Traffic Type, Connection Type), "Pincode is required", "Mobile is required", and "Email is required" — the same underlying validation rendered with ad hoc, field-specific text for some fields and a generic message for others.',
    status: 'Open',
  },
  {
    id: 'BUG-18',
    title: '"Billing Type", "Payment Mode" and "Account Type" are marked required with a red asterisk but are not actually validated — Next proceeds past them silently',
    module: 'Admin Portal > User Management > Create Enterprise (Add New Customer, Step 1: Basic information > Account Billing)',
    severity: 'Medium',
    steps:
      `${BASE_ADMIN}\n` +
      '1. Go to User Management > Create Enterprise.\n' +
      '2. Leave "Billing Type", "Payment Mode" and "Account Type" (all three marked with a red *) unselected, along with the rest of the form.\n' +
      '3. Click "Next" and observe which fields get a red border / error text and which don\'t.',
    expected: 'Every field marked with a required asterisk is enforced consistently — left empty, it should get the same red-border-plus-error treatment as the other required fields on the step (e.g. "Plan*", "Traffic Type*", "Connection Type*", which do get flagged correctly).',
    actual: '"Billing Type*", "Payment Mode*" and "Account Type*" show no red border and no error text at all when left empty, even though "Please fix the highlighted fields" fires and every other required field (including the visually-identical "Plan*"/"Traffic Type*"/"Connection Type*" dropdowns directly below them) is correctly flagged. Confirmed via two independent full-page-screenshot/text-dump runs at Step 1. This suggests the wizard could be advanced to Step 2 without the customer\'s billing type, payment mode, or account type ever being captured.',
    status: 'Open',
  },
  {
    id: 'BUG-19',
    title: 'Whitelabel "Secondary Colour" field shows a raw, unresolved CSS variable (var(--heading-color)) instead of an actual colour value',
    module: 'Admin Portal > User Management > Create Enterprise (Add New Customer, Step 4: Whitelabel > Branding)',
    severity: 'Medium',
    steps:
      `${BASE_ADMIN}\n` +
      '1. Go to User Management > Create Enterprise.\n' +
      '2. Fill Step 1 (Basic information) with valid data and click "Save & Next".\n' +
      '3. On Step 2 (License & Permission Set) click "Next" without changing anything.\n' +
      '4. On Step 3 (Ratecard) click "Next" without filling anything.\n' +
      '5. On Step 4 (Whitelabel), compare the "Primary Colour" and "Secondary Colour" fields.',
    expected: 'Both colour fields should show either a real hex value (like Primary Colour\'s pre-filled "#782891") or an empty/placeholder state such as "#000000" — never a literal CSS source string.',
    actual: 'The "Secondary Colour" input displays the literal text "var(--heading-color)" — an unresolved CSS custom-property reference has leaked into the form value instead of being resolved to an actual colour or left blank. "Primary Colour" alongside it correctly shows a real hex code. Confirmed via full-page screenshot at Step 4.',
    status: 'Open',
  },
];

const SEVERITY_FILL = {
  High: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } },
  Medium: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
  Low: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } },
};

const STATUS_FILL = {
  Open: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } },
  Fixed: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } },
};

async function main() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Exploratory Bugs');

  ws.columns = [
    { width: 12 },
    { width: 42 },
    { width: 34 },
    { width: 12 },
    { width: 55 },
    { width: 45 },
    { width: 55 },
    { width: 12 },
  ];

  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  headerRow.height = 20;

  for (const b of BUGS) {
    const row = ws.addRow([b.id, b.title, b.module, b.severity, b.steps, b.expected, b.actual, b.status]);
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      if (colNumber === 1) {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (colNumber === 4) {
        cell.font = { bold: true };
        cell.fill = SEVERITY_FILL[b.severity] || undefined;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      if (colNumber === 8) {
        cell.font = { bold: true, color: { argb: 'FFC00000' } };
        cell.fill = STATUS_FILL[b.status] || undefined;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
    row.height = 170;
  }

  ws.autoFilter = { from: 'A1', to: `H${BUGS.length + 1}` };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const outDir = path.join(__dirname, '..', 'test-cases');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'ExploratoryBugReport.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${outPath} (${BUGS.length} bugs)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
