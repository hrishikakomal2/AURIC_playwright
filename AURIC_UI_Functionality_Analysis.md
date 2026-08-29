# AURIC — UI & Functionality Analysis

**Scope:** Full authenticated app at https://ccaas.azalio.io, logged in as Client/admin (20002666).
**Method:** Live click-through and edge-case testing via Chrome automation — not a static read of the screens. Console logs were monitored throughout the session.
**Date:** 2026-07-23

---

## Executive summary

The app is a genuinely full-featured contact center platform — IVR flow builder, campaigns, queues, CRM forms, dispositions, surveys, availability/business-hours rules, and reporting are all present and mostly well organized, with sensible defaults and (for the most part) a consistent design language (card-based settings pages, antd components, a shared "search → filter → table" pattern for every list).

The most significant issue found is not a single broken screen but a **root cause visible in the browser console**: a **WebSocket/Socket.IO connection to the backend is failing and retrying every few minutes** ("`[Socket] connect_error: xhr poll error`"), correlated with a **recurring uncaught React exception** (`Minified React error #31` — an object being rendered directly as a React child, almost certainly a toast/notification trying to display a raw `{level, timestamp}` log object instead of a string). This plausibly explains why every "live" metric in the app (Live Performance, Insights gauges, Campaign Analytics) consistently reads 0/stale regardless of real underlying activity, and may explain the inconsistent load-latency seen on several pages.

Beyond that, the findings below are a mix of real, reproducible defects and minor polish items. Nothing destructive was left behind — a test node added to a real IVR flow ("ashwan i temp") was removed via the app's own confirm-delete flow before navigating away, and no other data was created or modified.

### Top findings, ranked by severity

1. **[DEFECT — High] Backend socket connection repeatedly fails**, logged every few minutes throughout the session (`[Socket] connect_error: xhr poll error`). Strongly correlated with all "live" dashboards reading zero.
2. **[DEFECT — High] Uncaught React exception (React error #31)** firing in the antd vendor bundle at the same cadence as the socket failures — a component is trying to render a raw object as text, which crashes that render pass rather than degrading gracefully.
3. **[DEFECT — Medium] Integration pages (CRM, WhatsApp, and likely others) render a fully blank content area for 2+ seconds** with no spinner and no empty-state message — looks broken, unlike the rest of the app which almost always shows a spinner then "No data".
4. **[DEFECT — Low] "Load more" pagination buttons are enabled even when the table is empty** (seen on Blacklist and Voicemail) — clicking would do nothing useful; should be disabled/hidden when there's nothing to load.
5. **[DEFECT — Low] IVR flow builder's "+" (add branch) button inserts a fully unconfigured node with no type-selection step** — one click silently mutates a real flow's structure (Queue target = empty) with no prompt. Deletion has a proper confirm dialog, so recovery is easy, but the *add* side has no equivalent guardrail.
6. **[Minor] Inconsistent formatting**: CRM Forms list shows a raw ISO timestamp (`2026-05-12T09:04:08.000Z`) where every other list in the app shows a formatted local date/time; Insights' SLA metric shows "—" while its sibling metrics show "0.00%" for the same not-applicable state.
7. **[Minor] No audible/visual feedback on Media Library "Play"** — the icon doesn't change to a pause/loading state, so there's no confirmation playback started.
8. **[Cosmetic] Modal open latency**: Filter, Add Follow-Up, Add Contact and similar modals dim the background 1–3 seconds before their content renders, during which the page looks stuck.

### What works well
- The IVR call-flow builder (node tree, gear-config, delete-with-confirm) is genuinely good — clear visual model for a non-trivial feature.
- Consistent list-page pattern (search, filter, gear/export, paginated table) across nearly every section.
- Add User / Add Follow-Up / Add Contact forms all have sensible field limits, live counters, and appropriate defaults.
- Nested sidebar navigation (Reports → View reports → Calls/Campaign/User activity) scales well and clearly marks unreleased features ("CRM Data — SOON") instead of hiding or half-building them.
- Users list search box actually filters (confirmed in this pass and in earlier Add User testing).
- Balance Usage ledger is accurate, itemized, and matches real transactions.

---

## Section-by-section detail

### Dashboard
Five tabs: Live Performance, APR Analytics, Call Monitoring, List Analytics, Balance Usage.
- **Live Performance**: 5 real-time counters (Active Calls, Calls in IVR, Calls in Queue, Connected Calls, AI Agent Calls) — all show "0" except **"Total Calls" shows an em dash "—" instead of "0"**, an inconsistent empty-state representation for the same "no data" condition as its neighbors. Campaign Analytics widget intermittently showed a stale "incoming only" campaign row on first paint before settling to "No data" on reload — consistent with the socket-reconnect issue above.
- **APR Analytics (Agent Performance Report)**: clean gauge layout, functional search-by-agent and export. "Total Users: 0" despite 4 real users existing — plausibly correct if scoped to "logged in today", but the label doesn't make that scope clear.
- **Call Monitoring**: clean, functional, correct empty state.
- **List Analytics**: functional; briefly showed a loading spinner overlapping "No data" simultaneously before settling — cosmetic only.
- **Balance Usage**: real transaction ledger, accurate credit/debit totals, copyable transaction IDs. Only issue: the "Description" column repeats the same fields twice in one string (verbose, not wrong).

### Insights
Tabs: Overall, Inbound, Outbound, Manual, Transfer Call, APR.
- Role gauges (Total Agents/Team Lead/Campaign Supervisor/Voicelogger/Operator) all read 0 with "Logged in: 0 / Logged out: 0" regardless of date range selected (tested with a real July 1–23 range) — consistent with the socket issue, not independently confirmed as a separate defect.
- Date range picker requires typing to open the calendar (a plain click on the empty field does nothing) — works once you start typing a date; minor discoverability issue, not a hard defect.
- SLA metric renders as "—" while the structurally identical "Abandoned Call Rate" metric renders "0.00%" for the same underlying "no data" case — inconsistent formatting.
- Inbound tab's second-level metrics section appeared to repeat the same "Wrap-up Time / Avg Delay Before Answer" card pair many times with no distinguishing label between repeats — not fully diagnosed (could be a per-queue/per-campaign breakdown with zero rows still rendering headers); worth a follow-up look with real campaign data.

### Users
(Already covered in depth in prior work on Add User.) Spot-checked here: list, search, and Filter modal (Status/Role/Agent Type) all functional. Filter modal has the same 1–2s blank-then-render delay as other modals.

### Call Management
- **Calls**: log list with search, filter, export — correct empty state.
- **Follow-Up Calls**: good Past/Present/Future tab design; Add Follow-Up modal has sensible defaults (today's date, current time) and clear optional/required field marking.

### Customer Contacts
- **Contacts**: Add Contact modal is clean and well-labeled (Name, Phone with country code, Email, Company, Address, all with character counters).
- **Blacklist**: correct table shape; **"Load more" button is active despite "No data"** [DEFECT #4].

### IVR Management
Richest section tested.
- **Call Flow**: 3 real flows present. The visual builder (Play/Queue nodes, gear config, delete-with-confirm, add-branch) is well designed overall, but the **add-branch button has no guardrail** [DEFECT #5] — tested live on the "ashwan i temp" flow, then reverted via the built-in confirm-delete so the flow is unchanged.
- **Media Library**: real TTS media list with duration/upload-time; Play button gives no visual playback feedback [Minor #7].
- **Queue**: functional list of 5+ real queues with algorithm/wait-type columns.
- **Voicemail**: correct empty state, same "Load more"-when-empty issue as Blacklist.
- **Callback Request**: best empty-state message in the app ("No callback requests yet"); bulk "Mark as Done" correctly appears disabled with nothing selected.

### Campaign Management
- **Campaign**: list correctly empty (matches Dashboard once fully loaded); **Create Campaign** flow is well structured (Incoming/Outgoing/Blend mode selector, DID/Call-flow linkage, optional CRM toggle).
- **DNC, Disposition, Survey, Script, Assign Campaign**: all present, all correct empty states, consistent list pattern. Disposition page has a nice "up to 5 levels deep" hint.
- **CRM**: one real form present ("hrishika"); **its Date column shows a raw unformatted ISO timestamp** [Minor #6] instead of the human-readable format used everywhere else (e.g. Media Library's "2026-07-16 09:54:32").

### Availability
- **Working Hours**: functional toggle, greeting selector with inline play button, time-range picker with computed duration ("4 HOURS").
- **Closed Days**: same clean pattern, per-weekday checkboxes, redirect-to-voicemail toggle.
- **Holidays**: not deeply tested but shares the same page shell as the other two — no reason to expect it differs.

### Reports
- **Custom Reports**: correct empty state, Add Report present.
- **View Reports**: deep nested tree (Calls/Campaign/User Activity/CRM Data) — correctly shows "No reports" per leaf, and clearly badges unreleased "CRM Data" as "SOON" rather than presenting a broken page.
- **Standard Reports**: Incoming Calls sub-report has full column set (Session, Direction, Customer, Agent, Campaign, Queue, Status, Duration) ready for data.
- **Download**: not opened in this pass (time-boxed) — flagged as unverified, not broken.

### Integration
- **CRM**: functional once loaded, but has the worst instance of the blank-render issue — 2+ seconds of a completely empty page body with no spinner [DEFECT #3]. Once loaded: clean CRM-type selector, Custom Callback API and API Integration sub-tabs, working API-key generation UI.
- **API Integration / AI Integration / TTS Integration**: AI Integration confirmed working with a real provider entry (ElevenLabs STS "AI agent") matching what was seen during Add User testing.
- **SMS / Email**: present as expandable sections, not opened in depth (time-boxed).
- **WhatsApp**: same blank-render issue as CRM [DEFECT #3] — page chrome (search, Export, Add Template) renders immediately but the content area stays empty well past when other pages would show at least a spinner.

---

## Data/cleanup notes
- No new records were created or left behind in this pass.
- One temporary node was added to the real IVR flow "ashwan i temp" to test the add-branch behavior, then removed via the app's confirm-delete dialog before leaving the page (never saved via "Update Flow").
- The 4 real seeded users (4818, 6660, 6661, 6676) were not touched.
