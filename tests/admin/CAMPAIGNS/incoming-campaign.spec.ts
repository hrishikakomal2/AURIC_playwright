import { test, expect } from '@playwright/test';
import {
  login,
  gotoCampaignList,
  gotoCreateIncomingCampaign,
  selectCampaignDids,
  selectCampaignCallFlow,
  campaignToggleByLabel,
  clickCampaignSave,
  expectCampaignCreated,
  searchCampaign,
  deleteCampaignByName,
} from '../helpers';

function uniqueCampaignName(prefix = 'QA Auto Incoming') {
  return `${prefix} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** Fills the mandatory fields (name, DID, call flow) using whatever the first available DID/call flow are. */
async function fillMandatory(page: import('@playwright/test').Page, name: string) {
  await page.locator('input[name="campaign_name"]').fill(name);
  await page.locator('div[name="virtual_number_pool"]').click();
  const firstDid = page.locator('.ant-select-item-option').first();
  await expect(firstDid).toBeVisible();
  const didText = (await firstDid.textContent())!.trim();
  await firstDid.click();
  await page.keyboard.press('Escape');
  await selectCampaignCallFlow(page, 'Incoming');
  return didText;
}

test.describe('Campaign — Incoming Campaign', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoCreateIncomingCampaign(page);
  });

  // ---------------- Page load ----------------
  test('01 Create Campaign page loads with Incoming Campaign selected by default', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Incoming Campaign', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Outgoing Campaign', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Blend', exact: true })).toBeVisible();
    await expect(page.locator('input[name="campaign_name"]')).toBeVisible();
    await expect(page.locator('div[name="virtual_number_pool"]')).toBeVisible();
    await expect(page.locator('div[name="ivr_flow"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  });

  test('02 Select DID dropdown lists the available DIDs', async ({ page }) => {
    await page.locator('div[name="virtual_number_pool"]').click();
    const options = page.locator('.ant-select-item-option');
    await expect(options.first()).toBeVisible();
    expect(await options.count()).toBeGreaterThan(0);
  });

  test('03 Select Call flow dropdown lists the available call flows, including "Incoming"', async ({ page }) => {
    await page.locator('div[name="ivr_flow"]').click();
    await expect(page.locator('.ant-select-item-option', { hasText: 'Incoming' })).toBeVisible();
  });

  // ---------------- Mandatory field validation ----------------
  test('04 Create campaign without Campaign Name shows "Name is required"', async ({ page }) => {
    await clickCampaignSave(page);
    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page).toHaveURL(/create-campaign/);
  });

  test('05 Create campaign without selecting DID shows "Select at least one DID"', async ({ page }) => {
    await clickCampaignSave(page);
    await expect(page.getByText('Select at least one DID')).toBeVisible();
  });

  test('06 Create campaign without selecting Call Flow shows "Call flow is required"', async ({ page }) => {
    await clickCampaignSave(page);
    await expect(page.getByText('Call flow is required')).toBeVisible();
  });

  // ---------------- Successful creation ----------------
  test('07 Create an Incoming Campaign with all mandatory fields filled correctly', async ({ page }) => {
    const name = uniqueCampaignName();
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteCampaignByName(page, name);
  });

  test('08 Newly created campaign appears in the Campaign list with status Running', async ({ page }) => {
    const name = uniqueCampaignName('QA Auto ListAppear');
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Running');
    await expect(row).toContainText('Incoming');
    await deleteCampaignByName(page, name);
  });

  test('09 Cancel button returns to the Campaign list without saving', async ({ page }) => {
    await page.locator('input[name="campaign_name"]').fill(uniqueCampaignName('QA Cancel'));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(/campaign-list/);
  });

  // ---------------- Campaign Name field behavior ----------------
  test('10 Campaign Name is hard-capped at its 50-character limit', async ({ page }) => {
    const input = page.locator('input[name="campaign_name"]');
    await input.fill('A'.repeat(60));
    await expect(input).toHaveValue('A'.repeat(50));
    await expect(page.getByText('50 / 50')).toBeVisible();
  });

  test('11 Campaign Name accepts alphanumeric characters', async ({ page }) => {
    const input = page.locator('input[name="campaign_name"]');
    await input.fill('Campaign2026_Test01');
    await expect(input).toHaveValue('Campaign2026_Test01');
  });

  test('12 [DEFECT] Special-characters-only Campaign Name is accepted, not rejected', async ({ page }) => {
    // Expected (per requirements): a validation message when invalid names aren't allowed.
    // Live-verified actual behavior: "@@@###" is accepted outright — the campaign is created
    // with no validation blocking a special-characters-only name.
    const name = '@@@###' + Date.now();
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteCampaignByName(page, name);
  });

  test('13 [CRITICAL DEFECT] Duplicate Campaign Name is not rejected — two campaigns share the same name', async ({ page }) => {
    // Expected (per requirements): duplicate name validation is displayed or save is prevented.
    // Live-verified actual behavior: no duplicate check occurs — Save succeeds and creates a
    // second, independent Running campaign with the exact same name as an existing one.
    const name = uniqueCampaignName('QA Auto Dup');
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);
    await expect(page.locator('tr', { hasText: name })).toHaveCount(1);

    await gotoCreateIncomingCampaign(page);
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);
    await expect(page.locator('tr', { hasText: name })).toHaveCount(2);

    // Clean up both duplicates.
    await deleteCampaignByName(page, name);
    await deleteCampaignByName(page, name);
  });

  test('14 [DEFECT] Leading/trailing spaces in Campaign Name are not trimmed — stored with literal whitespace', async ({ page }) => {
    // Expected (per requirements): spaces are trimmed and the campaign is saved correctly.
    // Live-verified actual behavior: the table cell only *looks* trimmed because HTML collapses
    // whitespace visually — the underlying stored value still has the leading/trailing spaces,
    // as shown by the raw cell text content and by the delete-confirmation dialog echoing them.
    const inner = uniqueCampaignName('QA Spaced');
    const name = `  ${inner}  `;
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);
    const cell = page.locator('td', { hasText: inner });
    await expect(cell).toBeVisible();
    await expect.poll(() => cell.textContent()).toBe(name);
    await deleteCampaignByName(page, inner);
  });

  // ---------------- Security ----------------
  test('15 SQL injection payload in Campaign Name is stored as a literal string, not executed', async ({ page }) => {
    const payload = `' OR 1=1 --${Date.now()}`;
    await fillMandatory(page, payload);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);
    // The payload should be stored as one literal campaign row, not alter query logic.
    await expect(page.locator('tr', { hasText: payload })).toHaveCount(1);
    await deleteCampaignByName(page, payload);
  });

  test('16 XSS payload in Campaign Name is stored/rendered as plain text, not executed', async ({ page }) => {
    const marker = `xss${Date.now()}`;
    const payload = `<script>window.__xss_${marker}=1</script>`;
    await fillMandatory(page, payload);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);
    const fired = await page.evaluate((m) => (window as any)[`__xss_${m}`], marker);
    expect(fired).toBeFalsy();
    await expect(page.locator('tr', { hasText: payload })).toBeVisible();
    await deleteCampaignByName(page, payload);
  });

  // ---------------- Feature toggles ----------------
  test('17 Enable CRM toggle reveals a mandatory "CRM form" field and Display mode option', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable CRM').click();
    await expect(page.getByText('CRM form', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pop-up', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Embedded', exact: true })).toBeVisible();
  });

  test('18 Enable Wrap-up time toggle reveals a "Wrap-up time (seconds)" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Wrap-up time').click();
    await expect(page.getByText('Wrap-up time (seconds)')).toBeVisible();
    await expect(page.getByText('Maximum allowed time is 600 seconds (10 minutes)')).toBeVisible();
  });

  test('19 Enable Disposition toggle reveals a mandatory "Select Disposition" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Disposition').click();
    await expect(page.getByText('Select Disposition', { exact: true })).toBeVisible();
  });

  test('20 Enable Survey feedback toggle reveals a mandatory "Select survey" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Survey feedback').click();
    await expect(page.getByText('Select survey', { exact: true })).toBeVisible();
  });

  test('21 Enable Hold music toggle reveals a mandatory "Select Media" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Hold music').click();
    await expect(page.getByText('Select Media', { exact: true })).toBeVisible();
  });

  test('22 Enable Script toggle reveals a mandatory "Select Script" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Script').click();
    await expect(page.getByText('Select Script', { exact: true })).toBeVisible();
  });

  test('23 Enable Knowledgebase toggle reveals a mandatory "Paste/Type URL" field', async ({ page }) => {
    await campaignToggleByLabel(page, 'Enable Knowledgebase').click();
    await expect(page.getByText('Paste/Type URL', { exact: true })).toBeVisible();
  });

  test('24 SMS and WhatsApp Configuration sections show an "unavailable" warning', async ({ page }) => {
    await expect(page.getByText('End call notification is disabled for your account. This configuration is currently unavailable.').first()).toBeVisible();
    await expect(page.getByText('End call notification is disabled for your account. This configuration is currently unavailable.').last()).toBeVisible();
  });

  // ---------------- List / search / delete ----------------
  test('25 Search by campaign name filters the Campaign list', async ({ page }) => {
    const name = uniqueCampaignName('QA Auto Search');
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);

    await searchCampaign(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteCampaignByName(page, name);
  });

  test('26 Delete campaign functionality removes the campaign after confirmation', async ({ page }) => {
    const name = uniqueCampaignName('QA Auto Delete');
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);

    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await row.locator('.anticon-more').click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Delete campaign?' })).toBeVisible();
    await expect(page.getByText(`Are you sure to delete Campaign "${name}"?`)).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Campaign deleted')).toBeVisible({ timeout: 15000 });
    await expect(row).toHaveCount(0);
  });

  // ---------------- Incoming-specific behavior ----------------
  test('27 [BY DESIGN] An Incoming Campaign\'s Stop/Run toggle cannot be turned off', async ({ page }) => {
    const name = uniqueCampaignName('QA Auto AlwaysOn');
    await fillMandatory(page, name);
    await clickCampaignSave(page);
    await expectCampaignCreated(page);

    const row = page.locator('tr', { hasText: name });
    const toggle = row.locator('button.ant-switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.hover();
    await expect(page.getByText('This Campaign is always active to handle incoming calls and cannot be turned off.')).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true'); // click has no effect

    await deleteCampaignByName(page, name);
  });
});
