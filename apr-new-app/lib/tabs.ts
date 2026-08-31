import { Locator, Page } from '@playwright/test';

/**
 * Clicks a tab, tolerating two UI variants observed live on this app: a legacy ARIA `role="tab"`
 * bar, and a newer non-semantic `<span class="tab-btn">` bar with no ARIA role and a different
 * label for the same tab (e.g. "APR ANALYTICS" legacy vs. "Live APR" new). The app appears to
 * serve both inconsistently across requests — not a one-time redesign. Own copy for this
 * environment — see apr-new-app/README.md "Isolation from the existing suite".
 */
export async function clickTab(page: Page, opts: { legacyName: string; newName: string; exact?: boolean }) {
  await tabLocator(page, opts).first().click();
}

/** True if a tab under either label/variant is currently visible. */
export function tabLocator(page: Page, opts: { legacyName: string; newName: string; exact?: boolean }): Locator {
  const roleTab = page.getByRole('tab', { name: opts.legacyName, exact: opts.exact });
  const pattern = opts.exact ? new RegExp(`^\\s*${opts.newName}\\s*$`) : opts.newName;
  const tabBtn = page.locator('.tab-btn', { hasText: pattern });
  return roleTab.or(tabBtn);
}

/**
 * Resolves the container that scopes the currently-active tab's content. The legacy variant uses
 * Ant Design's `.ant-tabs-tabpane-active` pane wrapper; if it isn't present, fall back to the
 * whole page rather than guess at an unconfirmed class name for the new variant's wrapper.
 */
export async function resolveActivePane(page: Page): Promise<Locator> {
  const antPane = page.locator('.ant-tabs-tabpane-active');
  await antPane.first().waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});
  if ((await antPane.count()) > 0) return antPane;
  return page.locator('body');
}
