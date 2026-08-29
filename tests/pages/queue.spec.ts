import { test, expect } from '@playwright/test';
import {
  login,
  gotoCreateQueue,
  gotoQueueList,
  selectQueueAgents,
  queueToggleByLabel,
  clickQueueSave,
  expectQueueCreated,
  searchQueue,
  deleteQueueByName,
} from './helpers';

function uniqueQueueName(prefix = 'QA Auto Queue') {
  return `${prefix} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

test.describe('Queue (IVR Management > Queue)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoCreateQueue(page);
  });

  // ---------------- Mandatory fields / basic create ----------------

  test('01 Create a queue with all mandatory fields filled correctly', async ({ page }) => {
    const name = uniqueQueueName();
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('02 Queue name field is required — submitting with it empty is blocked', async ({ page }) => {
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await clickQueueSave(page);
    await expect(page.getByText(/Name is required|Queue name is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('03 Queue name accepts up to the documented maximum length of 50', async ({ page }) => {
    const longName = 'A'.repeat(60);
    const input = page.locator('input[name="queue_name"]');
    await input.fill(longName);
    await expect(input).toHaveValue('A'.repeat(50));
    await expect(page.getByText('50 / 50')).toBeVisible();
  });

  test('04 Duplicate queue name is accepted with no warning [DEFECT]', async ({ page }) => {
    // Expected: Save should be blocked with a duplicate-name validation error.
    // Live-verified actual behavior: Save succeeds with no warning, creating a second
    // queue with the same name as an existing one ("max q").
    await page.locator('input[name="queue_name"]').fill('max q');
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, 'max q');
    await expect(page.locator('tr', { hasText: 'max q' })).toHaveCount(2);
    // Clean up the duplicate we just created — delete the most recently created "max q" row.
    const rows = page.locator('tr', { hasText: 'max q' });
    await rows.first().locator('.anticon-delete').click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('tr', { hasText: 'max q' })).toHaveCount(1);
  });

  test('05 Select agents field is required — submitting with no agents selected is blocked', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName());
    await clickQueueSave(page);
    await expect(page.getByText(/Select at least one agent/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('06 Multiple agents can be assigned to a queue', async ({ page }) => {
    const name = uniqueQueueName('QA Auto MultiAgent');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1', 'komal']);
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await deleteQueueByName(page, name);
  });

  // ---------------- Incoming algorithm ----------------

  test('07 Incoming algorithm dropdown offers all documented options', async ({ page }) => {
    await page.locator('div[name="queue_algorithm"] input[role="combobox"]').click();
    for (const opt of ['Even Call Distribution', 'Random', 'Serial Hunting', 'Parallel Ringing', 'Round Robin']) {
      await expect(page.getByRole('option', { name: opt, exact: true })).toBeAttached();
    }
    await page.keyboard.press('Escape');
  });

  test('08 Create a queue with Incoming algorithm = Round Robin', async ({ page }) => {
    const name = uniqueQueueName('QA Auto RoundRobin');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    const algo = page.locator('div[name="queue_algorithm"]');
    await algo.click();
    await algo.locator('input[role="combobox"]').fill('Round Robin');
    await page.getByRole('option', { name: 'Round Robin', exact: true }).click();
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toContainText('Round Robin');
    await deleteQueueByName(page, name);
  });

  // ---------------- Call Handling: Route Call ----------------

  test('09 Call Handling defaults to "Route Call" with Agents attempt = 1 and After Attempts Route To = Voicemail', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Route Call' })).toHaveClass(/ant-btn-primary|active/);
    await expect(page.locator('div[name="queue_attempt"]')).toContainText('1');
    await expect(page.locator('div[name="redirect_to"]')).toContainText('Voicemail');
  });

  test('10 Create a queue with a custom Agents attempt value', async ({ page }) => {
    const name = uniqueQueueName('QA Auto Attempts3');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    const attempt = page.locator('div[name="queue_attempt"]');
    await attempt.click();
    await page.getByRole('option', { name: '3', exact: true }).click();
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await deleteQueueByName(page, name);
  });

  test('11 "After Attempts, Route To" is required for Route Call handling', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName());
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.locator('.ant-select-clear').click({ force: true }).catch(() => {});
    await clickQueueSave(page);
    await expect(page.getByText(/Route To is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  // ---------------- Call Handling: Caller in queue ----------------

  test('12 Switching Call Handling to "Caller in queue" reveals the Caller-in-queue section', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await expect(page.getByText('Queue-Based Custom Music')).toBeVisible();
    await expect(page.locator('div[name="custom_media_id"]')).toBeVisible();
    await expect(page.locator('div[name="announcement_media_id"]')).toBeVisible();
    await expect(page.locator('div[name="queue_attempt"]')).toHaveCount(0);
  });

  test('13 "Select Media" and "Select announcement" are shown as required for Caller-in-queue handling', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await expect(page.getByText('Select Media').locator('..').getByText('*')).toBeVisible();
    await expect(page.getByText('Select announcement').locator('..').getByText('*')).toBeVisible();
  });

  test('14 Toggling "Queue-Based Custom Music" ON enables the Select Media dropdown', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    const media = page.locator('div[name="custom_media_id"]');
    await expect(media).toHaveClass(/disabled/);
    await queueToggleByLabel(page, 'Queue-Based Custom Music').click();
    await expect(media).not.toHaveClass(/disabled/);
  });

  test('15 Toggling "Announcements During queue wait" ON enables the Select announcement dropdown', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    const announcement = page.locator('div[name="announcement_media_id"]');
    await expect(announcement).toHaveClass(/disabled/);
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await expect(announcement).not.toHaveClass(/disabled/);
  });

  test('16 Create a queue with Call Handling = Caller in queue, Custom Music and Announcement configured', async ({ page }) => {
    const name = uniqueQueueName('QA Auto CIQ');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Queue-Based Custom Music').click();
    const media = page.locator('div[name="custom_media_id"]');
    await media.click();
    await page.getByRole('option').first().click();
    await page.keyboard.press('Escape');
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    const announcement = page.locator('div[name="announcement_media_id"]');
    await announcement.click();
    await page.getByRole('option').first().click();
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await deleteQueueByName(page, name);
  });

  // ---------------- Callback Request ----------------

  test('17 "Enable Callback Request" only becomes enabled after "Announcements During queue wait" is toggled ON', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    const callbackToggle = queueToggleByLabel(page, 'Enable Callback Request');
    await expect(callbackToggle).toBeDisabled();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await expect(callbackToggle).toBeEnabled();
  });

  test('18 Enabling Callback Request enables its dependent fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await queueToggleByLabel(page, 'Enable Callback Request').click();
    await expect(page.locator('input[name="callback_timeout"]')).toBeEnabled();
    await expect(page.locator('div[name="callback_disconnect_media_id"]')).not.toHaveClass(/disabled/);
  });

  test('19 Create a queue with Enable Callback Request configured', async ({ page }) => {
    const name = uniqueQueueName('QA Auto Callback');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await page.locator('div[name="announcement_media_id"]').click();
    await page.getByRole('option').first().click();
    await queueToggleByLabel(page, 'Enable Callback Request').click();
    await page.locator('input[name="callback_timeout"]').fill('10');
    await page.locator('div[name="callback_disconnect_media_id"]').click();
    await page.getByRole('option').first().click();
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await deleteQueueByName(page, name);
  });

  test('20 Callback Input Timeout is capped at the documented maximum of 60 seconds', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await queueToggleByLabel(page, 'Enable Callback Request').click();
    const timeout = page.locator('input[name="callback_timeout"]');
    await timeout.fill('90');
    await timeout.blur();
    await expect(timeout).toHaveValue('60');
  });

  // ---------------- Voicebot ----------------

  test('21 "Enable Voicebot" only becomes enabled after "Announcements During queue wait" is toggled ON', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    const voicebotToggle = queueToggleByLabel(page, 'Enable Voicebot');
    await expect(voicebotToggle).toBeDisabled();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await expect(voicebotToggle).toBeEnabled();
  });

  test('22 Enabling Voicebot enables its dependent fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await queueToggleByLabel(page, 'Enable Voicebot').click();
    await expect(page.locator('div[name="voicebot_agent_id"]')).not.toHaveClass(/disabled/);
    await expect(page.locator('div[name="max_wait_threshold"]')).not.toHaveClass(/disabled/);
    await expect(page.locator('div[name="max_queue_threshold"]')).not.toHaveClass(/disabled/);
    await expect(page.locator('textarea[name="voicebot_fallback"]')).toBeEnabled();
  });

  test.skip('23 Create a queue with Enable Voicebot configured [BLOCKED — no voicebot agent in this environment]', async () => {
    // Live-verified: "Select voicebot" has zero options in this AURIC account (no voicebot
    // agent is configured), so the positive flow cannot be executed until one exists.
  });

  test('24 Voicebot fallback message field enforces its documented 500-character limit', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await queueToggleByLabel(page, 'Enable Voicebot').click();
    const fallback = page.locator('textarea[name="voicebot_fallback"]');
    await fallback.fill('A'.repeat(600));
    await expect(fallback).toHaveValue('A'.repeat(500));
    await expect(page.getByText('500 / 500')).toBeVisible();
  });

  // ---------------- Working hours ----------------

  test('25 "Set working hour" toggle reveals the per-day schedule', async ({ page }) => {
    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    await expect(page.getByText('Set Queue availability for each day')).toBeVisible();
    await expect(page.getByText('MON')).toBeVisible();
    await expect(page.getByText('Copy all')).toBeVisible();
    await expect(page.locator('div[name="non_working_music_id"]')).toBeVisible();
  });

  test('26 Create a queue with a working-hour schedule configured for at least one day', async ({ page }) => {
    const name = uniqueQueueName('QA Auto WorkingHour');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    await page.locator('div', { hasText: /^MON/ }).locator('button.ant-switch').first().click();
    await page.locator('div[name="non_working_music_id"]').click();
    await page.getByRole('option').first().click();
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await deleteQueueByName(page, name);
  });

  test('27 "Copy all" propagates one day\'s schedule to all other days', async ({ page }) => {
    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    const monRow = page.locator('div', { hasText: /^MON/ }).first();
    await monRow.locator('button.ant-switch').first().click();
    await page.getByText('Copy all').click();
    const tuesRow = page.locator('div', { hasText: /^TUES/ }).first();
    await expect(tuesRow.locator('button.ant-switch').first()).toHaveAttribute('aria-checked', 'true');
  });

  test('28 "After-Hours Call Routing" toggle can be enabled and configured', async ({ page }) => {
    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    await queueToggleByLabel(page, 'After-Hours Call Routing').click();
    await expect(page.locator('div[name="ciq_redirect_to"], div[name="redirect_to"]').first()).toContainText('Voicemail');
  });

  // ---------------- Form-level behavior ----------------

  test('29 Submitting the Create Queue form completely empty gives no visible error feedback [DEFECT]', async ({ page }) => {
    // Expected: Save blocked with a clear validation error (e.g. "Queue name is required").
    // Live-verified actual behavior: Save IS blocked (no queue created) but there is NO
    // visible error text, red border, or toast anywhere on the page.
    await gotoQueueList(page);
    const countBefore = await page.locator('tbody tr').count();
    await gotoCreateQueue(page);
    await clickQueueSave(page);
    await expect(page).toHaveURL(/add-queue/);
    await expect(page.getByText(/is required/i)).toHaveCount(0);
    await gotoQueueList(page);
    await expect(page.locator('tbody tr')).toHaveCount(countBefore);
  });

  test('30 Cancel button discards the in-progress queue form without creating anything', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill('Discard Me');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page).toHaveURL(/list-queue/);
    await expect(page.locator('tr', { hasText: 'Discard Me' })).toHaveCount(0);
  });
});
