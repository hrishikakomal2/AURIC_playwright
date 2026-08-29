import { test, expect } from '@playwright/test';
import {
  login,
  gotoCrmForms,
  gotoAddCrmForm,
  fillCrmFormName,
  generateCrmFormUrl,
  addCrmField,
  crmFieldRowByTitle,
  clickCrmFormSave,
  clickCrmFormCancel,
  expectCrmFormSaved,
  searchCrmForms,
  deleteCrmFormByName,
} from './helpers';

/**
 * crm_forms.form_name is a narrow DB column — bisected live to exactly 30 chars OK / 31 fails
 * (see test 20's [DEFECT]) — so names generated here are kept safely under that, truncating as a
 * hard backstop regardless of the prefix passed in.
 */
function uniqueFormName(prefix = 'QA CRM') {
  const suffix = Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
  return `${prefix} ${suffix}`.slice(0, 30);
}

test.describe('Campaign — CRM Forms', () => {
  // Retry once as a safety net for this shared demo account's occasional environment hiccups.
  // (The original "Save sometimes doesn't complete" flakiness this was added for turned out to be
  // deterministic, not flaky — see test 20's [DEFECT] — and is now avoided by keeping generated
  // form names short; this stays as a general safety net, not a fix for that specific bug.)
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ---------------- Page load ----------------
  test('01 CRM Forms list page loads with Add Form, search box and table headers', async ({ page }) => {
    await gotoCrmForms(page);
    await expect(page.getByRole('heading', { name: 'CRM Forms' })).toBeVisible();
    await expect(page.locator('input[placeholder="Search by form name"]')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Form Name', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Form URL', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Date Time', exact: true })).toBeVisible();
  });

  test('02 Add CRM Form page loads with Form Name, Form URL and Add Field controls', async ({ page }) => {
    await gotoAddCrmForm(page);
    await expect(page.getByRole('heading', { name: 'Add CRM Form' })).toBeVisible();
    await expect(page.locator('input[name="form_name"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate URL', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Field' })).toBeVisible();
    await expect(page.getByText('No fields added yet. Click "Add Field" to begin.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  });

  // ---------------- Field-type picker ----------------
  test('03 Add Field opens a picker listing all five field types', async ({ page }) => {
    await gotoAddCrmForm(page);
    await page.getByRole('button', { name: 'Add Field' }).click();
    const typeModal = page.getByRole('dialog').filter({ hasText: 'Select Field Type' });
    await expect(typeModal.getByRole('button', { name: 'Textfield', exact: true })).toBeVisible();
    await expect(typeModal.getByRole('button', { name: 'Dropdown', exact: true })).toBeVisible();
    await expect(typeModal.getByRole('button', { name: 'Date', exact: true })).toBeVisible();
    await expect(typeModal.getByRole('button', { name: 'Radio', exact: true })).toBeVisible();
    await expect(typeModal.getByRole('button', { name: 'Big Textfield', exact: true })).toBeVisible();
  });

  test('04 Selecting Textfield opens a Configure textfield modal with Field Title and Required', async ({ page }) => {
    await gotoAddCrmForm(page);
    await page.getByRole('button', { name: 'Add Field' }).click();
    await page.getByRole('dialog').filter({ hasText: 'Select Field Type' })
      .getByRole('button', { name: 'Textfield', exact: true }).click();

    const configModal = page.getByRole('dialog').filter({ hasText: 'Configure textfield' });
    await expect(configModal.getByText('Field Title', { exact: true })).toBeVisible();
    await expect(configModal.locator('input[name="title"]')).toBeVisible();
    await expect(configModal.getByText('Required', { exact: true })).toBeVisible();
    await expect(configModal.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
  });

  test('05 Confirming a field adds it to the Form Fields list with its type and Required tags', async ({ page }) => {
    await gotoAddCrmForm(page);
    await addCrmField(page, 'Textfield', 'Customer Name', { required: true });

    const row = crmFieldRowByTitle(page, 'Customer Name');
    await expect(row).toBeVisible();
    await expect(row.getByText('textfield', { exact: true })).toBeVisible();
    await expect(row.getByText('Required', { exact: true })).toBeVisible();
  });

  // ---------------- Mandatory field validation ----------------
  test('06 Save without a Form Name shows "Form name is required"', async ({ page }) => {
    await gotoAddCrmForm(page);
    await addCrmField(page, 'Textfield', 'Customer Name');
    await clickCrmFormSave(page);
    await expect(page.getByText('Form name is required')).toBeVisible();
    await expect(page).toHaveURL(/crm-forms\/add/);
  });

  test('07 Save without any Form Field shows "At least one form field is required"', async ({ page }) => {
    await gotoAddCrmForm(page);
    await fillCrmFormName(page, uniqueFormName());
    await clickCrmFormSave(page);
    await expect(page.getByText('At least one form field is required')).toBeVisible();
    await expect(page).toHaveURL(/crm-forms\/add/);
  });

  test('08 [Form URL has no visible required-marker, but] Save without generating a Form URL is blocked', async ({ page }) => {
    // Neither "Form URL" nor its Generate URL button is marked with a required-field asterisk
    // in the UI, yet Save silently refuses to submit until a URL has been generated.
    await gotoAddCrmForm(page);
    await fillCrmFormName(page, uniqueFormName());
    await addCrmField(page, 'Textfield', 'Customer Name');
    await clickCrmFormSave(page);
    await expect(page.getByText('Please generate a Form URL before saving')).toBeVisible();
    await expect(page).toHaveURL(/crm-forms\/add/);
  });

  // ---------------- Successful creation ----------------
  test('09 Create a CRM form with one required textfield succeeds and appears in the list', async ({ page }) => {
    const name = uniqueFormName();
    await gotoAddCrmForm(page);
    await fillCrmFormName(page, name);
    await addCrmField(page, 'Textfield', 'Customer Name', { required: true });
    await generateCrmFormUrl(page);
    await clickCrmFormSave(page);
    await expectCrmFormSaved(page);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteCrmFormByName(page, name);
  });

  test('10 Newly created form shows a Date Time value in the CRM Forms list', async ({ page }) => {
    const name = uniqueFormName('QA DateChk');
    await gotoAddCrmForm(page);
    await fillCrmFormName(page, name);
    await addCrmField(page, 'Textfield', 'Customer Name');
    await generateCrmFormUrl(page);
    await clickCrmFormSave(page);
    await expectCrmFormSaved(page);

    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row.locator('td').nth(2)).not.toHaveText('—');
    await deleteCrmFormByName(page, name);
  });

  // ---------------- Cancel ----------------
  test('11 Cancel button returns to the CRM Forms list without saving', async ({ page }) => {
    const name = uniqueFormName('QA Cancel');
    await gotoAddCrmForm(page);
    await fillCrmFormName(page, name);
    await addCrmField(page, 'Textfield', 'Customer Name');
    await clickCrmFormCancel(page);
    await expect(page).toHaveURL(/crm-forms$/);
    await searchCrmForms(page, name);
    await expect(page.locator('tr', { hasText: name })).toHaveCount(0);
  });

  // ---------------- Form Name / Field Title field behavior ----------------
  test('12 Form Name is hard-capped at its 100-character limit', async ({ page }) => {
    await gotoAddCrmForm(page);
    const input = page.locator('input[name="form_name"]');
    await input.fill('A'.repeat(110));
    await expect(input).toHaveValue('A'.repeat(100));
    await expect(page.getByText('100 / 100')).toBeVisible();
  });

  test('13 Field Title is hard-capped at its 50-character limit', async ({ page }) => {
    await gotoAddCrmForm(page);
    await page.getByRole('button', { name: 'Add Field' }).click();
    await page.getByRole('dialog').filter({ hasText: 'Select Field Type' })
      .getByRole('button', { name: 'Textfield', exact: true }).click();

    const configModal = page.getByRole('dialog').filter({ hasText: 'Configure textfield' });
    const titleInput = configModal.locator('input[name="title"]');
    await titleInput.fill('B'.repeat(60));
    await expect(titleInput).toHaveValue('B'.repeat(50));
    await expect(configModal.getByText('50 / 50')).toBeVisible();
  });

  // ---------------- Form URL ----------------
  test('14 Generate URL populates the Form URL field with a form link', async ({ page }) => {
    await gotoAddCrmForm(page);
    await generateCrmFormUrl(page);
    const urlInput = page.locator('input[placeholder="Click \'Generate URL\' to create a form link"]');
    await expect(urlInput).toHaveValue(/^https?:\/\/.+\/form\/.+/);
  });

  // ---------------- List / search / view / edit / delete ----------------
  test('15 Search by form name filters the CRM Forms list', async ({ page }) => {
    const name = uniqueFormName('QA Search');
    await gotoAddCrmForm(page);
    await fillCrmFormName(page, name);
    await addCrmField(page, 'Textfield', 'Customer Name');
    await generateCrmFormUrl(page);
    await clickCrmFormSave(page);
    await expectCrmFormSaved(page);

    await searchCrmForms(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteCrmFormByName(page, name);
  });

  test('16 View action shows a preview with the field count and field type/required tags', async ({ page }) => {
    const name = uniqueFormName('QA View');
    await gotoAddCrmForm(page);
    await fillCrmFormName(page, name);
    await addCrmField(page, 'Textfield', 'Customer Name', { required: true });
    await generateCrmFormUrl(page);
    await clickCrmFormSave(page);
    await expectCrmFormSaved(page);

    await searchCrmForms(page, name);
    const row = page.locator('tr', { hasText: name });
    await row.locator('span[aria-label="eye"]').click();

    const preview = page.getByRole('dialog').filter({ hasText: name });
    await expect(preview.getByText('1 field', { exact: true })).toBeVisible();
    await expect(preview.getByText('Customer Name', { exact: true })).toBeVisible();
    await expect(preview.getByText('Required', { exact: true })).toBeVisible();

    await page.keyboard.press('Escape');
    await deleteCrmFormByName(page, name);
  });

  test('17 Edit action opens Edit CRM Form pre-filled with the existing name and fields', async ({ page }) => {
    const name = uniqueFormName('QA Edit');
    await gotoAddCrmForm(page);
    await fillCrmFormName(page, name);
    await addCrmField(page, 'Textfield', 'Customer Name');
    await generateCrmFormUrl(page);
    await clickCrmFormSave(page);
    await expectCrmFormSaved(page);

    await searchCrmForms(page, name);
    const row = page.locator('tr', { hasText: name });
    await row.locator('span[aria-label="edit"]').click();

    await expect(page.getByRole('heading', { name: 'Edit CRM Form' })).toBeVisible();
    await expect(page.locator('input[name="form_name"]')).toHaveValue(name);
    await expect(crmFieldRowByTitle(page, 'Customer Name')).toBeVisible();

    await deleteCrmFormByName(page, name);
  });

  test('18 Delete form functionality removes the form after confirmation', async ({ page }) => {
    const name = uniqueFormName('QA Delete');
    await gotoAddCrmForm(page);
    await fillCrmFormName(page, name);
    await addCrmField(page, 'Textfield', 'Customer Name');
    await generateCrmFormUrl(page);
    await clickCrmFormSave(page);
    await expectCrmFormSaved(page);

    await searchCrmForms(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await row.locator('span[aria-label="delete"]').click();
    await expect(page.getByText('Are you sure you want to delete this form?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(page.getByText('Form deleted')).toBeVisible({ timeout: 15000 });
    await expect(row).toHaveCount(0);
  });

  // ---------------- Known defects ----------------
  test('19 [DEFECT] Deep-linking straight to Add CRM Form misroutes Save to the dashboard, not the CRM Forms list', async ({ page }) => {
    // Expected (per the in-app "Add Form" flow, and this app's other create-pages): after a
    // successful Save, the user is returned to the list page for the thing they just created.
    // Live-verified actual behavior: reaching this page via a direct URL load (e.g. a bookmark,
    // page refresh, or shared link) rather than clicking "Add Form" from the CRM Forms list causes
    // Save to redirect to /client/live-dashboard instead of back to /client/campaign/crm-forms —
    // even though the POST to create the form succeeds and the form IS persisted. Reproduced
    // consistently (not flaky). The user sees no success confirmation and lands on an unrelated
    // page, with no obvious sign their form was actually saved.
    const name = uniqueFormName('QA DeepLink');
    await page.goto('/client/campaign/crm-forms/add');
    await expect(page.locator('input[name="form_name"]')).toBeVisible();
    await fillCrmFormName(page, name);
    await addCrmField(page, 'Textfield', 'Customer Name');
    await generateCrmFormUrl(page);
    await clickCrmFormSave(page);

    await expect(page).toHaveURL(/live-dashboard/, { timeout: 15000 });

    // The form was still actually saved despite the wrong redirect.
    await gotoCrmForms(page);
    await searchCrmForms(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteCrmFormByName(page, name);
  });

  test('20 [DEFECT] Form Name over 30 characters is accepted by the UI\'s 100-char limit but rejected by the database', async ({ page }) => {
    // Expected (per the UI): Form Name allows up to 100 characters — see the "0/100" counter and
    // test 12's hard cap at exactly 100. Any name within that limit should save successfully.
    // Live-verified actual behavior: the backend's crm_forms.form_name database column only fits
    // 30 characters. Bisected live and precise: a 30-char name saves fine, a 31-char name fails
    // every time with a raw, unhandled SQL error surfaced straight to the client — HTTP 400,
    // "SequelizeDatabaseError" / code "ER_DATA_TOO_LONG" / "Data too long for column 'form_name'
    // at row 1" — with the full INSERT statement (including this account's ID and JWT-adjacent
    // internals of the request) echoed back in the response body. Two problems in one: (1) a
    // functional bug — a perfectly reasonable, UI-legal form name silently fails to save with no
    // helpful message, just a generic failure the user can't explain; (2) an information-disclosure
    // concern — raw SQL, column/table names and internal error internals are exposed to the client.
    await gotoAddCrmForm(page);
    const name = 'A'.repeat(50); // well inside the UI's 100-char limit, over the DB's real 30-char limit
    await fillCrmFormName(page, name);
    await addCrmField(page, 'Textfield', 'Customer Name');
    await generateCrmFormUrl(page);

    const respPromise = page.waitForResponse(
      (res) => res.url().includes('/crmForm') && res.request().method() === 'POST'
    );
    await clickCrmFormSave(page);
    const resp = await respPromise;

    expect(resp.status()).toBe(400);
    const bodyText = await resp.text();
    expect(bodyText).toContain('Data too long for column');

    // No success toast, no navigation — the user is left on the form with no clear explanation.
    await expect(page).toHaveURL(/crm-forms\/add/);
  });
});
