import * as dotenv from 'dotenv';
import * as path from 'path';

// Loaded explicitly (not the global `dotenv/config` import in playwright.config.ts, which only
// loads the root .env) so this folder's own START_DATE/END_DATE never get confused with the
// Agent Performance suite's APR_* names or the New Application suite's NEWAPP_* names
// (.env.vispl) — see ./.env. Login credentials (TEST_BASE_URL/TEST_EMAIL/TEST_PASSWORD)
// deliberately are NOT duplicated here: they're read from the root .env, already loaded globally
// by playwright.config.ts before this runs — same account every other standard-report suite uses.
dotenv.config({ path: path.resolve(__dirname, '.env') });

export interface HourlyCallSummaryConfig {
  adminUsername: string;
  adminPassword: string;
  startDate: string; // YYYY-MM-DD — defaults to today if START_DATE is blank/unset
  endDate: string; // YYYY-MM-DD — defaults to today if END_DATE is blank/unset
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name} (set it in the root .env)`);
  return v;
}

/** Like `required`, but a present-and-blank value ("FOO=" in .env) is also treated as "not set" — returns `undefined` instead of throwing. */
function optionalTrim(name: string): string | undefined {
  const v = process.env[name];
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
}

function assertIsoDate(raw: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} must be YYYY-MM-DD, got "${raw}"`);
  return raw;
}

/** Today's date in the same YYYY-MM-DD shape as START_DATE/END_DATE. */
function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function loadHourlyCallSummaryConfig(): HourlyCallSummaryConfig {
  const startDateRaw = optionalTrim('START_DATE');
  const endDateRaw = optionalTrim('END_DATE');

  return {
    adminUsername: required('TEST_EMAIL'),
    adminPassword: required('TEST_PASSWORD'),
    // Blank/unset ⇒ today, matching the root .env's APR_START_DATE/APR_END_DATE convention.
    startDate: startDateRaw ? assertIsoDate(startDateRaw, 'START_DATE') : todayIso(),
    endDate: endDateRaw ? assertIsoDate(endDateRaw, 'END_DATE') : todayIso(),
  };
}
