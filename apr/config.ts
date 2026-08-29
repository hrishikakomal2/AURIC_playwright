import 'dotenv/config';

export type AgentSelector = { mode: 'ALL' } | { mode: 'SPECIFIC'; name: string };

export interface HourOfDay {
  h: number;
  m: number;
}

export interface AprConfig {
  baseUrl: string;
  adminUsername: string;
  adminPassword: string;
  agent: AgentSelector;
  startDate: string; // YYYY-MM-DD — defaults to today if APR_START_DATE is blank/unset
  endDate: string; // YYYY-MM-DD — defaults to today if APR_END_DATE is blank/unset
  startHour: HourOfDay; // defaults to 00:00 if APR_START_HOUR is blank/unset
  endHour: HourOfDay; // defaults to 23:59 if APR_END_HOUR is blank/unset
  campaignName: string | undefined; // undefined ⇒ no campaign filter, validate whatever campaign each agent actually has
  campaignType: string | undefined; // undefined ⇒ no campaign type filter
  callType: string | undefined; // undefined ⇒ no Call Type filter on the Calls page (e.g. "incoming" for Inbound validation)
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name} (set it in .env)`);
  return v;
}

/** Like `required`, but a present-and-blank value ("FOO=" in .env) is also treated as "not set" — returns `undefined` instead of throwing. */
function optionalTrim(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parseAgent(raw: string | undefined): AgentSelector {
  const v = (raw ?? 'ALL').trim();
  if (!v || v.toUpperCase() === 'ALL') return { mode: 'ALL' };
  return { mode: 'SPECIFIC', name: v };
}

/** Accepts either a bare hour ("12" ⇒ 12:00, the task-brief convention: "Start Time: 20") or "HH:mm". */
function parseHour(raw: string, label: string): HourOfDay {
  const trimmed = raw.trim();
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) throw new Error(`${label} must be in HH or HH:mm form, got "${raw}"`);
  const h = Number(match[1]);
  const m = Number(match[2] ?? '0');
  if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error(`${label} out of range: "${raw}"`);
  return { h, m };
}

function assertIsoDate(raw: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} must be YYYY-MM-DD, got "${raw}"`);
  return raw;
}

export function loadAprConfig(): AprConfig {
  const startDateRaw = optionalTrim('APR_START_DATE');
  const endDateRaw = optionalTrim('APR_END_DATE');
  const startHourRaw = optionalTrim('APR_START_HOUR');
  const endHourRaw = optionalTrim('APR_END_HOUR');

  return {
    baseUrl: required('TEST_BASE_URL', 'https://ccaas.azalio.io'),
    // Reuses the same admin login already configured for this project (see .env) — the APR
    // suite runs as the same account, it does not need its own separate credentials.
    adminUsername: required('TEST_EMAIL'),
    adminPassword: required('TEST_PASSWORD'),
    agent: parseAgent(process.env.APR_AGENT_NAME),
    // Blank/unset ⇒ today, so "just give me an agent name" validates today's data as expected.
    startDate: startDateRaw ? assertIsoDate(startDateRaw, 'APR_START_DATE') : todayIso(),
    endDate: endDateRaw ? assertIsoDate(endDateRaw, 'APR_END_DATE') : todayIso(),
    // Blank/unset ⇒ the whole day (00:00–23:59).
    startHour: startHourRaw ? parseHour(startHourRaw, 'APR_START_HOUR') : { h: 0, m: 0 },
    endHour: endHourRaw ? parseHour(endHourRaw, 'APR_END_HOUR') : { h: 23, m: 59 },
    // Blank/unset ⇒ no campaign filter (see campaignLabel() in apr/lib/runner.ts for how this
    // shows up in the report, and gatherAprData() for how it skips filtering entirely).
    campaignName: optionalTrim('APR_CAMPAIGN_NAME'),
    campaignType: optionalTrim('APR_CAMPAIGN_TYPE'),
    callType: optionalTrim('APR_CALL_TYPE'),
  };
}

export function formatHour(t: HourOfDay): string {
  return `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`;
}

/** Today's date in the same YYYY-MM-DD shape as APR_START_DATE/APR_END_DATE. */
export function todayIso(): string {
  const now = new Date();
  return isoFromDate(now);
}

/** Yesterday's date — used by the historical test cases to guarantee they exercise the Insights
 *  (date-range) path even when the configured .env date range happens to be today. */
export function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoFromDate(d);
}

function isoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Whether the given date range is exactly "today" — decides which report source is authoritative
 * (Live Dashboard > APR Analytics for today, Insights > APR for any other date), per the app
 * structure documented in apr/README.md.
 */
export function isToday(startDate: string, endDate: string): boolean {
  const t = todayIso();
  return startDate === t && endDate === t;
}
