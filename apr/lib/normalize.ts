/** Normalization + comparison helpers shared by every APR cross-page comparison. */

export function normalizeText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeForCompare(s: string | null | undefined): string {
  return normalizeText(s).toLowerCase();
}

const EMPTY_MARKERS = new Set(['', '-', '—', 'n/a', 'na', 'null', 'undefined']);

export function isEmptyValue(s: string | null | undefined): boolean {
  return EMPTY_MARKERS.has(normalizeForCompare(s));
}

export function textsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

/**
 * Parses "H:MM:SS" / "HH:MM:SS" into total seconds. Also accepts "M:SS" / "MM:SS" (one colon,
 * no hour part) — confirmed live: the Calls page's Hold Time column renders under-an-hour
 * durations this way (e.g. "0:04" for 4 seconds), which the stricter HH:MM:SS-only regex used to
 * reject as unparseable — silently coerced to 0 by every caller's `?? 0` fallback, undercounting
 * real hold time. Treats "-"/"—"/"" as zero duration. Returns null if unparseable.
 */
export function durationToSeconds(raw: string | null | undefined): number | null {
  const s = normalizeText(raw);
  if (isEmptyValue(s)) return 0;
  const hms = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(s);
  if (hms) {
    const [, h, m, sec] = hms;
    return Number(h) * 3600 + Number(m) * 60 + Number(sec);
  }
  const ms = /^(\d+):(\d{1,2})$/.exec(s);
  if (ms) {
    const [, m, sec] = ms;
    return Number(m) * 60 + Number(sec);
  }
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

export function secondsToHms(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(Math.round(totalSeconds));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface CountCompareResult {
  matches: boolean;
  aprCount: number | null;
  referenceCount: number;
  diff: number | null;
}

/** Compares a report's count-style field (e.g. "Auto Preview Dials") against a computed reference count. Exact match required — no tolerance, unlike durations. */
export function compareCounts(aprRaw: string | null | undefined, referenceCount: number): CountCompareResult {
  const s = normalizeText(aprRaw);
  const aprCount = /^\d+$/.test(s) ? Number(s) : null;
  if (aprCount === null) return { matches: false, aprCount, referenceCount, diff: null };
  return { matches: aprCount === referenceCount, aprCount, referenceCount, diff: aprCount - referenceCount };
}

/** Parses a "NN%" / "NN.N%" field (e.g. Occupancy Rate, SLA) into a plain number. Null if unparseable/empty. */
export function parsePercent(raw: string | null | undefined): number | null {
  const s = normalizeText(raw);
  if (isEmptyValue(s)) return null;
  const match = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(s);
  if (!match) return null;
  return Number(match[1]);
}

export interface PercentCompareResult {
  matches: boolean;
  aprPercent: number | null;
  referencePercent: number | null;
  diff: number | null;
}

/**
 * Compares two "NN%" fields within a tolerance (default 1 percentage point — percentages here are
 * derived from rounded duration fields on both sides, so a small compounding rounding gap is
 * expected even when the underlying data agrees).
 */
export function comparePercent(aprRaw: string | null | undefined, referenceRaw: string | null | undefined, tolerancePoints = 1): PercentCompareResult {
  const aprPercent = parsePercent(aprRaw);
  const referencePercent = parsePercent(referenceRaw);
  if (aprPercent === null || referencePercent === null) {
    return { matches: false, aprPercent, referencePercent, diff: null };
  }
  const diff = aprPercent - referencePercent;
  return { matches: Math.abs(diff) <= tolerancePoints, aprPercent, referencePercent, diff };
}

export interface DurationCompareResult {
  matches: boolean;
  aprSeconds: number | null;
  referenceSeconds: number | null;
  diffSeconds: number | null;
}

/**
 * Compares two HH:MM:SS durations within a tolerance. Default tolerance is 5s to absorb rounding
 * and the small timing drift that comes from fetching the two values from separate page loads a
 * few seconds apart (the underlying call may still be in progress on one of the two sources).
 */
export function compareDurations(
  aprRaw: string | null | undefined,
  referenceRaw: string | null | undefined,
  toleranceSeconds = 5
): DurationCompareResult {
  const aprSeconds = durationToSeconds(aprRaw);
  const referenceSeconds = durationToSeconds(referenceRaw);
  if (aprSeconds === null || referenceSeconds === null) {
    return { matches: false, aprSeconds, referenceSeconds, diffSeconds: null };
  }
  const diffSeconds = aprSeconds - referenceSeconds;
  return { matches: Math.abs(diffSeconds) <= toleranceSeconds, aprSeconds, referenceSeconds, diffSeconds };
}

export interface ParsedCallTimestamp {
  isoDate: string; // YYYY-MM-DD
  hour: number;
  minute: number;
  second: number;
}

/** Parses the Calls page's "DD-MM-YYYY HH:mm:ss" timestamp (e.g. "29-07-2026 15:55:51"). Null if unparseable. */
export function parseCallTimestamp(raw: string | null | undefined): ParsedCallTimestamp | null {
  const s = normalizeText(raw);
  const match = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(s);
  if (!match) return null;
  const [, dd, mm, yyyy, h, m, sec] = match;
  return { isoDate: `${yyyy}-${mm}-${dd}`, hour: Number(h), minute: Number(m), second: Number(sec) };
}

/** Parses a "HH:MM" or "HH:MM:SS" clock time (First Login / Last Logout) into minutes since midnight. Null if unparseable/empty. */
export function clockToMinutes(raw: string | null | undefined): number | null {
  const s = normalizeText(raw);
  if (isEmptyValue(s)) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  // "00:00:00" is how the app represents "no login recorded", not midnight activity.
  if (minutes === 0 && (match[3] ?? '00') === '00') return null;
  return minutes;
}

/**
 * Parses a "HH:MM" or "HH:MM:SS" clock time (First Login / Last Logout) into seconds since
 * midnight — same "00:00:00 ⇒ not logged in" convention as clockToMinutes above, just at second
 * precision so a Last Logout − First Login diff isn't off by up to 59s from dropping the seconds
 * part. Null if unparseable/empty/"not logged in".
 */
export function clockToSeconds(raw: string | null | undefined): number | null {
  const s = normalizeText(raw);
  if (isEmptyValue(s)) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!match) return null;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? '0');
  if (seconds === 0) return null;
  return seconds;
}

export interface ClockTimeCompareResult {
  matches: boolean;
  activityMinutes: number | null;
  referenceMinutes: number | null;
}

/**
 * Compares two "no login ⇒ 00:00:00" clock times (e.g. Agent Activity's Logged-in Time/Last
 * Logged-out Time vs Insights > APR's First Login/Last Logout) for equality, using clockToMinutes
 * so "00:00:00" on either side is treated as "not logged in" rather than literal midnight — both
 * sides unset counts as a match (consistent "no login recorded" state), same convention as
 * validateDateHourWindow's "first === null && last === null" case in apr/lib/validate.ts.
 */
export function compareClockTime(activityRaw: string | null | undefined, referenceRaw: string | null | undefined): ClockTimeCompareResult {
  const activityMinutes = clockToMinutes(activityRaw);
  const referenceMinutes = clockToMinutes(referenceRaw);
  return { matches: activityMinutes === referenceMinutes, activityMinutes, referenceMinutes };
}

/**
 * Parses a clock time in EITHER 24-hour ("HH:MM" / "HH:MM:SS") or 12-hour ("h:MM AM/PM") format
 * into minutes since midnight. Needed because the two pages that show the same shift time use
 * different formats — confirmed live: Standard Reports > Agent Activity's "Shift Start/End Time"
 * renders 24-hour ("00:00:00", "23:00:00"), while the Users page's "In Time"/"Out Time" renders
 * 12-hour ("12:00 AM", "11:00 PM") — comparing the raw strings would report a mismatch even when
 * the times are identical. Unlike clockToMinutes, a genuine midnight ("00:00:00"/"12:00 AM") is
 * NOT treated as "not set" here — only "-"/""/etc. are. Returns null if unparseable/empty.
 */
export function timeOfDayToMinutes(raw: string | null | undefined): number | null {
  const s = normalizeText(raw);
  if (isEmptyValue(s)) return null;

  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3].toUpperCase() === 'PM') h += 12;
    return h * 60 + Number(ampm[2]);
  }

  const hms = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (hms) {
    return Number(hms[1]) * 60 + Number(hms[2]);
  }

  return null;
}

export interface TimeOfDayCompareResult {
  matches: boolean;
  activityMinutes: number | null;
  referenceMinutes: number | null;
}

/**
 * Compares two clock-time-of-day values for equality (minute precision), regardless of which of
 * the two supported formats each is written in — see timeOfDayToMinutes. Both sides unset (null)
 * counts as a match (a consistent "no shift configured" state on both pages), same convention as
 * the First Login/Last Logout "both null" case in apr/lib/validate.ts.
 */
export function compareTimeOfDay(activityRaw: string | null | undefined, referenceRaw: string | null | undefined): TimeOfDayCompareResult {
  const activityMinutes = timeOfDayToMinutes(activityRaw);
  const referenceMinutes = timeOfDayToMinutes(referenceRaw);
  return { matches: activityMinutes === referenceMinutes, activityMinutes, referenceMinutes };
}

/**
 * Parses Activity Logs' "YYYY-MM-DD HH:MM:SS" timestamp (e.g. "2026-08-25 11:56:52") into epoch
 * milliseconds (UTC-anchored — treated as a plain wall-clock diff, same convention every other
 * duration comparison in this suite uses). Null if unparseable.
 */
export function activityLogTimestampToMs(raw: string | null | undefined): number | null {
  const s = normalizeText(raw);
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!match) return null;
  const [, yyyy, mm, dd, hh, min, ss] = match;
  return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss));
}
