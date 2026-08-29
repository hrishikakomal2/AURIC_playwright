import { test, expect } from '@playwright/test';
import {
  login,
  gotoDispositions,
  gotoAddDisposition,
  dispositionRootInput,
  dispositionNodeByLabel,
  addDispositionRootChild,
  addDispositionChild,
  deleteDispositionNode,
  clickDispositionSave,
  clickDispositionCancel,
  clickDispositionReset,
  expectDispositionCreated,
  expectDispositionUpdated,
  searchDispositions,
  deleteDispositionByName,
} from './helpers';

function uniqueDispositionName(prefix = 'QA Disp') {
  const suffix = Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
  return `${prefix} ${suffix}`.slice(0, 50);
}

test.describe('Campaign — Dispositions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ---------------- Page load ----------------
  test('01 Dispositions list page loads with Add Disposition, search box and table headers', async ({ page }) => {
    await gotoDispositions(page);
    await expect(page.getByRole('heading', { name: 'Dispositions' })).toBeVisible();
    await expect(page.locator('input[placeholder="Search dispositions"]')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Disposition Name', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Sub-dispositions', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Created', exact: true })).toBeVisible();
  });

  test('02 Add Disposition page loads with a root node input and Save/Cancel/Reset controls', async ({ page }) => {
    await gotoAddDisposition(page);
    await expect(page.getByRole('heading', { name: 'Add Disposition' })).toBeVisible();
    await expect(dispositionRootInput(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Node' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
  });

  // ---------------- Tree building ----------------
  test('03 Filling the root name enables "Add Node", which adds a Level 2 sibling', async ({ page }) => {
    await gotoAddDisposition(page);
    await expect(page.getByRole('button', { name: 'Add Node' })).toBeDisabled();
    await dispositionRootInput(page).fill('QA Root');
    await expect(page.getByRole('button', { name: 'Add Node' })).toBeEnabled();

    await addDispositionRootChild(page, 'QA Child A');
    await expect(await dispositionNodeByLabel(page, 'QA Child A')).toBeVisible();
  });

  test('04 A node\'s "+" icon adds a child one level deeper', async ({ page }) => {
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill('QA Root');
    await addDispositionRootChild(page, 'QA Child A');
    await addDispositionChild(page, 'QA Child A', 'QA Grandchild');
    await expect(await dispositionNodeByLabel(page, 'QA Grandchild')).toBeVisible();
  });

  test('05 A tree can be built down to Level 5, and Level 5 nodes cannot get a child', async ({ page }) => {
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill('QA L1');
    await addDispositionRootChild(page, 'QA L2');
    await addDispositionChild(page, 'QA L2', 'QA L3');
    await addDispositionChild(page, 'QA L3', 'QA L4');
    await addDispositionChild(page, 'QA L4', 'QA L5');

    const l5 = await dispositionNodeByLabel(page, 'QA L5');
    await expect(l5).toBeVisible();
    await expect(l5.locator('span[aria-label="plus-circle"]')).toBeDisabled();
  });

  // ---------------- Deleting nodes ----------------
  test('06 Deleting a leaf node removes it after confirmation', async ({ page }) => {
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill('QA Root');
    await addDispositionRootChild(page, 'QA Leaf');
    await expect(await dispositionNodeByLabel(page, 'QA Leaf')).toBeVisible();

    await deleteDispositionNode(page, 'QA Leaf');
    await expect(await dispositionNodeByLabel(page, 'QA Leaf')).toHaveCount(0);
  });

  test('07 Deleting a node with children cascades — the node and all its descendants are removed', async ({ page }) => {
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill('QA Root');
    await addDispositionRootChild(page, 'QA Branch');
    await addDispositionChild(page, 'QA Branch', 'QA Sub');

    await deleteDispositionNode(page, 'QA Branch');
    await expect(await dispositionNodeByLabel(page, 'QA Branch')).toHaveCount(0);
    await expect(await dispositionNodeByLabel(page, 'QA Sub')).toHaveCount(0);
  });

  // ---------------- Validation ----------------
  test('08 Save with an empty node name shows "Every disposition node needs a name"', async ({ page }) => {
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill('QA Root');
    await page.getByRole('button', { name: 'Add Node' }).click(); // leaves the new node empty
    await clickDispositionSave(page);
    await expect(page.getByText('Every disposition node needs a name')).toBeVisible();
    await expect(page).toHaveURL(/dispositions\/add/);
  });

  // ---------------- Successful creation ----------------
  test('09 A root-only disposition (no children) saves successfully', async ({ page }) => {
    const name = uniqueDispositionName('QA RootOnly');
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill(name);
    await clickDispositionSave(page);
    await expectDispositionCreated(page);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row.locator('td').nth(1)).toHaveText('0');
    await deleteDispositionByName(page, name);
  });

  test('10 A disposition with a nested tree saves successfully and shows the correct sub-disposition count', async ({ page }) => {
    const name = uniqueDispositionName('QA Nested');
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill(name);
    await addDispositionRootChild(page, 'QA Child A');
    await addDispositionRootChild(page, 'QA Child B');
    await addDispositionChild(page, 'QA Child A', 'QA Grandchild');
    await clickDispositionSave(page);
    await expectDispositionCreated(page);

    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row.locator('td').nth(1)).toHaveText('3');
    await deleteDispositionByName(page, name);
  });

  // ---------------- Known defects ----------------
  test('11 [DEFECT] Duplicate sibling disposition names are accepted, not rejected', async ({ page }) => {
    // Expected: creating two sibling nodes with the exact same name under the same parent should
    // be blocked with a validation error (or at least warned about), since it makes the resulting
    // tree ambiguous — there would be no way to tell the two apart when picking a disposition.
    // Live-verified actual behavior: no such check exists. Save succeeds outright and both
    // identically-named siblings are persisted and shown side by side with no distinguishing mark.
    const name = uniqueDispositionName('QA Dup');
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill(name);
    await addDispositionRootChild(page, 'QA Same Name');
    await addDispositionRootChild(page, 'QA Same Name');
    await clickDispositionSave(page);
    await expectDispositionCreated(page);

    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await expect(row.locator('td').nth(1)).toHaveText('2');
    await deleteDispositionByName(page, name);
  });

  // ---------------- Field behavior ----------------
  test('12 Disposition node name is hard-capped at its 50-character limit', async ({ page }) => {
    await gotoAddDisposition(page);
    const input = dispositionRootInput(page);
    await input.fill('A'.repeat(60));
    await expect(input).toHaveValue('A'.repeat(50));
    await expect(page.getByText('50/50')).toBeVisible();
  });

  // ---------------- Cancel / Reset ----------------
  test('13 Cancel button discards the in-progress tree without saving', async ({ page }) => {
    const name = uniqueDispositionName('QA Cancel');
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill(name);
    await addDispositionRootChild(page, 'QA Child');
    await clickDispositionCancel(page);
    await expect(page).toHaveURL(/dispositions$/);
    await searchDispositions(page, name);
    await expect(page.locator('tr', { hasText: name })).toHaveCount(0);
  });

  test('14 Reset button discards changes back to a single blank root node', async ({ page }) => {
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill('QA WillBeReset');
    await addDispositionRootChild(page, 'QA Child');

    await clickDispositionReset(page);
    await expect(dispositionRootInput(page)).toHaveValue('');
    await expect(await dispositionNodeByLabel(page, 'QA Child')).toHaveCount(0);
  });

  // ---------------- List / search / view / edit / delete ----------------
  test('15 Search by disposition name filters the Dispositions list', async ({ page }) => {
    const name = uniqueDispositionName('QA Search');
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill(name);
    await clickDispositionSave(page);
    await expectDispositionCreated(page);

    await searchDispositions(page, name);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteDispositionByName(page, name);
  });

  test('16 View action shows a read-only tree that cannot be edited', async ({ page }) => {
    const name = uniqueDispositionName('QA View');
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill(name);
    await addDispositionRootChild(page, 'QA Viewable Child');
    await clickDispositionSave(page);
    await expectDispositionCreated(page);

    await searchDispositions(page, name);
    const row = page.locator('tr', { hasText: name });
    await row.locator('span[aria-label="eye"]').click();

    await expect(page.getByRole('heading', { name: 'View Disposition' })).toBeVisible();
    await expect(dispositionRootInput(page)).toHaveAttribute('readonly', '');
    await expect(await dispositionNodeByLabel(page, 'QA Viewable Child')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Node' })).toHaveCount(0);

    // The "Disposition created" toast from the earlier Save can still be on screen here, and its
    // own close icon also has the accessible name "Close" — scope to `main` to avoid matching it
    // (strict-mode violation), same lesson as CRM Forms' Cancel button.
    await page.locator('main').getByRole('button', { name: 'Close' }).click();
    await deleteDispositionByName(page, name);
  });

  test('17 Edit action opens the tree pre-filled and editable, and Save updates it', async ({ page }) => {
    const name = uniqueDispositionName('QA Edit');
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill(name);
    await addDispositionRootChild(page, 'QA Original Child');
    await clickDispositionSave(page);
    await expectDispositionCreated(page);

    await searchDispositions(page, name);
    const row = page.locator('tr', { hasText: name });
    await row.locator('span[aria-label="edit"]').click();

    await expect(page.getByRole('heading', { name: 'Edit Disposition' })).toBeVisible();
    await expect(dispositionRootInput(page)).toHaveValue(name);
    await addDispositionChild(page, 'QA Original Child', 'QA New Grandchild');
    await clickDispositionSave(page);
    await expectDispositionUpdated(page);

    const updatedRow = page.locator('tr', { hasText: name });
    await expect(updatedRow.locator('td').nth(1)).toHaveText('2');
    await deleteDispositionByName(page, name);
  });

  test('18 Delete (list-level) removes the disposition after confirmation', async ({ page }) => {
    const name = uniqueDispositionName('QA Delete');
    await gotoAddDisposition(page);
    await dispositionRootInput(page).fill(name);
    await clickDispositionSave(page);
    await expectDispositionCreated(page);

    await searchDispositions(page, name);
    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();
    await row.locator('span[aria-label="delete"]').click();
    await expect(page.getByText('Are you sure you want to delete this disposition?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(page.getByText('Disposition removed')).toBeVisible({ timeout: 15000 });
    await expect(row).toHaveCount(0);
  });

  // ---------------- Deep link ----------------
  test('19 Deep-linking straight to Add Disposition works correctly (unlike the equivalent CRM Forms page)', async ({ page }) => {
    const name = uniqueDispositionName('QA DeepLink');
    await page.goto('/client/campaign/dispositions/add');
    await expect(dispositionRootInput(page)).toBeVisible();
    await dispositionRootInput(page).fill(name);
    await clickDispositionSave(page);
    await expectDispositionCreated(page);
    await expect(page.locator('tr', { hasText: name })).toBeVisible();
    await deleteDispositionByName(page, name);
  });
});
