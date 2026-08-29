import { Locator, Page, expect } from '@playwright/test';
import { readAntTableAllPages } from '../lib/table';
import { UserRecord, mapUserRow } from '../lib/types';
import { normalizeForCompare } from '../lib/normalize';

export class UsersPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/client/users');
    await expect(this.page.getByRole('button', { name: 'Add User' })).toBeVisible({ timeout: 15000 });
    await this.page.locator('main table').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  private get searchBox(): Locator {
    return this.page.getByPlaceholder('Search by agent name, number');
  }

  async search(query: string) {
    await this.searchBox.fill(query);
    await this.page.waitForTimeout(600); // debounce, matches the convention used elsewhere in this project (tests/helpers.ts)
  }

  async clearSearch() {
    await this.searchBox.fill('');
    await this.page.waitForTimeout(600);
  }

  /** All rows currently matching the applied search, across pagination. */
  async getAllRows(): Promise<UserRecord[]> {
    const rows = await readAntTableAllPages(this.page.locator('main'));
    return rows.map(mapUserRow);
  }

  /** Finds a user by exact User Id (APR's "Agent ID"). Searches first so pagination stays small. */
  async findByAgentId(agentId: string): Promise<UserRecord | null> {
    if (!agentId) return null;
    await this.search(agentId);
    const rows = await this.getAllRows();
    return rows.find((r) => r.userId.trim() === agentId.trim()) ?? null;
  }

  /** Finds a user by name (case/whitespace-insensitive exact match, search-assisted). */
  async findByName(name: string): Promise<UserRecord | null> {
    if (!name) return null;
    await this.search(name);
    const rows = await this.getAllRows();
    return rows.find((r) => normalizeForCompare(r.name) === normalizeForCompare(name)) ?? null;
  }
}
