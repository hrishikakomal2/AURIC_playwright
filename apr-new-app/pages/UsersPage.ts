import { Locator, Page, expect } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { UserRecord, mapUserRow } from '../lib/types';
import { normalizeForCompare } from '../../apr/lib/normalize';

/** Own copy for this environment — see apr-new-app/README.md "Isolation from the existing suite". */
export class UsersPage {
  constructor(private readonly page: Page, private readonly baseUrl: string) {}

  async goto() {
    await this.page.goto(`${this.baseUrl}/client/users`);
    await expect(this.page.getByRole('button', { name: 'Add User' })).toBeVisible({ timeout: 15000 });
    // On this account, `<main>` wraps the *sidebar navigation*, not the content area — the Users
    // table lives outside it entirely (verified live), so scope by the whole page instead. A
    // hidden `<table class="team-status-table">` widget also renders on every page here —
    // `:visible` skips it.
    await this.page.locator('table:visible').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  private get searchBox(): Locator {
    return this.page.getByPlaceholder('Search', { exact: true });
  }

  /**
   * `.fill()` alone never filters the table here — verified live, the search only applies on a
   * real keystroke sequence followed by Enter (`.fill()` sets the value without triggering the
   * app's listener, silently leaving the table unfiltered rather than erroring).
   */
  async search(query: string) {
    await this.searchBox.fill('');
    await this.searchBox.pressSequentially(query);
    await this.searchBox.press('Enter');
    await this.page.waitForTimeout(600);
  }

  async clearSearch() {
    await this.searchBox.fill('');
    await this.searchBox.press('Enter');
    await this.page.waitForTimeout(600);
  }

  async getAllRows(): Promise<UserRecord[]> {
    const rows = await readAntTableAllPages(this.page.locator('body'));
    return rows.map(mapUserRow);
  }

  async findByAgentId(agentId: string): Promise<UserRecord | null> {
    if (!agentId) return null;
    await this.search(agentId);
    const rows = await this.getAllRows();
    return rows.find((r) => r.userId.trim() === agentId.trim()) ?? null;
  }

  async findByName(name: string): Promise<UserRecord | null> {
    if (!name) return null;
    await this.search(name);
    const rows = await this.getAllRows();
    return rows.find((r) => normalizeForCompare(r.name) === normalizeForCompare(name)) ?? null;
  }
}
