import * as dotenv from 'dotenv';
import * as path from 'path';

// Loaded explicitly (not the global `dotenv/config` import in playwright.config.ts, which only
// loads the root .env) so this environment's variables are never mixed with, dependent on, or
// overridden by the existing Standard Report suite's .env — see .env.vispl.
dotenv.config({ path: path.resolve(__dirname, '..', '.env.vispl') });

export type AgentSelector = { mode: 'ALL' } | { mode: 'SPECIFIC'; name: string };

export interface HourOfDay {
  h: number;
  m: number;
}

export interface NewAppConfig {
  baseUrl: string;
  username: string;
  password: string;
  agent: AgentSelector;
  startDate: string; // YYYY-MM-DD — defaults to today if NEWAPP_APR_START_DATE is blank/unset
  endDate: string; // YYYY-MM-DD — defaults to today if NEWAPP_APR_END_DATE is blank/unset
  startHour: HourOfDay; // defaults to 00:00 if NEWAPP_APR_START_HOUR is blank/unset
  endHour: HourOfDay; // defaults to 23:59 if NEWAPP_APR_END_HOUR is blank/unset
  campaignName: string | undefined; // undefined => no campaign filter
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var ${name} (set it in .env.vispl)`);
  return v;
}

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

function parseHour(raw: string, label: string): HourOfDay {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) throw new Error(`${label} must be in HH:mm form, got "${raw}"`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error(`${label} out of range: "${raw}"`);
  return { h, m };
}

function assertIsoDate(raw: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} must be YYYY-MM-DD, got "${raw}"`);
  return raw;
}

export function loadNewAppConfig(): NewAppConfig {
  const startDateRaw = optionalTrim('NEWAPP_APR_START_DATE');
  const endDateRaw = optionalTrim('NEWAPP_APR_END_DATE');
  const startHourRaw = optionalTrim('NEWAPP_APR_START_HOUR');
  const endHourRaw = optionalTrim('NEWAPP_APR_END_HOUR');

  return {
    baseUrl: required('NEWAPP_BASE_URL'),
    username: required('NEWAPP_USERNAME'),
    password: required('NEWAPP_PASSWORD'),
    agent: parseAgent(process.env.NEWAPP_APR_AGENT_NAME),
    startDate: startDateRaw ? assertIsoDate(startDateRaw, 'NEWAPP_APR_START_DATE') : todayIso(),
    endDate: endDateRaw ? assertIsoDate(endDateRaw, 'NEWAPP_APR_END_DATE') : todayIso(),
    startHour: startHourRaw ? parseHour(startHourRaw, 'NEWAPP_APR_START_HOUR') : { h: 0, m: 0 },
    endHour: endHourRaw ? parseHour(endHourRaw, 'NEWAPP_APR_END_HOUR') : { h: 23, m: 59 },
    campaignName: optionalTrim('NEWAPP_APR_CAMPAIGN_NAME'),
  };
}

export function formatHour(t: HourOfDay): string {
  return `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`;
}

export function todayIso(): string {
  return isoFromDate(new Date());
}

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

export function isToday(startDate: string, endDate: string): boolean {
  const t = todayIso();
  return startDate === t && endDate === t;
}
