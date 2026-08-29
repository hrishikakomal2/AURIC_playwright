# Standard Report — New Application (isolated environment)

A second, fully independent copy of the Standard Report validation suite, for testing a
different account/environment without ever mixing config, credentials, selectors, or report
output with the existing suite (`apr/`, `tests/standard-report/`).

Location: `apr-new-app/` (framework code) and `tests/standard-report-new-app/` (specs).

## Running

```
npm run test:apr-new-app
npm run test:apr-new-app:headed
```

This never touches the existing suite's `.env`, `apr/` framework, or `apr-reports/` output — see
"Isolation from the existing suite" below.

## Configuring a run

Edit `.env.vispl` at the project root. Every `NEWAPP_APR_*` variable is optional —
a blank/unset value falls back to the same defaults as the existing suite (see `apr-new-app/config.ts`).

| Variable | Required | If blank/unset |
|---|---|---|
| `NEWAPP_BASE_URL` | yes | — |
| `NEWAPP_USERNAME` | yes | — |
| `NEWAPP_PASSWORD` | yes | — |
| `NEWAPP_APR_AGENT_NAME` | no | `ALL` — validates every agent found |
| `NEWAPP_APR_START_DATE` / `NEWAPP_APR_END_DATE` | no | today |
| `NEWAPP_APR_START_HOUR` / `NEWAPP_APR_END_HOUR` | no | `00:00`–`23:59` |
| `NEWAPP_APR_CAMPAIGN_NAME` | no | no campaign filter |

## Isolation from the existing suite

- **Config**: `apr-new-app/config.ts` loads `.env.vispl` explicitly via
  `dotenv.config({ path })`, not the global `dotenv/config` import in `playwright.config.ts`
  (which only loads the root `.env`). Every variable uses a `NEWAPP_` prefix distinct from the
  existing suite's `TEST_` / `APR_` names, so there is no collision even if both files were loaded
  together.
- **Navigation**: every Page Object here takes the config's `baseUrl` and builds absolute URLs
  (`${baseUrl}/client/...`) instead of relying on Playwright's shared `use.baseURL` (which is set
  from the existing suite's `TEST_BASE_URL`). This environment never depends on that value.
- **Page Objects / selectors**: `apr-new-app/pages/*` and `apr-new-app/lib/{tabs,table,types,
  validate,runner,session}.ts` are independent copies, not imports from `apr/`. Changing a
  selector here can never affect the existing suite, and vice versa.
- **Reports**: `apr-new-app/reporter.ts` writes to `apr-new-app-reports/*.html`, scanning only for
  the `new-app-comparison` attachment name (set by `apr-new-app/fixtures.ts`) — the existing
  suite's reporter (`apr/reporter.ts`) scans for `apr-comparison` and never sees these tests, and
  this reporter never sees the existing suite's tests. Both are registered in the shared
  `playwright.config.ts` reporter list, but neither's behavior changes based on the other running.
- **What *is* shared** (by design — pure, UI-agnostic business logic, not selectors or config):
  `apr/lib/normalize.ts` (duration/text comparison math) and `apr/lib/reportRecorder.ts` (the
  generic PASS/FAIL/NO DATA row collector). Neither contains a URL, credential, or selector.

## Selecting which environment to test

Target the test directory for the environment you want — there is no runtime flag that switches
between them, since that would risk exactly the cross-environment mixing this suite is built to
avoid:

```
npm run test:apr           # existing application
npm run test:apr-new-app   # new application
```

## Test cases

| File | Scenario |
|---|---|
| `blank-field-check.spec.ts` | SME ID / Agent Name / Agent ID vs. Users page, plus non-blank checks |
| `total-active-duration.spec.ts` | Cumulative hourly Total Active Duration vs. Insights APR Active Time |

Same validation concepts as `apr/README.md`'s TC06 and the Total Active Duration test — see that
file for the underlying app-behavior notes (this environment was confirmed live to have the same
UI/behavior as the existing suite's app, including the same dual tab-bar UI variant and the same
"Agent" vs. "Agent Name" header inconsistency).
