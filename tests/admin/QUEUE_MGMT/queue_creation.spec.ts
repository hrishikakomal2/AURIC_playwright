import { test, expect, Page } from '@playwright/test';
import {
  login,
  gotoCreateQueue,
  gotoQueueList,
  selectQueueAgents,
  clickQueueSave,
  expectQueueCreated,
  searchQueue,
  deleteQueueByName,
  queueToggleByLabel,
} from '../helpers';

function uniqueQueueName(prefix = 'QA Auto Queue') {
  return `${prefix} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** Opens the "Incoming algorithm" combobox and picks `name` (e.g. 'Random', 'Even Call Distribution'). */
async function selectQueueAlgorithm(page: Page, name: string) {
  const algo = page.locator('div[name="queue_algorithm"]');
  const algoCombobox = algo.locator('input[role="combobox"]');
  await algo.click();
  await algoCombobox.fill(name);
  await expect(page.getByRole('option', { name, exact: true })).toBeAttached();
  await algoCombobox.press('Enter');
}

test.describe('Queue (IVR Management > Queue) — Even Call Distribution algorithm', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoCreateQueue(page);
  });

  test('Create a queue with Even Call Distribution algorithm, Route Call handling, custom attempts, and After Attempts Route To = Voicemail', async ({ page }) => {
    const name = uniqueQueueName('QA Auto ECD RouteCall');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Even Call Distribution');

    await page.getByRole('button', { name: 'Route Call' }).click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');

    const attempt = page.locator('div[name="queue_attempt"]');
    await attempt.click();
    await dropdown.locator('.ant-select-item-option', { hasText: '2' }).first().click();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option', { hasText: 'Voicemail' }).first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toContainText('Even Call Distribution');
    await deleteQueueByName(page, name);
  });

  test('Create a queue with multiple agents assigned', async ({ page }) => {
    const name = uniqueQueueName('QA Auto MultiAgent');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1', 'komal']);
    await selectQueueAlgorithm(page, 'Even Call Distribution');
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  for (const attemptValue of ['1', '2', '3', '4', '5']) {
    test(`Create a queue with Agents attempt = ${attemptValue}`, async ({ page }) => {
      const name = uniqueQueueName(`QA Auto Attempt${attemptValue}`);
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Even Call Distribution');

      const attempt = page.locator('div[name="queue_attempt"]');
      await attempt.click();
      // .last() — the "Select agents" dropdown from selectQueueAgents above can still linger in the
      // DOM (not yet marked ant-select-dropdown-hidden) when this opens right after it, so a plain
      // ":not(.ant-select-dropdown-hidden)" match can resolve to that stale dropdown instead of this
      // freshly-mounted one, which is always the most recently appended.
      const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
      await dropdown.locator('.ant-select-item-option').getByText(attemptValue, { exact: true }).click();
      await expect(attempt).toContainText(attemptValue);

      await clickQueueSave(page);
      await expectQueueCreated(page);
      await searchQueue(page, name);
      await expect(page.locator('tr', { hasText: name })).toBeVisible();
      await deleteQueueByName(page, name);
    });
  }

  test('Create a queue with the maximum queue name length (50 characters)', async ({ page }) => {
    // Queue name is capped at 50 chars (input truncates any longer input) — build a name that is
    // exactly 50 chars, still unique via a timestamp+random suffix, padded out with 'X'.
    const name = `QA Auto Max50 ${Date.now()}${Math.floor(Math.random() * 1000)}`.padEnd(50, 'X').slice(0, 50);
    expect(name).toHaveLength(50);

    const input = page.locator('input[name="queue_name"]');
    await input.fill(name);
    await expect(input).toHaveValue(name);
    await expect(page.getByText('50 / 50')).toBeVisible();

    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Even Call Distribution');
    await clickQueueSave(page);
    await expectQueueCreated(page);

    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: Toggling "Set working hour" ON without configuring any day crashes the page instead of showing a validation error [BUG]', async ({ page }) => {
    // Expected: Save should be blocked with a validation error (e.g. "select at least one day"),
    // same as every other required-field gap on this form.
    // Live-verified actual behavior: Save throws an uncaught `ReferenceError: InfoCircleOutlined
    // is not defined` inside QueueForm's bundle — no working day is configured, no working-hour
    // day toggle is turned on — which crashes the React render tree and leaves a blank white
    // page. No API call is made and no queue is created, so there is nothing to clean up.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto WorkingHourCrash'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    await clickQueueSave(page);
    await page.waitForTimeout(1500);

    expect(pageErrors, `Unexpected page error(s): ${pageErrors.join('; ')}`).toHaveLength(0);
    await expect(page.getByRole('heading', { name: 'Create new queue' })).toBeVisible();
  });

  test('Working hours set to the same time for every day (via Copy all) persist correctly on reopening the queue for edit', async ({ page }) => {
    const name = uniqueQueueName('QA Auto WorkingHourPersist');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    const monRow = page.locator('div', { hasText: /^MON/ }).first();
    await monRow.locator('button.ant-switch').first().click();
    await page.getByText('Copy all').click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="non_working_music_id"]').click();
    const mediaOption = dropdown.locator('.ant-select-item-option').first();
    const mediaName = (await mediaOption.innerText()).trim();
    await mediaOption.click();

    await clickQueueSave(page);
    await expectQueueCreated(page);

    // Reopen the queue for edit and verify every value set above came back unchanged.
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await row.locator('.anticon-edit').click();
    await expect(page).toHaveURL(/edit-queue/);

    const whToggle = page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch');
    await expect(whToggle).toHaveAttribute('aria-checked', 'true');

    for (const day of ['MON', 'TUES', 'WED', 'THURS', 'FRI', 'SAT', 'SUN']) {
      const dayRow = page.locator('div', { hasText: new RegExp(`^${day}`) }).first();
      await expect(dayRow.locator('button.ant-switch').first()).toHaveAttribute('aria-checked', 'true');
      // Start/end time render as <input> values, not text content — toContainText can't see them.
      await expect(dayRow.locator('input').nth(0)).toHaveValue('09:00');
      await expect(dayRow.locator('input').nth(1)).toHaveValue('17:00');
    }

    await expect(page.locator('div[name="non_working_music_id"]')).toContainText(mediaName);

    await deleteQueueByName(page, name);
  });

  test('Working hours set to a different time per day persist correctly, per day, on reopening the queue for edit', async ({ page }) => {
    const name = uniqueQueueName('QA Auto WorkingHourDiffTimes');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();

    // Three days, each toggled on with its own distinct start/end time — the rest stay off.
    const schedule: Record<string, { start: string; end: string }> = {
      MON: { start: '08:00', end: '16:00' },
      WED: { start: '10:00', end: '19:00' },
      FRI: { start: '07:30', end: '15:15' },
    };
    for (const [day, { start, end }] of Object.entries(schedule)) {
      const dayRow = page.locator('div', { hasText: new RegExp(`^${day}`) }).first();
      await dayRow.locator('button.ant-switch').first().click();
      const startInput = dayRow.locator('input').nth(0);
      const endInput = dayRow.locator('input').nth(1);
      await startInput.fill(start);
      await page.keyboard.press('Enter');
      await endInput.fill(end);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
    }

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="non_working_music_id"]').click();
    const mediaOption = dropdown.locator('.ant-select-item-option').first();
    const mediaName = (await mediaOption.innerText()).trim();
    await mediaOption.click();

    await clickQueueSave(page);
    await expectQueueCreated(page);

    // Reopen the queue for edit and verify each day's own time came back distinctly — not
    // mixed up with another day's, and days never enabled stayed off.
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await row.locator('.anticon-edit').click();
    await expect(page).toHaveURL(/edit-queue/);

    for (const [day, { start, end }] of Object.entries(schedule)) {
      const dayRow = page.locator('div', { hasText: new RegExp(`^${day}`) }).first();
      await expect(dayRow.locator('button.ant-switch').first()).toHaveAttribute('aria-checked', 'true');
      await expect(dayRow.locator('input').nth(0)).toHaveValue(start);
      await expect(dayRow.locator('input').nth(1)).toHaveValue(end);
    }
    for (const day of ['TUES', 'THURS', 'SAT', 'SUN']) {
      const dayRow = page.locator('div', { hasText: new RegExp(`^${day}`) }).first();
      await expect(dayRow.locator('button.ant-switch').first()).toHaveAttribute('aria-checked', 'false');
    }

    await expect(page.locator('div[name="non_working_music_id"]')).toContainText(mediaName);

    await deleteQueueByName(page, name);
  });

  test('Negative: "Select music...for non-working days & hours" is required once a working day is configured', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative NonWorkingMusic'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    const monRow = page.locator('div', { hasText: /^MON/ }).first();
    await monRow.locator('button.ant-switch').first().click();

    // Leave "Select music to be played during non-working days & hours" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select media to be played during non working days and hours/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Create a queue with After-Hours Call Routing enabled, routed to Voicemail', async ({ page }) => {
    const name = uniqueQueueName('QA Auto AfterHoursVoicemail');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    const monRow = page.locator('div', { hasText: /^MON/ }).first();
    await monRow.locator('button.ant-switch').first().click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="non_working_music_id"]').click();
    await dropdown.locator('.ant-select-item-option').first().click();

    const afterHoursToggle = page
      .locator('div', { hasText: 'After-Hours Call Routing' })
      .filter({ has: page.locator('button.ant-switch') })
      .last()
      .locator('button.ant-switch');
    await afterHoursToggle.click();
    await page.locator('div[name="after_hours_route_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Voicemail', { exact: true }).click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Create a queue with After-Hours Call Routing enabled, routed to Get a Call Back with disconnect media selected', async ({ page }) => {
    const name = uniqueQueueName('QA Auto AfterHoursCallback');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    const monRow = page.locator('div', { hasText: /^MON/ }).first();
    await monRow.locator('button.ant-switch').first().click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="non_working_music_id"]').click();
    await dropdown.locator('.ant-select-item-option').first().click();

    const afterHoursToggle = page
      .locator('div', { hasText: 'After-Hours Call Routing' })
      .filter({ has: page.locator('button.ant-switch') })
      .last()
      .locator('button.ant-switch');
    await afterHoursToggle.click();
    await page.locator('div[name="after_hours_route_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Get a Call Back', { exact: true }).click();

    await page.locator('div[name="after_hours_callback_media_id"]').click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: "After hours call back disconnect media" is required when After-Hours Call Routing is set to Get a Call Back', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative CallbackMedia'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.locator('.qf-shaded-card', { hasText: 'Set working hour' }).locator('button.ant-switch').click();
    const monRow = page.locator('div', { hasText: /^MON/ }).first();
    await monRow.locator('button.ant-switch').first().click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="non_working_music_id"]').click();
    await dropdown.locator('.ant-select-item-option').first().click();

    const afterHoursToggle = page
      .locator('div', { hasText: 'After-Hours Call Routing' })
      .filter({ has: page.locator('button.ant-switch') })
      .last()
      .locator('button.ant-switch');
    await afterHoursToggle.click();
    await page.locator('div[name="after_hours_route_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Get a Call Back', { exact: true }).click();

    // Leave "After hours call back disconnect media" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select after hours callback disconnect media/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Create a queue with Call Handling = Caller in queue, Queue-Based Custom Music enabled and media selected', async ({ page }) => {
    const name = uniqueQueueName('QA Auto CIQ CustomMusic');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();

    const media = page.locator('div[name="custom_media_id"]');
    await expect(media).toHaveClass(/disabled/);
    await queueToggleByLabel(page, 'Queue-Based Custom Music').click();
    await expect(media).not.toHaveClass(/disabled/);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await media.click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Create a queue with the maximum of 5 media files selected for Queue-Based Custom Music', async ({ page }) => {
    const name = uniqueQueueName('QA Auto CIQ Media5');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Queue-Based Custom Music').click();

    const media = page.locator('div[name="custom_media_id"]');
    await media.click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    const options = dropdown.locator('.ant-select-item-option');
    for (let i = 0; i < 5; i++) {
      await options.nth(i).click();
    }
    await page.keyboard.press('Escape');

    await expect(media.locator('.ant-select-selection-item')).toHaveCount(5);

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: A 6th media file for Queue-Based Custom Music is rejected with "Maximum 5 media files allowed"', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative Media6'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Queue-Based Custom Music').click();

    const media = page.locator('div[name="custom_media_id"]');
    await media.click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    const options = dropdown.locator('.ant-select-item-option');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < 6; i++) {
      await options.nth(i).click();
    }

    await expect(page.getByText('Maximum 5 media files allowed')).toBeVisible();
    // The 6th selection must not have been added — still exactly 5 chips.
    await expect(media.locator('.ant-select-selection-item')).toHaveCount(5);
  });

  test('Create a queue with Announcements During queue wait enabled and an announcement selected', async ({ page }) => {
    const name = uniqueQueueName('QA Auto CIQ Announcement');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="announcement_media_id"]').click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: "Select announcement" is required when Announcements During queue wait is enabled', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative AnnouncementRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();

    // Leave "Select announcement" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select an announcement/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('"Callback Input Timeout" only accepts numbers and is capped at the documented maximum of 60 seconds', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await queueToggleByLabel(page, 'Enable Callback Request').click();

    const timeout = page.locator('input[name="callback_timeout"]');

    // Non-numeric input is rejected outright.
    await timeout.fill('');
    await timeout.pressSequentially('abc');
    await expect(timeout).toHaveValue('');

    // A value above the max is clamped down to 60 on blur.
    await timeout.fill('90');
    await timeout.blur();
    await expect(timeout).toHaveValue('60');
  });

  test('Create a queue with Enable Callback Request configured (valid timeout and disconnect media)', async ({ page }) => {
    const name = uniqueQueueName('QA Auto CIQ Callback');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="announcement_media_id"]').click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await queueToggleByLabel(page, 'Enable Callback Request').click();
    await page.locator('input[name="callback_timeout"]').fill('30');
    await page.locator('div[name="callback_disconnect_media_id"]').click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: "Callback Disconnect media" is required when Enable Callback Request is on', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative CallbackDisconnect'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="announcement_media_id"]').click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await queueToggleByLabel(page, 'Enable Callback Request').click();
    await page.locator('input[name="callback_timeout"]').fill('30');

    // Leave "Callback Disconnect media" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select callback disconnect media/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('"Timeout Duration" only accepts numbers and is clamped to the documented 5-1800 second range', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Queue Wait Timeout').click();

    const duration = page.locator('input[name="queue_wait_timeout_duration"]');

    // Non-numeric input is rejected outright.
    await duration.fill('');
    await duration.pressSequentially('abc');
    await expect(duration).toHaveValue('');

    // Below the minimum is clamped up to 5 on blur.
    await duration.fill('2');
    await duration.blur();
    await expect(duration).toHaveValue('5');

    // Above the maximum is clamped down to 1800 on blur.
    await duration.fill('5000');
    await duration.blur();
    await expect(duration).toHaveValue('1800');
  });

  test('Create a queue with Queue Wait Timeout enabled, Timeout Action = Disconnect', async ({ page }) => {
    const name = uniqueQueueName('QA Auto QWT Disconnect');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Queue Wait Timeout').click();
    await page.locator('input[name="queue_wait_timeout_duration"]').fill('300');
    // Timeout Action defaults to "Disconnect" — no extra field required.

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Create a queue with Queue Wait Timeout enabled, Timeout Action = Disconnect with Media', async ({ page }) => {
    const name = uniqueQueueName('QA Auto QWT DiscMedia');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Queue Wait Timeout').click();
    await page.locator('input[name="queue_wait_timeout_duration"]').fill('300');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="queue_wait_timeout_action"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Disconnect with Media', { exact: true }).click();

    await page.locator('div[name="queue_wait_timeout_media_id"]').click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: "Timeout Disconnect Media" is required when Timeout Action is Disconnect with Media', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative TimeoutDisconnectMedia'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Queue Wait Timeout').click();
    await page.locator('input[name="queue_wait_timeout_duration"]').fill('300');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="queue_wait_timeout_action"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Disconnect with Media', { exact: true }).click();

    // Leave "Timeout Disconnect Media" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select timeout disconnect media/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: Duplicate queue names are not allowed', async ({ page }) => {
    // Business rule: no two queues may share the same name — a second Save with a name that
    // already exists must be rejected, and the list must never end up with more than one row for
    // that name. Cleanup runs in `finally` so a failed assertion here still doesn't leave
    // duplicate queues behind for later tests.
    const name = uniqueQueueName('QA Auto NoDup');
    try {
      // First queue with this name.
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Even Call Distribution');
      await clickQueueSave(page);
      await expectQueueCreated(page);

      // Attempt a second queue with the exact same name.
      await gotoCreateQueue(page);
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Even Call Distribution');
      await clickQueueSave(page);

      await gotoQueueList(page);
      await searchQueue(page, name);
      await expect(page.locator('tr', { hasText: name })).toHaveCount(1);
    } finally {
      await gotoQueueList(page);
      await searchQueue(page, name);
      const rows = page.locator('tr', { hasText: name });
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        await rows.first().locator('.anticon-delete').click();
        await page.getByRole('button', { name: 'Yes', exact: true }).click();
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
      }
    }
  });

  test('Create a queue with After Attempts, Route To = Team Lead', async ({ page }) => {
    const name = uniqueQueueName('QA Auto TeamLead');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Even Call Distribution');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option').getByText('Team Lead', { exact: true }).click();

    // Selecting "Team Lead" reveals an additional required "Select team lead" field.
    const teamLead = page.locator('div[name="redirect_value"]');
    await expect(teamLead).toBeVisible();
    await teamLead.click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: Agents already in the queue must not appear in After Attempts, Route To → Agent, and must reappear once removed', async ({ page }) => {
    // Business rule: the "Select agent" dropdown for After Attempts, Route To = Agent must
    // exclude any agent already selected as a queue member, and this filtering must update
    // dynamically — an agent removed from the queue becomes selectable again.
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Even Call Distribution');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option').getByText('Agent', { exact: true }).click();

    const agentField = page.locator('div[name="redirect_value"]');

    // While "Hrishika Komal 1" is a queue member, it must be absent from this dropdown.
    await agentField.click();
    await expect(dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Remove "Hrishika Komal 1" from the queue's agents.
    await page.locator('div[name="selected_agents"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true }).click();
    await page.keyboard.press('Escape');

    // It must now be available again in the Route To → Agent dropdown.
    await agentField.click();
    await expect(dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true })).toBeVisible();
  });

  test('Negative: "Select media" is required when After Attempts, Route To = Disconnect with media', async ({ page }) => {
    // Business rule: Save must be blocked if "Select media" is left empty while Route To =
    // Disconnect with media. Cleanup runs in `finally` since the app currently saves anyway
    // (the defect this test flags), which would otherwise leave a stray queue behind.
    const name = uniqueQueueName('QA Auto Negative MediaRequired');
    try {
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Even Call Distribution');

      const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
      const redirectTo = page.locator('div[name="redirect_to"]');
      await redirectTo.click();
      await dropdown.locator('.ant-select-item-option').getByText('Disconnect with media', { exact: true }).click();

      // Leave "Select media" empty and attempt to save.
      await clickQueueSave(page);

      await expect(page.getByText(/media is required/i)).toBeVisible();
      await expect(page).toHaveURL(/add-queue/);
    } finally {
      await deleteQueueByName(page, name);
    }
  });

  test('Negative: Save is blocked when no agents are selected', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative NoAgents'));
    await selectQueueAlgorithm(page, 'Even Call Distribution');
    await clickQueueSave(page);
    await expect(page.getByText(/Select at least one agent/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: Save is blocked when Queue name is empty', async ({ page }) => {
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await clickQueueSave(page);
    await expect(page.getByText(/Name is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "Select team lead" is required when After Attempts, Route To = Team Lead', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative TeamLeadRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Team Lead', { exact: true }).click();

    // Leave "Select team lead" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select a team lead/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "Select agent" is required when After Attempts, Route To = Agent', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative AgentRouteRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Agent', { exact: true }).click();

    // Leave "Select agent" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select an agent/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "External number" is required when After Attempts, Route To = External Number', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative ExtNumRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('External Number', { exact: true }).click();

    // Leave the number empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/External number is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "External number" must be exactly 10 digits', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative ExtNumDigits'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('External Number', { exact: true }).click();

    const extInput = page.locator('input[name="external_number"]');

    // Non-numeric input is rejected outright.
    await extInput.pressSequentially('abcdefghij');
    await expect(extInput).toHaveValue('');

    // Fewer than 10 digits is flagged once Save is attempted.
    await extInput.fill('12345');
    await clickQueueSave(page);
    await expect(page.getByText(/10 digits required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('"Enable Voicebot" only becomes enabled after Announcements During queue wait is toggled ON', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    const voicebotToggle = queueToggleByLabel(page, 'Enable Voicebot');
    await expect(voicebotToggle).toBeDisabled();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await expect(voicebotToggle).toBeEnabled();
  });

  test('Voicebot fallback message enforces its documented 500-character limit', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await queueToggleByLabel(page, 'Enable Voicebot').click();

    const fallback = page.locator('textarea[name="voicebot_fallback"]');
    await fallback.fill('A'.repeat(600));
    await expect(fallback).toHaveValue('A'.repeat(500));
  });

  test.skip('Create a queue with Enable Voicebot configured [BLOCKED — no voicebot agent in this environment]', () => {
    // Live-verified: "Select voicebot" has zero options in this account (no voicebot agent is
    // configured), so the positive create flow cannot be executed until one exists.
  });

  test('Negative: Save is blocked when "After Attempts, Route To" is cleared for Route Call handling', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative RouteTo'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Even Call Distribution');

    await page.getByRole('button', { name: 'Route Call' }).click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    const attempt = page.locator('div[name="queue_attempt"]');
    await attempt.click();
    await dropdown.locator('.ant-select-item-option', { hasText: '2' }).first().click();

    // Clear the required "After Attempts, Route To" field (defaults to Voicemail) before saving.
    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.locator('.ant-select-clear').click({ force: true });

    await clickQueueSave(page);

    await expect(page.getByText(/Route To is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });
});

test.describe('Queue (IVR Management > Queue) — Random algorithm', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoCreateQueue(page);
  });

  test('Create a queue with Random algorithm, Route Call handling, custom attempts, and After Attempts Route To = Voicemail', async ({ page }) => {
    const name = uniqueQueueName('QA Auto Random RouteCall');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Random');

    await page.getByRole('button', { name: 'Route Call' }).click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');

    const attempt = page.locator('div[name="queue_attempt"]');
    await attempt.click();
    await dropdown.locator('.ant-select-item-option', { hasText: '2' }).first().click();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option', { hasText: 'Voicemail' }).first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toContainText('Random');
    await deleteQueueByName(page, name);
  });

  test('Create a queue with multiple agents assigned', async ({ page }) => {
    const name = uniqueQueueName('QA Auto MultiAgent');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1', 'komal']);
    await selectQueueAlgorithm(page, 'Random');
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  for (const attemptValue of ['1', '2', '3', '4', '5']) {
    test(`Create a queue with Agents attempt = ${attemptValue}`, async ({ page }) => {
      const name = uniqueQueueName(`QA Auto Attempt${attemptValue}`);
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Random');

      const attempt = page.locator('div[name="queue_attempt"]');
      await attempt.click();
      // .last() — the "Select agents" dropdown from selectQueueAgents above can still linger in the
      // DOM (not yet marked ant-select-dropdown-hidden) when this opens right after it, so a plain
      // ":not(.ant-select-dropdown-hidden)" match can resolve to that stale dropdown instead of this
      // freshly-mounted one, which is always the most recently appended.
      const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
      await dropdown.locator('.ant-select-item-option').getByText(attemptValue, { exact: true }).click();
      await expect(attempt).toContainText(attemptValue);

      await clickQueueSave(page);
      await expectQueueCreated(page);
      await searchQueue(page, name);
      await expect(page.locator('tr', { hasText: name })).toBeVisible();
      await deleteQueueByName(page, name);
    });
  }

  test('Create a queue with the maximum queue name length (50 characters)', async ({ page }) => {
    // Queue name is capped at 50 chars (input truncates any longer input) — build a name that is
    // exactly 50 chars, still unique via a timestamp+random suffix, padded out with 'X'.
    const name = `QA Auto Max50 ${Date.now()}${Math.floor(Math.random() * 1000)}`.padEnd(50, 'X').slice(0, 50);
    expect(name).toHaveLength(50);

    const input = page.locator('input[name="queue_name"]');
    await input.fill(name);
    await expect(input).toHaveValue(name);
    await expect(page.getByText('50 / 50')).toBeVisible();

    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Random');
    await clickQueueSave(page);
    await expectQueueCreated(page);

    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: Duplicate queue names are not allowed', async ({ page }) => {
    // Business rule: no two queues may share the same name — a second Save with a name that
    // already exists must be rejected, and the list must never end up with more than one row for
    // that name. Cleanup runs in `finally` so a failed assertion here still doesn't leave
    // duplicate queues behind for later tests.
    const name = uniqueQueueName('QA Auto NoDup');
    try {
      // First queue with this name.
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Random');
      await clickQueueSave(page);
      await expectQueueCreated(page);

      // Attempt a second queue with the exact same name.
      await gotoCreateQueue(page);
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Random');
      await clickQueueSave(page);

      await gotoQueueList(page);
      await searchQueue(page, name);
      await expect(page.locator('tr', { hasText: name })).toHaveCount(1);
    } finally {
      await gotoQueueList(page);
      await searchQueue(page, name);
      const rows = page.locator('tr', { hasText: name });
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        await rows.first().locator('.anticon-delete').click();
        await page.getByRole('button', { name: 'Yes', exact: true }).click();
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
      }
    }
  });

  test('Create a queue with After Attempts, Route To = Team Lead', async ({ page }) => {
    const name = uniqueQueueName('QA Auto TeamLead');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Random');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option').getByText('Team Lead', { exact: true }).click();

    // Selecting "Team Lead" reveals an additional required "Select team lead" field.
    const teamLead = page.locator('div[name="redirect_value"]');
    await expect(teamLead).toBeVisible();
    await teamLead.click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: Agents already in the queue must not appear in After Attempts, Route To → Agent, and must reappear once removed', async ({ page }) => {
    // Business rule: the "Select agent" dropdown for After Attempts, Route To = Agent must
    // exclude any agent already selected as a queue member, and this filtering must update
    // dynamically — an agent removed from the queue becomes selectable again.
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Random');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option').getByText('Agent', { exact: true }).click();

    const agentField = page.locator('div[name="redirect_value"]');

    // While "Hrishika Komal 1" is a queue member, it must be absent from this dropdown.
    await agentField.click();
    await expect(dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Remove "Hrishika Komal 1" from the queue's agents.
    await page.locator('div[name="selected_agents"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true }).click();
    await page.keyboard.press('Escape');

    // It must now be available again in the Route To → Agent dropdown.
    await agentField.click();
    await expect(dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true })).toBeVisible();
  });

  test('Negative: "Select media" is required when After Attempts, Route To = Disconnect with media', async ({ page }) => {
    // Business rule: Save must be blocked if "Select media" is left empty while Route To =
    // Disconnect with media. Cleanup runs in `finally` since the app currently saves anyway
    // (the defect this test flags), which would otherwise leave a stray queue behind.
    const name = uniqueQueueName('QA Auto Negative MediaRequired');
    try {
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Random');

      const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
      const redirectTo = page.locator('div[name="redirect_to"]');
      await redirectTo.click();
      await dropdown.locator('.ant-select-item-option').getByText('Disconnect with media', { exact: true }).click();

      // Leave "Select media" empty and attempt to save.
      await clickQueueSave(page);

      await expect(page.getByText(/media is required/i)).toBeVisible();
      await expect(page).toHaveURL(/add-queue/);
    } finally {
      await deleteQueueByName(page, name);
    }
  });

  test('Negative: Save is blocked when no agents are selected', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative NoAgents'));
    await selectQueueAlgorithm(page, 'Random');
    await clickQueueSave(page);
    await expect(page.getByText(/Select at least one agent/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: Save is blocked when Queue name is empty', async ({ page }) => {
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await clickQueueSave(page);
    await expect(page.getByText(/Name is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "Select team lead" is required when After Attempts, Route To = Team Lead', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative TeamLeadRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Team Lead', { exact: true }).click();

    // Leave "Select team lead" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select a team lead/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "Select agent" is required when After Attempts, Route To = Agent', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative AgentRouteRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Agent', { exact: true }).click();

    // Leave "Select agent" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select an agent/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "External number" is required when After Attempts, Route To = External Number', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative ExtNumRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('External Number', { exact: true }).click();

    // Leave the number empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/External number is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "External number" must be exactly 10 digits', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative ExtNumDigits'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('External Number', { exact: true }).click();

    const extInput = page.locator('input[name="external_number"]');

    // Non-numeric input is rejected outright.
    await extInput.pressSequentially('abcdefghij');
    await expect(extInput).toHaveValue('');

    // Fewer than 10 digits is flagged once Save is attempted.
    await extInput.fill('12345');
    await clickQueueSave(page);
    await expect(page.getByText(/10 digits required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('"Enable Voicebot" only becomes enabled after Announcements During queue wait is toggled ON', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    const voicebotToggle = queueToggleByLabel(page, 'Enable Voicebot');
    await expect(voicebotToggle).toBeDisabled();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await expect(voicebotToggle).toBeEnabled();
  });

  test('Voicebot fallback message enforces its documented 500-character limit', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await queueToggleByLabel(page, 'Enable Voicebot').click();

    const fallback = page.locator('textarea[name="voicebot_fallback"]');
    await fallback.fill('A'.repeat(600));
    await expect(fallback).toHaveValue('A'.repeat(500));
  });

  test.skip('Create a queue with Enable Voicebot configured [BLOCKED — no voicebot agent in this environment]', () => {
    // Live-verified: "Select voicebot" has zero options in this account (no voicebot agent is
    // configured), so the positive create flow cannot be executed until one exists.
  });

  test('Negative: Save is blocked when "After Attempts, Route To" is cleared for Route Call handling', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative RouteTo'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Random');

    await page.getByRole('button', { name: 'Route Call' }).click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    const attempt = page.locator('div[name="queue_attempt"]');
    await attempt.click();
    await dropdown.locator('.ant-select-item-option', { hasText: '2' }).first().click();

    // Clear the required "After Attempts, Route To" field (defaults to Voicemail) before saving.
    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.locator('.ant-select-clear').click({ force: true });

    await clickQueueSave(page);

    await expect(page.getByText(/Route To is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });
});

test.describe('Queue (IVR Management > Queue) — Serial Hunting algorithm', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoCreateQueue(page);
  });

  test('Create a queue with Serial Hunting algorithm, Route Call handling, custom attempts, and After Attempts Route To = Voicemail', async ({ page }) => {
    const name = uniqueQueueName('QA Auto SerialHunting RouteCall');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Serial Hunting');

    await page.getByRole('button', { name: 'Route Call' }).click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');

    const attempt = page.locator('div[name="queue_attempt"]');
    await attempt.click();
    await dropdown.locator('.ant-select-item-option', { hasText: '2' }).first().click();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option', { hasText: 'Voicemail' }).first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toContainText('Serial Hunting');
    await deleteQueueByName(page, name);
  });

  test('Create a queue with multiple agents assigned', async ({ page }) => {
    const name = uniqueQueueName('QA Auto MultiAgent');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1', 'komal']);
    await selectQueueAlgorithm(page, 'Serial Hunting');
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  for (const attemptValue of ['1', '2', '3', '4', '5']) {
    test(`Create a queue with Agents attempt = ${attemptValue}`, async ({ page }) => {
      const name = uniqueQueueName(`QA Auto Attempt${attemptValue}`);
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Serial Hunting');

      const attempt = page.locator('div[name="queue_attempt"]');
      await attempt.click();
      // .last() — the "Select agents" dropdown from selectQueueAgents above can still linger in the
      // DOM (not yet marked ant-select-dropdown-hidden) when this opens right after it, so a plain
      // ":not(.ant-select-dropdown-hidden)" match can resolve to that stale dropdown instead of this
      // freshly-mounted one, which is always the most recently appended.
      const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
      await dropdown.locator('.ant-select-item-option').getByText(attemptValue, { exact: true }).click();
      await expect(attempt).toContainText(attemptValue);

      await clickQueueSave(page);
      await expectQueueCreated(page);
      await searchQueue(page, name);
      await expect(page.locator('tr', { hasText: name })).toBeVisible();
      await deleteQueueByName(page, name);
    });
  }

  test('Create a queue with the maximum queue name length (50 characters)', async ({ page }) => {
    // Queue name is capped at 50 chars (input truncates any longer input) — build a name that is
    // exactly 50 chars, still unique via a timestamp+random suffix, padded out with 'X'.
    const name = `QA Auto Max50 ${Date.now()}${Math.floor(Math.random() * 1000)}`.padEnd(50, 'X').slice(0, 50);
    expect(name).toHaveLength(50);

    const input = page.locator('input[name="queue_name"]');
    await input.fill(name);
    await expect(input).toHaveValue(name);
    await expect(page.getByText('50 / 50')).toBeVisible();

    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Serial Hunting');
    await clickQueueSave(page);
    await expectQueueCreated(page);

    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: Duplicate queue names are not allowed', async ({ page }) => {
    // Business rule: no two queues may share the same name — a second Save with a name that
    // already exists must be rejected, and the list must never end up with more than one row for
    // that name. Cleanup runs in `finally` so a failed assertion here still doesn't leave
    // duplicate queues behind for later tests.
    const name = uniqueQueueName('QA Auto NoDup');
    try {
      // First queue with this name.
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Serial Hunting');
      await clickQueueSave(page);
      await expectQueueCreated(page);

      // Attempt a second queue with the exact same name.
      await gotoCreateQueue(page);
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Serial Hunting');
      await clickQueueSave(page);

      await gotoQueueList(page);
      await searchQueue(page, name);
      await expect(page.locator('tr', { hasText: name })).toHaveCount(1);
    } finally {
      await gotoQueueList(page);
      await searchQueue(page, name);
      const rows = page.locator('tr', { hasText: name });
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        await rows.first().locator('.anticon-delete').click();
        await page.getByRole('button', { name: 'Yes', exact: true }).click();
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
      }
    }
  });

  test('Create a queue with After Attempts, Route To = Team Lead', async ({ page }) => {
    const name = uniqueQueueName('QA Auto TeamLead');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Serial Hunting');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option').getByText('Team Lead', { exact: true }).click();

    // Selecting "Team Lead" reveals an additional required "Select team lead" field.
    const teamLead = page.locator('div[name="redirect_value"]');
    await expect(teamLead).toBeVisible();
    await teamLead.click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: Agents already in the queue must not appear in After Attempts, Route To → Agent, and must reappear once removed', async ({ page }) => {
    // Business rule: the "Select agent" dropdown for After Attempts, Route To = Agent must
    // exclude any agent already selected as a queue member, and this filtering must update
    // dynamically — an agent removed from the queue becomes selectable again.
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Serial Hunting');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option').getByText('Agent', { exact: true }).click();

    const agentField = page.locator('div[name="redirect_value"]');

    // While "Hrishika Komal 1" is a queue member, it must be absent from this dropdown.
    await agentField.click();
    await expect(dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Remove "Hrishika Komal 1" from the queue's agents.
    await page.locator('div[name="selected_agents"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true }).click();
    await page.keyboard.press('Escape');

    // It must now be available again in the Route To → Agent dropdown.
    await agentField.click();
    await expect(dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true })).toBeVisible();
  });

  test('Negative: "Select media" is required when After Attempts, Route To = Disconnect with media', async ({ page }) => {
    // Business rule: Save must be blocked if "Select media" is left empty while Route To =
    // Disconnect with media. Cleanup runs in `finally` since the app currently saves anyway
    // (the defect this test flags), which would otherwise leave a stray queue behind.
    const name = uniqueQueueName('QA Auto Negative MediaRequired');
    try {
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Serial Hunting');

      const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
      const redirectTo = page.locator('div[name="redirect_to"]');
      await redirectTo.click();
      await dropdown.locator('.ant-select-item-option').getByText('Disconnect with media', { exact: true }).click();

      // Leave "Select media" empty and attempt to save.
      await clickQueueSave(page);

      await expect(page.getByText(/media is required/i)).toBeVisible();
      await expect(page).toHaveURL(/add-queue/);
    } finally {
      await deleteQueueByName(page, name);
    }
  });

  test('Negative: Save is blocked when no agents are selected', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative NoAgents'));
    await selectQueueAlgorithm(page, 'Serial Hunting');
    await clickQueueSave(page);
    await expect(page.getByText(/Select at least one agent/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: Save is blocked when Queue name is empty', async ({ page }) => {
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await clickQueueSave(page);
    await expect(page.getByText(/Name is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "Select team lead" is required when After Attempts, Route To = Team Lead', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative TeamLeadRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Team Lead', { exact: true }).click();

    // Leave "Select team lead" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select a team lead/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "Select agent" is required when After Attempts, Route To = Agent', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative AgentRouteRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Agent', { exact: true }).click();

    // Leave "Select agent" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select an agent/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "External number" is required when After Attempts, Route To = External Number', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative ExtNumRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('External Number', { exact: true }).click();

    // Leave the number empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/External number is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "External number" must be exactly 10 digits', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative ExtNumDigits'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('External Number', { exact: true }).click();

    const extInput = page.locator('input[name="external_number"]');

    // Non-numeric input is rejected outright.
    await extInput.pressSequentially('abcdefghij');
    await expect(extInput).toHaveValue('');

    // Fewer than 10 digits is flagged once Save is attempted.
    await extInput.fill('12345');
    await clickQueueSave(page);
    await expect(page.getByText(/10 digits required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('"Enable Voicebot" only becomes enabled after Announcements During queue wait is toggled ON', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    const voicebotToggle = queueToggleByLabel(page, 'Enable Voicebot');
    await expect(voicebotToggle).toBeDisabled();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await expect(voicebotToggle).toBeEnabled();
  });

  test('Voicebot fallback message enforces its documented 500-character limit', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await queueToggleByLabel(page, 'Enable Voicebot').click();

    const fallback = page.locator('textarea[name="voicebot_fallback"]');
    await fallback.fill('A'.repeat(600));
    await expect(fallback).toHaveValue('A'.repeat(500));
  });

  test.skip('Create a queue with Enable Voicebot configured [BLOCKED — no voicebot agent in this environment]', () => {
    // Live-verified: "Select voicebot" has zero options in this account (no voicebot agent is
    // configured), so the positive create flow cannot be executed until one exists.
  });

  test('Negative: Save is blocked when "After Attempts, Route To" is cleared for Route Call handling', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative RouteTo'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Serial Hunting');

    await page.getByRole('button', { name: 'Route Call' }).click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    const attempt = page.locator('div[name="queue_attempt"]');
    await attempt.click();
    await dropdown.locator('.ant-select-item-option', { hasText: '2' }).first().click();

    // Clear the required "After Attempts, Route To" field (defaults to Voicemail) before saving.
    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.locator('.ant-select-clear').click({ force: true });

    await clickQueueSave(page);

    await expect(page.getByText(/Route To is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });
});

test.describe('Queue (IVR Management > Queue) — Parallel Ringing algorithm', () => {
  // Parallel Ringing is a superadmin-gated feature: only accounts a superadmin has granted
  // permission to should be able to select and use it — everyone else should never see it as an
  // option at all. On this account, permission is OFF, so this suite verifies both halves of
  // that rule instead of the full 14-test create/negative battery the other algorithms get
  // (creating a queue with this algorithm cannot succeed here by design).
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoCreateQueue(page);
  });

  test('Negative: "Parallel Ringing" must be hidden from the Incoming algorithm dropdown when not permitted for this account', async ({ page }) => {
    // Business rule: an account without superadmin permission for Parallel Ringing should never
    // see it as a selectable option. Live-verified: it currently still appears in the dropdown.
    // Uses the antd option class rather than role=option — this dropdown's virtual-scroll list
    // only assigns role="option" to the currently-rendered viewport window (confirmed live: with
    // all 5 algorithms unfiltered, only the first 2 exposed role="option" at all), so role-based
    // lookups on later items report absent regardless of what is actually shown.
    const algo = page.locator('div[name="queue_algorithm"]');
    await algo.click();
    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await expect(dropdown.locator('.ant-select-item-option').getByText('Parallel Ringing', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('Save is blocked with "Parallel ringing is not enabled for your account" when selected without permission', async ({ page }) => {
    // Confirms the backend correctly refuses to create a queue with this algorithm while it is
    // not permitted, even though (per the test above) the frontend still lets it be selected.
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto ParallelRinging Blocked'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Parallel Ringing');

    await clickQueueSave(page);

    await expect(page.getByText('Parallel ringing is not enabled for your account')).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });
});

test.describe('Queue (IVR Management > Queue) — Round Robin algorithm', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await gotoCreateQueue(page);
  });

  test('Create a queue with Round Robin algorithm, Route Call handling, custom attempts, and After Attempts Route To = Voicemail', async ({ page }) => {
    const name = uniqueQueueName('QA Auto RoundRobin RouteCall');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Round Robin');

    await page.getByRole('button', { name: 'Route Call' }).click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');

    const attempt = page.locator('div[name="queue_attempt"]');
    await attempt.click();
    await dropdown.locator('.ant-select-item-option', { hasText: '2' }).first().click();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option', { hasText: 'Voicemail' }).first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toContainText('Round Robin');
    await deleteQueueByName(page, name);
  });

  test('Create a queue with multiple agents assigned', async ({ page }) => {
    const name = uniqueQueueName('QA Auto MultiAgent');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1', 'komal']);
    await selectQueueAlgorithm(page, 'Round Robin');
    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  for (const attemptValue of ['1', '2', '3', '4', '5']) {
    test(`Create a queue with Agents attempt = ${attemptValue}`, async ({ page }) => {
      const name = uniqueQueueName(`QA Auto Attempt${attemptValue}`);
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Round Robin');

      const attempt = page.locator('div[name="queue_attempt"]');
      await attempt.click();
      // .last() — the "Select agents" dropdown from selectQueueAgents above can still linger in the
      // DOM (not yet marked ant-select-dropdown-hidden) when this opens right after it, so a plain
      // ":not(.ant-select-dropdown-hidden)" match can resolve to that stale dropdown instead of this
      // freshly-mounted one, which is always the most recently appended.
      const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
      await dropdown.locator('.ant-select-item-option').getByText(attemptValue, { exact: true }).click();
      await expect(attempt).toContainText(attemptValue);

      await clickQueueSave(page);
      await expectQueueCreated(page);
      await searchQueue(page, name);
      await expect(page.locator('tr', { hasText: name })).toBeVisible();
      await deleteQueueByName(page, name);
    });
  }

  test('Create a queue with the maximum queue name length (50 characters)', async ({ page }) => {
    // Queue name is capped at 50 chars (input truncates any longer input) — build a name that is
    // exactly 50 chars, still unique via a timestamp+random suffix, padded out with 'X'.
    const name = `QA Auto Max50 ${Date.now()}${Math.floor(Math.random() * 1000)}`.padEnd(50, 'X').slice(0, 50);
    expect(name).toHaveLength(50);

    const input = page.locator('input[name="queue_name"]');
    await input.fill(name);
    await expect(input).toHaveValue(name);
    await expect(page.getByText('50 / 50')).toBeVisible();

    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Round Robin');
    await clickQueueSave(page);
    await expectQueueCreated(page);

    await searchQueue(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: Duplicate queue names are not allowed', async ({ page }) => {
    // Business rule: no two queues may share the same name — a second Save with a name that
    // already exists must be rejected, and the list must never end up with more than one row for
    // that name. Cleanup runs in `finally` so a failed assertion here still doesn't leave
    // duplicate queues behind for later tests.
    const name = uniqueQueueName('QA Auto NoDup');
    try {
      // First queue with this name.
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Round Robin');
      await clickQueueSave(page);
      await expectQueueCreated(page);

      // Attempt a second queue with the exact same name.
      await gotoCreateQueue(page);
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Round Robin');
      await clickQueueSave(page);

      await gotoQueueList(page);
      await searchQueue(page, name);
      await expect(page.locator('tr', { hasText: name })).toHaveCount(1);
    } finally {
      await gotoQueueList(page);
      await searchQueue(page, name);
      const rows = page.locator('tr', { hasText: name });
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        await rows.first().locator('.anticon-delete').click();
        await page.getByRole('button', { name: 'Yes', exact: true }).click();
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
      }
    }
  });

  test('Create a queue with After Attempts, Route To = Team Lead', async ({ page }) => {
    const name = uniqueQueueName('QA Auto TeamLead');
    await page.locator('input[name="queue_name"]').fill(name);
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Round Robin');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option').getByText('Team Lead', { exact: true }).click();

    // Selecting "Team Lead" reveals an additional required "Select team lead" field.
    const teamLead = page.locator('div[name="redirect_value"]');
    await expect(teamLead).toBeVisible();
    await teamLead.click();
    await dropdown.locator('.ant-select-item-option').first().click();

    await clickQueueSave(page);
    await expectQueueCreated(page);
    await searchQueue(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await deleteQueueByName(page, name);
  });

  test('Negative: Agents already in the queue must not appear in After Attempts, Route To → Agent, and must reappear once removed', async ({ page }) => {
    // Business rule: the "Select agent" dropdown for After Attempts, Route To = Agent must
    // exclude any agent already selected as a queue member, and this filtering must update
    // dynamically — an agent removed from the queue becomes selectable again.
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Round Robin');

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();

    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.click();
    await dropdown.locator('.ant-select-item-option').getByText('Agent', { exact: true }).click();

    const agentField = page.locator('div[name="redirect_value"]');

    // While "Hrishika Komal 1" is a queue member, it must be absent from this dropdown.
    await agentField.click();
    await expect(dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Remove "Hrishika Komal 1" from the queue's agents.
    await page.locator('div[name="selected_agents"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true }).click();
    await page.keyboard.press('Escape');

    // It must now be available again in the Route To → Agent dropdown.
    await agentField.click();
    await expect(dropdown.locator('.ant-select-item-option').getByText('Hrishika Komal 1', { exact: true })).toBeVisible();
  });

  test('Negative: "Select media" is required when After Attempts, Route To = Disconnect with media', async ({ page }) => {
    // Business rule: Save must be blocked if "Select media" is left empty while Route To =
    // Disconnect with media. Cleanup runs in `finally` since the app currently saves anyway
    // (the defect this test flags), which would otherwise leave a stray queue behind.
    const name = uniqueQueueName('QA Auto Negative MediaRequired');
    try {
      await page.locator('input[name="queue_name"]').fill(name);
      await selectQueueAgents(page, ['Hrishika Komal 1']);
      await selectQueueAlgorithm(page, 'Round Robin');

      const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
      const redirectTo = page.locator('div[name="redirect_to"]');
      await redirectTo.click();
      await dropdown.locator('.ant-select-item-option').getByText('Disconnect with media', { exact: true }).click();

      // Leave "Select media" empty and attempt to save.
      await clickQueueSave(page);

      await expect(page.getByText(/media is required/i)).toBeVisible();
      await expect(page).toHaveURL(/add-queue/);
    } finally {
      await deleteQueueByName(page, name);
    }
  });

  test('Negative: Save is blocked when no agents are selected', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative NoAgents'));
    await selectQueueAlgorithm(page, 'Round Robin');
    await clickQueueSave(page);
    await expect(page.getByText(/Select at least one agent/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: Save is blocked when Queue name is empty', async ({ page }) => {
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await clickQueueSave(page);
    await expect(page.getByText(/Name is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "Select team lead" is required when After Attempts, Route To = Team Lead', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative TeamLeadRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Team Lead', { exact: true }).click();

    // Leave "Select team lead" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select a team lead/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "Select agent" is required when After Attempts, Route To = Agent', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative AgentRouteRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('Agent', { exact: true }).click();

    // Leave "Select agent" empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/Please select an agent/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "External number" is required when After Attempts, Route To = External Number', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative ExtNumRequired'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('External Number', { exact: true }).click();

    // Leave the number empty and attempt to save.
    await clickQueueSave(page);

    await expect(page.getByText(/External number is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('Negative: "External number" must be exactly 10 digits', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative ExtNumDigits'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last();
    await page.locator('div[name="redirect_to"]').click();
    await dropdown.locator('.ant-select-item-option').getByText('External Number', { exact: true }).click();

    const extInput = page.locator('input[name="external_number"]');

    // Non-numeric input is rejected outright.
    await extInput.pressSequentially('abcdefghij');
    await expect(extInput).toHaveValue('');

    // Fewer than 10 digits is flagged once Save is attempted.
    await extInput.fill('12345');
    await clickQueueSave(page);
    await expect(page.getByText(/10 digits required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });

  test('"Enable Voicebot" only becomes enabled after Announcements During queue wait is toggled ON', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    const voicebotToggle = queueToggleByLabel(page, 'Enable Voicebot');
    await expect(voicebotToggle).toBeDisabled();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await expect(voicebotToggle).toBeEnabled();
  });

  test('Voicebot fallback message enforces its documented 500-character limit', async ({ page }) => {
    await page.getByRole('button', { name: 'Caller in queue' }).click();
    await queueToggleByLabel(page, 'Announcements During queue wait').click();
    await queueToggleByLabel(page, 'Enable Voicebot').click();

    const fallback = page.locator('textarea[name="voicebot_fallback"]');
    await fallback.fill('A'.repeat(600));
    await expect(fallback).toHaveValue('A'.repeat(500));
  });

  test.skip('Create a queue with Enable Voicebot configured [BLOCKED — no voicebot agent in this environment]', () => {
    // Live-verified: "Select voicebot" has zero options in this account (no voicebot agent is
    // configured), so the positive create flow cannot be executed until one exists.
  });

  test('Negative: Save is blocked when "After Attempts, Route To" is cleared for Route Call handling', async ({ page }) => {
    await page.locator('input[name="queue_name"]').fill(uniqueQueueName('QA Auto Negative RouteTo'));
    await selectQueueAgents(page, ['Hrishika Komal 1']);
    await selectQueueAlgorithm(page, 'Round Robin');

    await page.getByRole('button', { name: 'Route Call' }).click();

    const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    const attempt = page.locator('div[name="queue_attempt"]');
    await attempt.click();
    await dropdown.locator('.ant-select-item-option', { hasText: '2' }).first().click();

    // Clear the required "After Attempts, Route To" field (defaults to Voicemail) before saving.
    const redirectTo = page.locator('div[name="redirect_to"]');
    await redirectTo.locator('.ant-select-clear').click({ force: true });

    await clickQueueSave(page);

    await expect(page.getByText(/Route To is required/i)).toBeVisible();
    await expect(page).toHaveURL(/add-queue/);
  });
});
