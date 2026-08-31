# Agent Performance Report (APR) validation suite

Automated cross-page validation of the AURIC CCAAS Agent Performance Report. This suite treats
APR as the report under test and cross-checks it against the Users page, the Live Dashboard, and
Insights — it does not trust any APR value just because it's displayed.

Location: `apr/` (framework code) and `tests/apr/` (the 12 test cases, TC01–TC12).

## Running

```
npm run test:apr                               # whole suite
npx playwright test tests/apr/tc02-*.spec.ts    # one test case
npm run test:apr:headed                         # watch it run
```

Every run also writes a consolidated, human-readable report to `apr-reports/apr-report-<timestamp>.html`
(plus a `.json` of the same data) — a field-by-field PASS/FAIL/NO DATA table per test case, with
totals, error lists, and links to failure screenshots. This is on top of the normal
`playwright-report/` HTML report. See `apr/reporter.ts`.

## Configuring a run

All parameters are environment variables, read from `.env` (see the `.env` file itself for the
full list with inline comments) and overridable per-run, e.g.:

```
APR_AGENT_NAME="John Smith" APR_START_DATE=2026-08-20 APR_END_DATE=2026-08-20 \
APR_START_HOUR=09:00 APR_END_HOUR=12:00 APR_CAMPAIGN_NAME="Campaign A" \
npx playwright test tests/apr/tc02-specific-agent-today.spec.ts
```

| Variable | Meaning | If blank/unset |
|---|---|---|
| `APR_AGENT_NAME` | Agent to validate, or `ALL` for every agent | `ALL` |
| `APR_START_DATE` / `APR_END_DATE` | Date range, `YYYY-MM-DD`. Today ⇒ Live Dashboard path; any other date ⇒ Insights path | today |
| `APR_START_HOUR` / `APR_END_HOUR` | Hour window, `HH:mm`, 24h | `00:00` / `23:59` (whole day) |
| `APR_CAMPAIGN_NAME` | Campaign to validate | no campaign filter — validates whatever campaign each agent actually has, and skips the "Campaign" field check (nothing to check it against) |

So `APR_AGENT_NAME="John Smith"` with every other `APR_*` variable blank means: validate John
Smith's **today** data, for the **whole day**, across **every campaign** he has activity in. This
is implemented in `apr/config.ts::loadAprConfig()` — a variable present in `.env` but set to
nothing (`APR_START_HOUR=`) is treated the same as not being in `.env` at all.

Login reuses this project's existing `TEST_BASE_URL` / `TEST_EMAIL` / `TEST_PASSWORD` — the APR
suite runs as the same admin account, so it doesn't need its own separate credential variables.

## Important: how this suite adapts the spec to the real app

The original requirements were written against a hypothetical layout. Before writing any code,
the live app (`https://ccaas.azalio.io`) was inspected end-to-end, and its actual structure
differs from that spec in ways that meaningfully change what "validate the APR report" means here.
Every difference below was confirmed live, not assumed — and was cleared with the requester before
building the suite around it.

### Where APR actually lives

There is no standalone "APR" page. The Agent Performance Report is a tab inside two existing pages:

- **Live Dashboard → "APR ANALYTICS" tab** (`/client/live-dashboard`) — today only ("Today's live
  agent performance and call statistics"). See `apr/pages/LiveDashboardAprPage.ts`.
- **Insights → "APR" tab** (`/client/insights`) — any date range, via a Start date/End date
  picker. See `apr/pages/InsightsAprPage.ts`.

Both render the exact same table component and columns. `isToday()` in `apr/config.ts` decides
which one a given test run uses.

### The table is one aggregated row per agent — not one row per Date+Hour

Every column (Total Calls, Active Time, SLA, …) is aggregated across the whole selected date
range. There is no Date or Hour column, and no per-hour breakdown anywhere in the UI (checked the
rendered table, and the app has no hidden per-hour export).

**Adaptation (confirmed with the requester):** the Start/End Hour window is validated by checking
that each agent's **First Login / Last Logout** clock times fall inside the requested window,
rather than expecting a distinct row per hour. See `validateDateHourWindow()` in
`apr/lib/validate.ts`. The window is treated as **inclusive on both ends** — an activity time equal
to the start or end hour passes.

### There is no "SME ID" field anywhere in this app

Checked every column on the Users page (including the ones hidden behind its column-settings gear
icon) and every column of both APR views — no distinct SME ID field exists anywhere.

**Adaptation (confirmed with the requester):** SME ID is reported as an alias of Agent ID / Users'
"User Id" — same underlying value, reported under both labels. See the `SME ID` block in
`validateAgentIdentity()` in `apr/lib/validate.ts`.

### Campaign filtering is inconsistent between the two APR views

- Live Dashboard has a real, shared **"Filter dashboard by campaign"** multi-select that applies
  to the APR Analytics tab (confirmed live: selecting a campaign narrows the APR table to that
  campaign's agents).
- Insights' APR tab has **no campaign filter control at all** — only a "Campaign Name" column.

**Adaptation:** `LiveDashboardAprPage.filterByCampaign()` uses the real dropdown for today's data;
`InsightsAprPage.getRowsForCampaign()` filters client-side on the Campaign Name column for
historical data. Both paths still validate every returned row's Campaign Name against the
requested campaign (`validateCampaign()`), so a leak from another campaign would still be caught.
Leaving `APR_CAMPAIGN_NAME` blank skips filtering entirely on both paths (see the config table
above).

### What "Total Active Duration" is compared against

The spec assumes APR (primary) and Live Dashboard / Insights (reference) are different reports.
In reality APR *is* the table on those pages, so a literal reading would compare the table to
itself. This suite instead cross-checks two independently-fetched pulls of the same underlying
metric — a real regression check, not a self-comparison:

- **Today:** Live Dashboard > APR Analytics (primary) vs. Insights > APR queried for today's date
  (reference) — two different pages/endpoints.
- **Historical, specific agent:** the agent-search-scoped query (primary) vs. the same page with
  the search cleared, i.e. the full list (reference) — the "search first, then retrieve Active
  Time" flow the spec describes for historical data.
- **Historical, all agents:** the agent search is never applied in ALL mode, so there's nothing to
  cross-check a second read against without risking a spurious mismatch from re-reading a paginated
  table twice (observed live — see `apr/lib/runner.ts`); the full-list result is used directly.

Duration comparisons use a 5-second tolerance (`compareDurations()` in `apr/lib/normalize.ts`) to
absorb rounding/timing drift between two separate page loads.

## Architecture

- `apr/config.ts` — loads and validates the env-driven run parameters.
- `apr/pages/` — Page Object Model: `LoginPage`, `UsersPage`, `LiveDashboardAprPage`, `InsightsAprPage`.
- `apr/lib/table.ts` — generic antd `<table>` reader (header-keyed, paginated, filters out antd's
  internal `ant-table-measure-row` / `ant-table-placeholder` rows so an empty table reads as zero
  rows rather than two fake ones — a real bug caught while building this suite).
- `apr/lib/types.ts` — `AprAgentRow` / `UserRecord` shapes + mappers from raw table rows.
- `apr/lib/normalize.ts` — text/duration/clock-time normalization and tolerance-based comparison.
- `apr/lib/validate.ts` — the four field-group validators (identity, duration, campaign, date/hour).
- `apr/lib/runner.ts` — `gatherAprData()` (drives the pages, picks the right source) and
  `validateAll()` (runs every validator over every gathered row).
- `apr/lib/reportRecorder.ts` — per-test PASS/FAIL/NO DATA row collector, attached to the test
  result as JSON.
- `apr/reporter.ts` — custom Playwright reporter that aggregates every test's attached JSON into
  `apr-reports/apr-report-<timestamp>.html` (registered alongside `list`/`html` in `playwright.config.ts`).
- `apr/fixtures.ts` — extends the base `test` with `aprConfig` and `aprReport` fixtures.

## Test cases

| # | File | Scenario |
|---|---|---|
| TC01 | `tc01-login.spec.ts` | Login succeeds with valid creds, dashboard loads; fails clearly + screenshots on invalid creds |
| TC02 | `tc02-specific-agent-today.spec.ts` | One agent, today, full cross-page validation |
| TC03 | `tc03-all-agents-today.spec.ts` | Every agent, today |
| TC04 | `tc04-specific-agent-historical.spec.ts` | One agent, a past date, via Insights |
| TC05 | `tc05-all-agents-historical.spec.ts` | Every agent, a past date, via Insights |
| TC06 | `tc06-agent-identity.spec.ts` | Agent Name/ID (+ SME ID alias) vs. Users, isolated |
| TC07 | `tc07-active-duration.spec.ts` | Total Active Duration vs. reference source, isolated |
| TC08 | `tc08-date-hour.spec.ts` | Date/Hour window vs. First Login/Last Logout, isolated |
| TC09 | `tc09-campaign.spec.ts` | Campaign Name correctness; negative case for a nonexistent campaign |
| TC10 | `tc10-missing-extra-agents.spec.ts` | Missing/extra/duplicate agent detection between APR and Users |
| TC11 | `tc11-mismatch-detection.spec.ts` | The full cross-page comparison in one run (uses whatever `.env` is currently configured) |
| TC12 | `tc12-empty-data.spec.ts` | A nonexistent agent correctly returns zero rows, reported as NO DATA, not a failure |

TC02–TC05 pin specific/all × today/historical combinations (resolving a concrete agent name via
the Users page when `.env` is set to `ALL`, and forcing a historical date via `yesterdayIso()`
when `.env` happens to be today) so the four combinations are always exercised regardless of the
current `.env` defaults. TC06–TC09 and TC11 run against whatever `.env` is currently configured —
these are the ones a day-to-day custom run (e.g. from the CLI example above) actually exercises.

## Error handling

- **UI ERROR / FILTER ERROR** — a page/control failed to load or a requested campaign isn't
  offered: the suite fails the test with a clear `expect(...)` message rather than reporting a
  false PASS. See TC09's negative case for the campaign example.
- **DATA ERROR** — a comparison genuinely mismatches: recorded as `FAIL` with both values and a
  specific reason in the comparison row (and the test itself fails via `expect(failed).toHaveLength(0)`).
- **NO DATA** — no rows for the requested filters: recorded as `NO DATA`, not `FAIL` — see TC12 and
  `AprReportRecorder.noData()`.

## Known live-app flakiness

Direct/rapid navigation to `/client/users` was observed, during development, to occasionally get
stuck on "Loading..." even though its underlying API calls returned 200 — a real frontend bug in
the app, not this suite. `UsersPage.goto()` waits on both the "Add User" button and the table
becoming visible (15s), which surfaces this clearly as a timeout if it happens rather than
silently reading stale/empty data; retry the run if you hit it.
