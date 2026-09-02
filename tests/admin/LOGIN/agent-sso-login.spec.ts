import { test, expect } from '@playwright/test';
import {
  login,
  ssoLoginAgentByEmail,
  completeAgentSsoLogin,
  expectAgentDashboard,
  SSO_AGENT_EMAIL,
  SSO_CAMPAIGN,
  SSO_MODE,
} from '../helpers';

// Which agent, campaign, and mode this exercises is read from .env (SSO_AGENT_EMAIL,
// SSO_CAMPAIGN, SSO_MODE) since that data will change over time — update .env there rather than
// this file when it does.

test.describe('Users — Agent SSO Login', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('01 "Login" on an agent row opens an SSO tab prompting for mode and campaign', async ({ page, context }) => {
    const { agentTab } = await ssoLoginAgentByEmail(page, context, SSO_AGENT_EMAIL);

    await expect(agentTab.getByRole('heading', { name: 'Login type.' })).toBeVisible();
    await expect(agentTab.getByText("Choose how you'd like to connect")).toBeVisible();
    await expect(agentTab.locator('select')).toBeVisible();
    await expect(agentTab.locator('.ant-select', { hasText: 'Select Campaign' })).toBeVisible();
    await expect(agentTab.getByRole('button', { name: 'Submit' })).toBeVisible();

    await agentTab.close();
  });

  test('02 Selecting mode and campaign then Submit logs the agent in and lands on their dashboard', async ({
    page,
    context,
  }) => {
    const { agentTab, agentName } = await ssoLoginAgentByEmail(page, context, SSO_AGENT_EMAIL);

    await completeAgentSsoLogin(agentTab, { mode: SSO_MODE, campaign: SSO_CAMPAIGN });

    await expectAgentDashboard(agentTab, agentName);
    await expect(agentTab.getByText("You're currently on:")).toBeVisible();
    await expect(agentTab.getByText('Agent', { exact: true })).toBeVisible();

    await agentTab.close();
  });

  test('03 Submitting without explicitly picking a campaign still succeeds, defaulting to the agent\'s last-used campaign', async ({
    page,
    context,
  }) => {
    // Live-verified: "Select Campaign" carries no required-field marker and Submit is never
    // disabled while it's empty. Clicking Submit without touching it does not block the flow —
    // it silently falls back to whatever campaign the agent was last active on and proceeds
    // straight to the dashboard, the same as explicitly selecting a campaign would.
    const { agentTab, agentName } = await ssoLoginAgentByEmail(page, context, SSO_AGENT_EMAIL);

    await agentTab.getByRole('button', { name: 'Submit' }).click();

    await expectAgentDashboard(agentTab, agentName);
    await expect(agentTab.getByText("You're currently on:")).toBeVisible();

    await agentTab.close();
  });

  test('04 "Back to Login" returns from the SSO tab to the admin login page', async ({ page, context }) => {
    const { agentTab } = await ssoLoginAgentByEmail(page, context, SSO_AGENT_EMAIL);

    await agentTab.getByText('Back to Login').click();
    await expect(agentTab.getByRole('heading', { name: 'Welcome' })).toBeVisible({ timeout: 10000 });

    await agentTab.close();
    // Original admin tab is unaffected — still on the Users list.
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  });
});
