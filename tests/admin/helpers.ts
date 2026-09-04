import { Page, Locator, BrowserContext, expect } from '@playwright/test';

export async function login(page: Page) {
  await page.goto('/');
  await page.locator('input[name="username"]').fill(process.env.TEST_EMAIL!);
  await page.locator('input[name="password"]').fill(process.env.TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/client\/live-dashboard/, { timeout: 15000 });
}

export async function gotoAddUser(page: Page) {
  await page.goto('/client/users/add-user');
  await expect(page.locator('input[name="agentName"]')).toBeVisible();
}

/**
 * Opens an antd Select identified by its `name` attribute and picks the option with the given
 * text. Types into the search box to filter, then selects via keyboard (a single filtered match
 * can render with a zero-size box, which fails Playwright's "visible" check on .click()).
 */
export async function selectAntOption(page: Page, selectName: string, optionText: string) {
  const select = page.locator(`div[name="${selectName}"]`);
  const combobox = select.locator('input[role="combobox"]');
  await select.click();
  await combobox.fill(optionText);
  await expect(page.getByRole('option', { name: optionText, exact: true })).toBeAttached();
  await combobox.press('Enter');
}

/** Toggle switch located by the visible label text of its enclosing .aap-toggle-row. */
export function toggleByLabel(page: Page, label: string) {
  return page.locator('.aap-toggle-row', { hasText: label }).locator('button.ant-switch');
}

function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export function uniqueContact(): string {
  return ('9' + uniqueSuffix()).slice(0, 10);
}

export function uniqueEmail(prefix = 'qa.auto'): string {
  return `${prefix}.${uniqueSuffix()}@example.com`;
}

export function uniqueHolidayName(prefix = 'QA Holiday'): string {
  return `${prefix} ${uniqueSuffix()}`;
}

export async function fillMandatory(
  page: Page,
  opts: { name: string; email: string; contact: string }
) {
  await page.locator('input[name="agentName"]').fill(opts.name);
  await page.locator('input[name="agentEmail"]').fill(opts.email);
  await page.locator('input[name="agentMobile"]').fill(opts.contact);
}

export async function clickSave(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

export async function expectCreatedSuccessfully(page: Page) {
  await expect(page.getByText('User created successfully!')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Done' }).click();
}

export async function showAllUserRows(page: Page) {
  const rowsPerPage = page.locator('text=Rows per page:').locator('..').getByRole('combobox');
  if (await rowsPerPage.isVisible().catch(() => false)) {
    await rowsPerPage.click();
    await page.getByRole('option', { name: '50', exact: true }).click().catch(() => {});
  }
}

export async function gotoUsersList(page: Page) {
  await page.goto('/client/users');
  await page.getByText('hrishikakomal2@gmail.com').waitFor({ timeout: 15000 });
  await showAllUserRows(page);
}

/** Deletes a user from the Users list by their email address. No-ops if not found. */
export async function deleteUserByEmail(page: Page, email: string) {
  await gotoUsersList(page);
  const row = page.locator('tr', { hasText: email });
  try {
    await expect(row).toBeVisible({ timeout: 10000 });
  } catch {
    return;
  }
  await row.getByRole('button', { name: 'more' }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);
}

// ---------------- Contacts (Customer Contacts > Contacts) ----------------

export async function gotoContacts(page: Page) {
  await page.goto('/client/profile/contact');
  await expect(page.getByRole('button', { name: 'Add Contact' })).toBeVisible();
}

export async function openAddContact(page: Page) {
  // Stacked "Contact added" toasts (top-right) can drift over this button during rapid
  // successive saves and intercept the click — let any in-flight toast clear first.
  await page.locator('.ant-notification-notice').first().waitFor({ state: 'detached', timeout: 6000 }).catch(() => {});
  await page.getByRole('button', { name: 'Add Contact' }).click();
  await expect(page.getByRole('heading', { name: 'Add Contact' })).toBeVisible();
}

/** Fills the Add/Edit Contact form. All fields are optional except `phone`. */
export async function fillContact(
  page: Page,
  opts: { name?: string; phone?: string; email?: string; company?: string; address?: string }
) {
  if (opts.name !== undefined) await page.locator('input[name="customer_name"]').fill(opts.name);
  if (opts.phone !== undefined) await page.locator('input[name="customer_number_primary"]').fill(opts.phone);
  if (opts.email !== undefined) await page.locator('input[name="email_id"]').fill(opts.email);
  if (opts.company !== undefined) await page.locator('input[name="company_name"]').fill(opts.company);
  if (opts.address !== undefined) await page.locator('input[name="address"]').fill(opts.address);
}

export async function expectContactAdded(page: Page) {
  await expect(page.getByText('Contact added').first()).toBeVisible({ timeout: 15000 });
}

/** Deletes a contact from the Contacts list by its Customer Name. No-ops if not found. */
export async function deleteContactByName(page: Page, name: string) {
  await gotoContacts(page);
  const row = page.locator('tr', { hasText: name });
  try {
    await expect(row).toBeVisible({ timeout: 10000 });
  } catch {
    return;
  }
  await row.locator('.anticon-delete').click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(row).toHaveCount(0);
}

export async function searchContacts(page: Page, query: string) {
  const search = page.locator('input[placeholder="Search by name, phone, email, or company"]');
  await search.fill(query);
  await page.waitForTimeout(600); // debounce
}

// ---------------- Queue (IVR Management > Queue) ----------------

export async function gotoQueueList(page: Page) {
  await page.goto('/client/queue/list-queue');
  await expect(page.getByRole('button', { name: 'Create Queue' })).toBeVisible();
}

export async function gotoCreateQueue(page: Page) {
  await page.goto('/client/queue/add-queue');
  await expect(page.locator('input[name="queue_name"]')).toBeVisible();
}

/**
 * Opens the multi-select "Select agents" dropdown and checks each named agent.
 * Matches option text exactly (not antd's option `hasText`, which is a case-insensitive
 * substring match — 'komal' would also match a row named 'Hrishika Komal 1', re-clicking and
 * deselecting it instead of picking the distinct 'komal' agent). Also avoids role=option — like
 * selectCampaignDids, this list's virtual-scroll duplicates items into an off-screen a11y node
 * with a zero-size box, which getByRole('option') can resolve to instead of the real, visible,
 * clickable one.
 */
export async function selectQueueAgents(page: Page, names: string[]) {
  await page.locator('div[name="selected_agents"]').click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  for (const name of names) {
    await dropdown.locator('.ant-select-item-option').getByText(name, { exact: true }).click();
  }
  await page.keyboard.press('Escape');
}

/** Toggle switch located by the visible label text of its enclosing .qf-shaded-card row. */
export function queueToggleByLabel(page: Page, label: string) {
  return page.locator('.qf-shaded-card', { hasText: label }).locator('button.ant-switch');
}

export async function clickQueueSave(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

export async function expectQueueCreated(page: Page) {
  await expect(page.getByText('Queue added successfully')).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/list-queue/, { timeout: 15000 });
}

export async function searchQueue(page: Page, query: string) {
  await page.locator('input[placeholder="Search by queue name"]').fill(query);
  await page.waitForTimeout(600); // debounce
}

/** Deletes a queue from the Queue list by its exact name. No-ops if not found. Handles the double confirm (popconfirm + modal). */
export async function deleteQueueByName(page: Page, name: string) {
  await gotoQueueList(page);
  await searchQueue(page, name);
  const row = page.locator('tr', { hasText: name });
  try {
    await expect(row).toBeVisible({ timeout: 10000 });
  } catch {
    return;
  }
  await row.locator('.anticon-delete').click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0);
}

// ---------------- Campaign (Campaign Management > Campaign > Incoming Campaign) ----------------

export async function gotoCampaignList(page: Page) {
  await page.goto('/client/campaign/campaign-list');
  await expect(page.getByRole('button', { name: 'Create Campaign' })).toBeVisible();
}

/** Opens Create Campaign. Incoming Campaign is the default selected mode. */
export async function gotoCreateIncomingCampaign(page: Page) {
  await page.goto('/client/campaign/create-campaign');
  await expect(page.locator('input[name="campaign_name"]')).toBeVisible();
  await expect(page.locator('div[name="ivr_flow"]')).toBeVisible();
}

/**
 * Opens the multi-select "Select DID" dropdown and checks each named DID.
 * Uses the antd option class rather than role=option — this field's virtual-scroll list
 * duplicates its items into an off-screen a11y node with stale text, which getByRole('option')
 * can resolve to instead of the real, visible, clickable one.
 */
export async function selectCampaignDids(page: Page, values: string[]) {
  const select = page.locator('div[name="virtual_number_pool"]');
  await select.click();
  for (const value of values) {
    await page.locator('.ant-select-item-option', { hasText: value }).click();
  }
  await page.keyboard.press('Escape');
}

export async function selectCampaignCallFlow(page: Page, value: string) {
  await selectAntOption(page, 'ivr_flow', value);
}

/**
 * Toggle switch for a campaign feature row (e.g. "Enable CRM"), located by its label text.
 * The form has no stable row/card class, so the row is found as the smallest ancestor of the
 * label that also contains a switch.
 */
export function campaignToggleByLabel(page: Page, label: string) {
  return page
    .locator('div')
    .filter({ hasText: label })
    .filter({ has: page.locator('button.ant-switch') })
    .last()
    .locator('button.ant-switch');
}

export async function clickCampaignSave(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

export async function expectCampaignCreated(page: Page) {
  await expect(page.getByText('Campaign created')).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/campaign-list/, { timeout: 15000 });
}

export async function searchCampaign(page: Page, query: string) {
  await page.locator('input[placeholder="Search by Campaign name"]').fill(query);
  await page.waitForTimeout(600); // debounce
}

/** Deletes a campaign from the Campaign list by its exact name. No-ops if not found. */
export async function deleteCampaignByName(page: Page, name: string) {
  await gotoCampaignList(page);
  const row = page.locator('tr', { hasText: name });
  try {
    await expect(row).toBeVisible({ timeout: 10000 });
  } catch {
    return;
  }
  await row.locator('.anticon-more').click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete campaign?' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(row).toHaveCount(0, { timeout: 10000 });
}

// ---------------- Outgoing Campaign (Campaign Management > Campaign > Create Campaign) ----------------

/** Opens Create Campaign and switches to Outgoing Campaign mode ("Select Dialer" / "Select Queue" replace Incoming's "Select Call flow"). */
export async function gotoCreateOutgoingCampaign(page: Page) {
  await page.goto('/client/campaign/create-campaign');
  await expect(page.locator('input[name="campaign_name"]')).toBeVisible();
  await page.getByRole('button', { name: 'Outgoing Campaign', exact: true }).click();
  await expect(page.locator('div[name="campaign_type"]')).toBeVisible();
  await expect(page.locator('div[name="campaign_queue"]')).toBeVisible();
}

/**
 * Selects an antd Select option by class rather than role=option — like selectCampaignDids,
 * this avoids a virtual-scroll list's off-screen a11y duplicate nodes with stale text, which
 * selectAntOption's role-based lookup can resolve to for longer option lists (confirmed live:
 * "Select Queue" resolved two duplicate nodes showing completely unrelated, stale text).
 */
export async function selectAntOptionByClass(page: Page, name: string, optionText: string) {
  await page.locator(`div[name="${name}"]`).click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  await dropdown.locator('.ant-select-item-option', { hasText: optionText }).first().click();
}

/**
 * Opens "Set time" from a campaign row's "..." menu and saves the schedule using whatever
 * defaults the dialog already has (Start/End Date and each weekday's Start/End Time are all
 * pre-filled with sensible values) — an outgoing campaign needs a schedule set before it will
 * actually place calls.
 */
export async function setCampaignSchedule(page: Page, campaignName: string) {
  await gotoCampaignList(page);
  const row = page.locator('tr', { hasText: campaignName });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('.anticon-more').click();
  await page.getByRole('menuitem', { name: 'Set time' }).click();
  await expect(page.getByRole('heading', { name: /^Schedule Campaign/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Campaign scheduled successfully')).toBeVisible({ timeout: 15000 });
}

/**
 * Which contact-list file to upload, and which of its columns holds the phone number — set via
 * .env (OUTGOING_CAMPAIGN_UPLOAD_FILE, OUTGOING_CAMPAIGN_UPLOAD_CUSTOMER_COLUMN) since this is QA
 * data that will change over time, not hardcoded here. File path is empty until one is provided.
 */
export const OUTGOING_CAMPAIGN_UPLOAD_FILE = process.env.OUTGOING_CAMPAIGN_UPLOAD_FILE || '';
export const OUTGOING_CAMPAIGN_UPLOAD_CUSTOMER_COLUMN =
  process.env.OUTGOING_CAMPAIGN_UPLOAD_CUSTOMER_COLUMN || 'Contacts';

/**
 * Clicks "Upload" on a campaign row — this navigates to a dedicated "Add Campaign Data" page
 * (/campaign/upload-numbers?id=...), not a modal — sets `filePath` directly on its Base File
 * input (a plain, always-present <input type="file">, so this bypasses the visible "Click to
 * Upload" button and never risks a real native OS file dialog), fills the "File Name" field
 * (no visible required-marker, but live-verified as enforced — Save shows a "Required" error
 * under it if left blank), maps `customerNumberColumn` to "Customer Number", then saves.
 */
export async function uploadCampaignContactList(
  page: Page,
  campaignName: string,
  filePath: string,
  customerNumberColumn: string
) {
  await gotoCampaignList(page);
  const row = page.locator('tr', { hasText: campaignName });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole('button', { name: 'Upload' }).click();
  await page.waitForURL(/upload-numbers/, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Add Campaign Data' })).toBeVisible();

  await page.setInputFiles('input[type="file"]', filePath);
  await expect(page.getByText('Please map the fields')).toBeVisible({ timeout: 10000 });

  await page.locator('input[type="text"]').first().fill(campaignName);
  await selectAntOptionByClass(page, 'customerField', customerNumberColumn);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Campaign numbers are being uploaded')).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/campaign-list/, { timeout: 15000 });
}

// ---------------- CRM Forms (Campaign Management > Campaign > CRM) ----------------

export async function gotoCrmForms(page: Page) {
  await page.goto('/client/campaign/crm-forms');
  await expect(page.getByRole('button', { name: 'Add Form' })).toBeVisible();
}

/**
 * Opens Add CRM Form via the "Add Form" button from the list, not a direct page.goto to
 * /crm-forms/add — deep-linking straight to /add causes the post-save redirect to misroute to
 * /client/live-dashboard instead of back to the CRM Forms list (see spec test for that defect).
 */
export async function gotoAddCrmForm(page: Page) {
  await gotoCrmForms(page);
  await page.getByRole('button', { name: 'Add Form' }).click();
  await expect(page.locator('input[name="form_name"]')).toBeVisible();
}

export async function fillCrmFormName(page: Page, name: string) {
  await page.locator('input[name="form_name"]').fill(name);
}

export async function generateCrmFormUrl(page: Page) {
  await page.getByRole('button', { name: 'Generate URL', exact: true }).click();
}

/**
 * Adds a form field via the "Add Field" flow: opens the field-type picker, selects `fieldType`
 * (e.g. 'Textfield', 'Dropdown', 'Date', 'Radio', 'Big Textfield'), fills the field title in the
 * resulting "Configure ..." modal, optionally checks Required, then confirms.
 * Both the type-picker and configure modals can stay mounted at once, so each step is scoped by
 * its modal's heading text rather than assuming only one .ant-modal is present.
 */
export async function addCrmField(
  page: Page,
  fieldType: string,
  title: string,
  opts: { required?: boolean } = {}
) {
  await page.getByRole('button', { name: 'Add Field' }).click();
  const typeModal = page.getByRole('dialog').filter({ hasText: 'Select Field Type' });
  await typeModal.getByRole('button', { name: fieldType, exact: true }).click();

  const configModal = page.getByRole('dialog').filter({ hasText: /^Configure/ });
  await configModal.locator('input[name="title"]').fill(title);
  if (opts.required) {
    await configModal.getByText('Required', { exact: true }).click();
  }
  await configModal.getByRole('button', { name: 'Confirm', exact: true }).click();

  // After Confirm, the modal's underlying .ant-modal-wrap stays display:block with
  // pointer-events:auto for a brief window while its close animation runs — during that window
  // it silently intercepts clicks on whatever sits underneath it (e.g. the page's Save button),
  // even though the dialog is no longer visible. Wait that window out before returning.
  await configModal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(350);
}

/** Row for a form field in the builder, located by its title text. */
export function crmFieldRowByTitle(page: Page, title: string) {
  return page
    .locator('div')
    .filter({ hasText: title })
    .filter({ has: page.locator('span[aria-label="edit"]') })
    .last();
}

export async function clickCrmFormSave(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

/**
 * Field-picker/configure modals stay mounted in the DOM after use (see addCrmField), and the
 * Configure modal has its own "Cancel" button — so this is scoped to `main` to avoid a strict-mode
 * violation from matching that leftover modal button too.
 */
export async function clickCrmFormCancel(page: Page) {
  await page.locator('main').getByRole('button', { name: 'Cancel', exact: true }).click();
}

export async function expectCrmFormSaved(page: Page) {
  await expect(page.getByText('Form saved successfully')).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/crm-forms$/, { timeout: 15000 });
}

export async function searchCrmForms(page: Page, query: string) {
  await page.locator('input[placeholder="Search by form name"]').fill(query);
  await page.waitForTimeout(600); // debounce
}

/** Deletes a CRM form from the list by its exact name. No-ops if not found. */
export async function deleteCrmFormByName(page: Page, name: string) {
  await gotoCrmForms(page);
  await searchCrmForms(page, name);
  const row = page.locator('tr', { hasText: name });
  try {
    await expect(row).toBeVisible({ timeout: 10000 });
  } catch {
    return;
  }
  await row.locator('span[aria-label="delete"]').click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByText('Form deleted')).toBeVisible({ timeout: 15000 });
  await expect(row).toHaveCount(0);
}

// ---------------- Disposition (Campaign Management > Disposition) ----------------
// A disposition is a tree (up to 5 levels) built on one canvas page and saved in one go.
// Save/Cancel/Reset buttons all render with an icon, so their accessible name includes the icon
// text (e.g. "save Save") — locate them by non-exact name, same lesson as CRM Forms' "Add Field".

export async function gotoDispositions(page: Page) {
  await page.goto('/client/campaign/dispositions');
  await expect(page.getByRole('button', { name: 'Add Disposition' })).toBeVisible();
}

export async function gotoAddDisposition(page: Page) {
  await gotoDispositions(page);
  await page.getByRole('button', { name: 'Add Disposition' }).click();
  await expect(dispositionRootInput(page)).toBeVisible();
}

/** The root (Level 1) node's name input — always exactly one on the page. */
export function dispositionRootInput(page: Page) {
  return page.locator('input[placeholder="Enter disposition name"]').first();
}

/**
 * A node's name lives only in its editable <input>'s live `.value` property — never in DOM
 * textContent, and never in the `value` HTML attribute either (a JS-driven value change, e.g.
 * via React's controlled-input re-render or Playwright's fill(), only ever touches the property,
 * not the attribute — a DOM fundamental, not a framework quirk). Playwright's text/hasText
 * matching explicitly excludes plain text inputs from value-based matching too (only
 * <input type=button|submit> match by value, per its docs). So no CSS/XPath/text locator can
 * find a node by its typed name — this reads the live value directly instead.
 */
async function findDispositionNodeIndex(page: Page, label: string): Promise<number> {
  return page.evaluate((label) => {
    const cards = Array.from(document.querySelectorAll('.dt-card'));
    return cards.findIndex((c) => (c.querySelector('input') as HTMLInputElement | null)?.value === label);
  }, label);
}

/** Polls until a `.dt-card` named `label` exists (or stops existing), returning its final index (-1 if absent). */
async function waitForDispositionNodeIndex(
  page: Page,
  label: string,
  expected: 'present' | 'absent',
  timeout = 10000
): Promise<number> {
  const deadline = Date.now() + timeout;
  let index = await findDispositionNodeIndex(page, label);
  const done = () => (expected === 'present' ? index !== -1 : index === -1);
  while (!done() && Date.now() < deadline) {
    await page.waitForTimeout(150);
    index = await findDispositionNodeIndex(page, label);
  }
  return index;
}

/** A disposition tree node card located by its current name, resolved against the live DOM now. */
export async function dispositionNodeByLabel(page: Page, label: string) {
  const index = await findDispositionNodeIndex(page, label);
  return index === -1 ? page.locator('.dt-card').filter({ hasText: ` no-such-node:${label}` }) : page.locator('.dt-card').nth(index);
}

/**
 * The just-added blank node's input, located by having an empty value rather than by DOM order
 * — a freshly-added node is not reliably the last input in document order (confirmed live:
 * filling `.last()` after adding a second Level-2 sibling's child landed on the wrong card and
 * silently renamed an existing sibling instead of naming the new node). Callers only ever have
 * one blank node in flight at a time, so "the empty one" is unambiguous.
 */
async function newDispositionNodeInput(page: Page) {
  const inputs = page.locator('input[placeholder="Enter disposition name"]');
  const count = await inputs.count();
  for (let i = count - 1; i >= 0; i--) {
    if ((await inputs.nth(i).inputValue()) === '') return inputs.nth(i);
  }
  throw new Error('No blank disposition node input found to fill');
}

/**
 * The canvas auto-pans/re-fits itself whenever the tree's node count changes (confirmed live —
 * adding or deleting a node visibly re-centers and sometimes re-zooms the whole canvas). That
 * animation races Playwright's next click on a now-repositioning target, so every tree-mutating
 * action below settles briefly afterward before returning control.
 */
async function settleDispositionCanvas(page: Page) {
  await page.waitForTimeout(400);
}

/**
 * Clicks the root-level "Add Node" button (adds a Level 2 sibling under the root) and fills the
 * newly-created empty node with `name`. Requires the root name to already be filled — the button
 * stays disabled ("Enter a disposition name first") until it is.
 */
export async function addDispositionRootChild(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add Node' }).click();
  await settleDispositionCanvas(page);
  await newDispositionNodeInput(page).then((input) => input.fill(name));
  const index = await waitForDispositionNodeIndex(page, name, 'present');
  if (index === -1) throw new Error(`Disposition node "${name}" never appeared after Add Node`);
  await settleDispositionCanvas(page);
}

/** Adds a child node one level below `parentLabel` via its card's "+" icon, and fills its name. */
export async function addDispositionChild(page: Page, parentLabel: string, name: string) {
  const parentIndex = await waitForDispositionNodeIndex(page, parentLabel, 'present');
  if (parentIndex === -1) throw new Error(`Disposition parent node "${parentLabel}" not found`);
  await page.locator('.dt-card').nth(parentIndex).locator('span[aria-label="plus-circle"]').click();
  await settleDispositionCanvas(page);
  await newDispositionNodeInput(page).then((input) => input.fill(name));
  const childIndex = await waitForDispositionNodeIndex(page, name, 'present');
  if (childIndex === -1) throw new Error(`Disposition node "${name}" never appeared after adding child`);
  await settleDispositionCanvas(page);
}

/** Deletes a node from the in-progress tree (and, if it has any, all of its descendants). */
export async function deleteDispositionNode(page: Page, label: string) {
  const node = await dispositionNodeByLabel(page, label);
  await node.locator('span[aria-label="delete"]').click();
  await page.locator('.ant-popover').getByRole('button', { name: 'Yes', exact: true }).click();
  const index = await waitForDispositionNodeIndex(page, label, 'absent');
  if (index !== -1) throw new Error(`Disposition node "${label}" was not removed after delete`);
  await settleDispositionCanvas(page);
}

export async function clickDispositionSave(page: Page) {
  await page.getByRole('button', { name: 'Save' }).click();
}

export async function clickDispositionCancel(page: Page) {
  await page.getByRole('button', { name: 'Cancel' }).click();
}

/** Clicks Reset and confirms the "Discard changes?" dialog. */
export async function clickDispositionReset(page: Page) {
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, reset' }).click();
}

export async function expectDispositionCreated(page: Page) {
  await expect(page.getByText('Disposition created')).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/dispositions$/, { timeout: 15000 });
}

export async function expectDispositionUpdated(page: Page) {
  await expect(page.getByText('Disposition updated')).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveURL(/dispositions$/, { timeout: 15000 });
}

export async function searchDispositions(page: Page, query: string) {
  await page.locator('input[placeholder="Search dispositions"]').fill(query);
  await page.waitForTimeout(600); // debounce
}

/** Deletes a disposition from the list by its exact root name. No-ops if not found. */
export async function deleteDispositionByName(page: Page, name: string) {
  await gotoDispositions(page);
  await searchDispositions(page, name);
  const row = page.locator('tr', { hasText: name });
  try {
    await expect(row).toBeVisible({ timeout: 10000 });
  } catch {
    return;
  }
  await row.locator('span[aria-label="delete"]').click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByText('Disposition removed')).toBeVisible({ timeout: 15000 });
  await expect(row).toHaveCount(0);
}

// ---------------- Agent SSO Login (Users list > row "..." menu > Login) ----------------
// Which agent, campaign, and mode this exercises will change over time as QA data changes, so
// they're read from the environment (see .env: SSO_AGENT_EMAIL, SSO_CAMPAIGN, SSO_MODE) rather
// than hardcoded — update .env there instead of editing the test when they need to change.

export const SSO_AGENT_EMAIL = process.env.SSO_AGENT_EMAIL || 'hrishikakomal2@gmail.com';
export const SSO_CAMPAIGN = process.env.SSO_CAMPAIGN || 'preview manual';
export const SSO_MODE = process.env.SSO_MODE || 'Webrtc';

/**
 * Clicks "Login" (SSO) from an agent row's "..." menu on the Users list. If that agent already
 * has an active session elsewhere, a confirmation dialog appears first ("Agent Already Logged
 * In... Do you want to proceed and log them out?") — this confirms it, since blocking here would
 * make the flow unusable whenever the agent is mid-session. SSO opens a new browser tab (the
 * agent's own "Login type." page); this returns that tab.
 */
export async function ssoLoginAgentByEmail(page: Page, context: BrowserContext, email: string) {
  await gotoUsersList(page);
  const row = page.locator('tr', { hasText: email });
  await expect(row).toBeVisible({ timeout: 10000 });
  // Read the agent's display name from the row itself (3rd column) rather than hardcoding it,
  // so callers can assert on it later without a separate, easily-stale env var.
  const agentName = (await row.locator('td').nth(2).textContent())?.trim() || '';
  await row.getByRole('button', { name: 'more' }).click();

  const newTabPromise = context.waitForEvent('page', { timeout: 10000 });
  await page.getByRole('menuitem', { name: 'Login' }).click();

  const proceedBtn = page.getByRole('button', { name: 'Yes, proceed!' });
  if (await proceedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await proceedBtn.click();
  }

  const agentTab = await newTabPromise;
  await agentTab.waitForLoadState('domcontentloaded');
  await expect(agentTab.getByRole('heading', { name: 'Login type.' })).toBeVisible({ timeout: 15000 });
  return { agentTab, agentName };
}

/**
 * On the agent's "Login type." tab (opened by ssoLoginAgentByEmail), selects the connection mode
 * and campaign, then submits. "Select Type" is a plain native <select> (its only real option is
 * whatever call mode the agent is configured for, e.g. "Webrtc"); "Select Campaign" is an antd
 * Select — read its option text via the `.ant-select-item-option` class rather than role=option,
 * since antd's virtual-scroll list duplicates items into an off-screen a11y node with stale text
 * (same lesson as Campaign's DID selector).
 */
export async function completeAgentSsoLogin(
  agentTab: Page,
  opts: { mode?: string; campaign: string }
) {
  if (opts.mode) {
    await agentTab.locator('select').selectOption({ label: opts.mode });
  }
  await agentTab.locator('.ant-select').filter({ hasText: 'Select Campaign' }).click();
  await agentTab.locator('.ant-select-item-option', { hasText: opts.campaign }).first().click();
  await agentTab.getByRole('button', { name: 'Submit' }).click();
}

/** Asserts the agent tab landed on their dashboard, logged in as `agentName`. */
export async function expectAgentDashboard(agentTab: Page, agentName: string) {
  await expect(agentTab).toHaveURL(/\/agent\/dashboard/, { timeout: 15000 });
  await expect(agentTab.getByText(agentName, { exact: true })).toBeVisible({ timeout: 15000 });
}

// ---------------- Working Hours (Availability > Working hours) ----------------

/**
 * Sets an antd TimePicker input's value via its dropdown panel (hour cell, minute cell, then OK)
 * rather than typing into the text input directly — typing digits after selecting the existing
 * text was confirmed live to sometimes produce a corrupted/merged value (e.g. digits from the old
 * and new value combining into an unrelated time) instead of cleanly replacing it. The panel's
 * click-driven selection is deterministic and matches how a real user would pick a time.
 *
 * The start/end fields share one underlying range-picker's "which field is active" state, which
 * only catches up with the DOM a moment after the dropdown opens/closes — calling this twice back
 * to back with no settling time (e.g. immediately after a Save re-render) was confirmed live to
 * silently write the new value into the *other* field instead of the one just clicked. The waits
 * below give that internal state time to settle before/after each panel interaction.
 *
 * Each cell is clicked via `.evaluate(el => el.click())` rather than Playwright's pointer-based
 * `.click()` — the panel auto-scrolls the selected hour into view the instant it's picked, and
 * that scroll animation was confirmed live to race a real pointer click into landing on whatever
 * cell ends up under those screen coordinates once the list finishes moving (e.g. asking for
 * minute "30" but landing on "33"). Dispatching the click directly on the element handle sidesteps
 * screen coordinates and scroll position entirely.
 */
export async function setTimePickerValue(page: Page, input: Locator, hh: string, mm: string) {
  await input.click();
  const dropdown = page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)');
  await dropdown.waitFor({ state: 'visible' });
  await page.waitForTimeout(200);
  const columns = dropdown.locator('.ant-picker-time-panel-column');
  await columns.nth(0).locator('.ant-picker-time-panel-cell-inner', { hasText: hh }).evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(200);
  await columns.nth(1).locator('.ant-picker-time-panel-cell-inner', { hasText: mm }).evaluate((el) => (el as HTMLElement).click());
  await expect(input).toHaveValue(`${hh}:${mm}`);
  await dropdown.getByRole('button', { name: 'OK', exact: true }).click();
  await dropdown.waitFor({ state: 'hidden' }).catch(() => {});
  await page.waitForTimeout(300);
}

/**
 * Toggle switch located by its label text within its `.nw-toggle-card` row. Shared markup between
 * Working Hours and Closed Days' "Call settings" section (Redirect to voicemail / AI Agent / Early
 * media announcement), so this works on either page.
 */
export function nonWorkingHoursToggleByLabel(page: Page, label: string) {
  return page.locator('.nw-toggle-card', { hasText: label }).locator('button.ant-switch');
}

// ---------------- Closed Days (Availability > Closed Days) ----------------

/**
 * A day-of-week checkbox on the Closed Days page, located by its label (e.g. "MONDAY"). This is a
 * custom `.nw-day-checkbox` div, not a real `<input type="checkbox">`, so checked state is read via
 * its `is-checked` class rather than `:checked`/`toBeChecked()`.
 */
export function nonWorkingDayCheckbox(page: Page, day: string) {
  return page.locator('.nw-day-item', { hasText: day }).locator('.nw-day-checkbox');
}

// ---------------- Holidays (Availability > Holidays) ----------------

export async function gotoHolidays(page: Page) {
  await page.goto('/client/ivr/holiday');
  await expect(page.getByRole('heading', { name: 'Set your holidays' })).toBeVisible();
}

/**
 * Fills the holiday form's three required fields. `date` must be in YYYY-MM-DD format — typed
 * directly into the date input rather than picked from the calendar, since the calendar's
 * auto-scroll/re-render was confirmed live to make a coordinate-based cell click land on the
 * wrong day (e.g. one row off from the intended date).
 */
export async function fillHolidayForm(page: Page, opts: { name: string; date: string; media: string }) {
  await page.locator('input[name="name"]').fill(opts.name);
  const dateInput = page.locator('input[name="holidayDate"]');
  await dateInput.fill(opts.date);
  await dateInput.press('Enter');
  await page.locator('div[name="media"]').click();
  await page.keyboard.type(opts.media);
  await page.keyboard.press('Enter');
}

export async function clickHolidaySave(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

export async function expectHolidaySaved(page: Page) {
  await expect(page.getByText('Holiday saved')).toBeVisible({ timeout: 15000 });
}

export async function searchHolidays(page: Page, query: string) {
  await page.locator('input[placeholder="By Holiday name....."]').fill(query);
  await page.waitForTimeout(600); // debounce
}

/** Deletes a holiday from the list by its exact name. No-ops if not found. */
export async function deleteHolidayByName(page: Page, name: string) {
  await gotoHolidays(page);
  await searchHolidays(page, name);
  const row = page.locator('tr', { hasText: name });
  try {
    await expect(row).toBeVisible({ timeout: 10000 });
  } catch {
    return;
  }
  await row.locator('.hp-action-btn--delete').click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(row).toHaveCount(0);
}
