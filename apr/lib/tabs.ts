import { Locator, Page } from '@playwright/test';

/**
 * Clicks a tab, tolerating two UI variants observed live on this app: a legacy ARIA `role="tab"`
 * bar, and a newer non-semantic `<span class="tab-btn">` bar with no ARIA role and a different
 * label for the same tab (e.g. "APR ANALYTICS" legacy vs. "Live APR" new). The app appears to
 * serve both inconsistently across requests — verified live: identical login credentials
 * returned "Sign In" + role="tab" on some runs and "Login" + .tab-btn on others in the same
 * session — not a one-time redesign. See apr/README.md "Two tab-bar UI variants".
 */
export async function clickTab(page: Page, opts: { legacyName: string; newName: string; exact?: boolean }) {
  // Click the combined locator directly rather than branching on an instant `.count()` check —
  // right after navigation neither variant's tab bar has rendered yet, so a count check taken
  // too early always reads 0 and wrongly commits to whichever branch runs the check (verified
  // live: a "no role=tab found" reading turned out to just be an unrendered legacy tab bar that
  // appeared moments later). `.or()` lets Playwright's normal auto-waiting pick whichever variant
  // actually shows up.
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
 * Ant Design's `.ant-tabs-tabpane-active` pane wrapper; the newer .tab-btn variant was only
 * confirmed to replace the tab *bar* chrome (verified live: the table beneath it is still an antd
 * `<table>` with the same measure-row/placeholder/pagination markup `apr/lib/table.ts` depends
 * on) — if the antd pane wrapper isn't present, fall back to the whole page rather than guess at
 * an unconfirmed class name for the new variant's content wrapper.
 */
export async function resolveActivePane(page: Page): Promise<Locator> {
  const antPane = page.locator('.ant-tabs-tabpane-active');
  // Brief settle after a just-completed tab click before deciding which variant rendered — an
  // instant check here risks the same premature-0 race clickTab() had.
  await antPane.first().waitFor({ state: 'attached', timeout: 3000 }).catch(() => {});
  if ((await antPane.count()) > 0) return antPane;
  return page.locator('body');
}
