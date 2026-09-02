import { test, expect, Page } from '@playwright/test';
import {
  login,
  gotoCampaignList,
  gotoCreateOutgoingCampaign,
  selectAntOptionByClass,
  campaignToggleByLabel,
  clickCampaignSave,
  expectCampaignCreated,
  setCampaignSchedule,
  uploadCampaignContactList,
  deleteCampaignByName,
  OUTGOING_CAMPAIGN_UPLOAD_FILE,
  OUTGOING_CAMPAIGN_UPLOAD_CUSTOMER_COLUMN,
} from '../helpers';

// The dialer, queue, and uploaded contact list are QA data that will change over time — set via
// .env (OUTGOING_CAMPAIGN_UPLOAD_FILE, OUTGOING_CAMPAIGN_UPLOAD_CUSTOMER_COLUMN) rather than
// hardcoded, so this file doesn't need editing when they do. The upload step is skipped until a
// real file is provided.

const DIALER = 'Preview Manual';
const QUEUE = 'max q';

function uniqueCampaignName(prefix = 'QA Auto Outgoing') {
  return `${prefix} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** Fills the mandatory fields (name, first available DID, dialer, queue) for an Outgoing campaign. */
async function fillMandatory(page: Page, name: string) {
  await page.locator('input[name="campaign_name"]').fill(name);

  await page.locator('div[name="virtual_number_pool"]').click();
  const firstDid = page.locator('.ant-select-item-option').first();
  await expect(firstDid).toBeVisible();
  await firstDid.click();
  await page.keyboard.press('Escape');

  await selectAntOptionByClass(page, 'campaign_type', DIALER);
  await selectAntOptionByClass(page, 'campaign_queue', QUEUE);
}

test.describe('Campaign — Outgoing Campaign (Preview Manual)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoCreateOutgoingCampaign(page);
  });

  test('01 Create Campaign page in Outgoing mode shows Select Dialer and Select Queue instead of Select Call flow', async ({ page }) => {
    await expect(page.locator('input[name="campaign_name"]')).toBeVisible();
    await expect(page.locator('div[name="virtual_number_pool"]')).toBeVisible();
    await expect(page.locator('div[name="campaign_type"]')).toBeVisible();
    await expect(page.locator('div[name="campaign_queue"]')).toBeVisible();
    await expect(page.locator('div[name="ivr_flow"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  });

  test('02 Select Dialer dropdown lists the available dialer modes, including "Preview Manual"', async ({ page }) => {
    await page.locator('div[name="campaign_type"]').click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    await expect(dropdown.locator('.ant-select-item-option', { hasText: DIALER })).toBeVisible();
  });

  test('03 Create an Outgoing Campaign with Preview Manual dialer and all mandatory fields — starts Pending, unlike an Incoming campaign', async ({ page }) => {
    const name = uniqueCampaignName();
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);

    // Unlike an Incoming campaign (Running immediately, always active), a fresh Outgoing
    // campaign has no run schedule yet, so it starts Pending until one is set (see test 04).
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Pending');
    await expect(row).toContainText(DIALER);

    await deleteCampaignByName(page, name);
  });

  test('04 Setting a run schedule via "..." > Set time moves the campaign from Pending to Stopped', async ({ page }) => {
    const name = uniqueCampaignName('QA Auto SetTime');
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);

    const row = page.locator('tr', { hasText: name });
    await expect(row).toContainText('Pending');

    // "Set time" opens a "Schedule Campaign" dialog: Start/End Date and each weekday's
    // Start/End Time all come pre-filled with sensible defaults (today → +7 days, 09:00-18:30,
    // every day enabled) — a campaign needs this schedule set before it will actually run calls.
    await setCampaignSchedule(page, name);

    // Live-verified: scheduling alone does not start the campaign running — status moves from
    // Pending to Stopped, not Running. Actually running it needs a separate action (e.g. the
    // row's Run/Stop toggle), which is out of scope here since it needs a real contact list
    // uploaded first (see test 05).
    await gotoCampaignList(page);
    await expect(page.locator('tr', { hasText: name })).toContainText('Stopped', { timeout: 15000 });

    await deleteCampaignByName(page, name);
  });

  test('05 Uploading a contact list to a scheduled campaign', async ({ page }) => {
    test.skip(
      !OUTGOING_CAMPAIGN_UPLOAD_FILE,
      'Set OUTGOING_CAMPAIGN_UPLOAD_FILE in .env to the contact list file once it is provided.'
    );

    const name = uniqueCampaignName('QA Auto Upload');
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);

    await setCampaignSchedule(page, name);

    // "Upload" navigates to a dedicated "Add Campaign Data" page (not a modal): selecting the
    // file reveals a "Please map the fields" section (which uploaded column is "Customer
    // Number") and a "File Name" field — that field has no visible required-marker but IS
    // enforced on Save (a "Required" error appears under it if left blank). Live-verified this
    // full flow end to end.
    await uploadCampaignContactList(
      page,
      name,
      OUTGOING_CAMPAIGN_UPLOAD_FILE,
      OUTGOING_CAMPAIGN_UPLOAD_CUSTOMER_COLUMN
    );

    await deleteCampaignByName(page, name);
  });

  // ---------------- Feature toggles ----------------
  // Same toggle set as an Incoming campaign, plus two Outgoing-only ones (call retry, DNC).

  // These fields' labels render as a single text node with their required-marker included
  // (e.g. "CRM form *", not "CRM form" + a separate "*") — confirmed live via the accessibility
  // tree — so `exact: true` can never match them; substring matching is used instead.

  test('06 Enable CRM toggle reveals a mandatory "CRM form" field and Display mode option', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable CRM').click();
    // Plain "CRM form" also substring-matches the toggle's own helper text ("Enable to link a
    // CRM form to this campaign") — match the field label's full text ("CRM form *") instead.
    await expect(page.getByText('CRM form *', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Pop-up', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Embedded', exact: true })).toBeVisible();
  });

  test('07 Enable Wrap-up time toggle reveals a "Wrap-up time (seconds)" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Wrap-up time').click();
    await expect(page.getByText('Wrap-up time (seconds)')).toBeVisible();
    await expect(page.getByText('Maximum allowed time is 600 seconds (10 minutes)')).toBeVisible();
  });

  test('08 Enable Disposition toggle reveals a mandatory "Select Disposition" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Disposition').click();
    await expect(page.getByText('Select Disposition')).toBeVisible({ timeout: 15000 });
  });

  test('09 [Outgoing-only] Enable call retry toggle reveals three mandatory retry-tuning fields, all pre-filled with defaults', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable call retry').click();
    await expect(page.getByText('Abandoned Call Retry Interval (Minutes)')).toBeVisible();
    await expect(page.getByText('Failed Call Retry Interval (Minutes)')).toBeVisible();
    await expect(page.getByText('Max Per Day Attempts')).toBeVisible();
  });

  test('10 Enable Survey feedback toggle reveals a mandatory "Select survey" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Survey feedback').click();
    await expect(page.getByText('Select survey')).toBeVisible({ timeout: 15000 });
  });

  test('11 Enable Hold music toggle reveals a mandatory "Select Media" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Hold music').click();
    await expect(page.getByText('Select Media')).toBeVisible({ timeout: 15000 });
  });

  test('12 Enable Script toggle reveals a mandatory "Select Script" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Script').click();
    await expect(page.getByText('Select Script')).toBeVisible({ timeout: 15000 });
  });

  test('13 Enable Knowledgebase toggle reveals a mandatory "Paste/Type URL" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Knowledgebase').click();
    await expect(page.getByText('Paste/Type URL')).toBeVisible({ timeout: 15000 });
  });

  test('14 [Outgoing-only] Enable Do Not Call (DNC) toggle reveals a mandatory "Select DNC list" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Do Not Call (DNC)').click();
    await expect(page.getByText('Select DNC list')).toBeVisible({ timeout: 15000 });
  });
});
