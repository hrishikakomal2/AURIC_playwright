import { AprReportRecorder } from './reportRecorder';
import { AprAgentRow, UserRecord } from './types';
import { textsMatch, compareDurations, clockToMinutes } from './normalize';

export interface ValidationContext {
  date: string; // the single date, or "YYYY-MM-DD to YYYY-MM-DD" range label
  hour: string; // "HH:mm-HH:mm" label
  campaign: string; // requested campaign display label ("ALL" when none was configured)
  source: string; // which APR view this row came from, e.g. "Live Dashboard > APR Analytics"
}

/**
 * Validates Agent Name + Agent ID against the Users page (spec section 5). Also reports "SME ID"
 * as an alias of Agent ID / Users' User Id — this app has no distinct SME ID field anywhere
 * (verified live against every Users column, including ones hidden behind its column-settings
 * toggle); see apr/README.md "SME ID" for the full note.
 */
export function validateAgentIdentity(recorder: AprReportRecorder, ctx: ValidationContext, apr: AprAgentRow, user: UserRecord | null) {
  const base = { agentName: apr.agentName, agentId: apr.agentId, date: ctx.date, hour: ctx.hour, campaign: ctx.campaign, source: 'Users page' };

  if (!user) {
    const reason = `Agent "${apr.agentName || '(blank)'}" (Agent ID ${apr.agentId}) from APR was not found on the Users page`;
    recorder.compareField({ ...base, field: 'Agent ID', aprValue: apr.agentId, referenceValue: '(not found)', matches: false, reason });
    recorder.compareField({ ...base, field: 'Agent Name', aprValue: apr.agentName, referenceValue: '(not found)', matches: false, reason });
    recorder.compareField({ ...base, field: 'SME ID', aprValue: apr.agentId, referenceValue: '(not found)', matches: false, reason });
    return;
  }

  const idMatches = textsMatch(apr.agentId, user.userId);
  recorder.compareField({
    ...base,
    field: 'Agent ID',
    aprValue: apr.agentId,
    referenceValue: user.userId,
    matches: idMatches,
    reason: idMatches ? undefined : `APR Agent ID "${apr.agentId}" does not match Users User Id "${user.userId}"`,
  });

  const nameMatches = textsMatch(apr.agentName, user.name);
  recorder.compareField({
    ...base,
    field: 'Agent Name',
    aprValue: apr.agentName,
    referenceValue: user.name,
    matches: nameMatches,
    reason: nameMatches ? undefined : `APR Agent Name "${apr.agentName}" does not match Users Name "${user.name}"`,
  });

  recorder.compareField({
    ...base,
    field: 'SME ID',
    aprValue: apr.agentId,
    referenceValue: user.userId,
    matches: idMatches,
    reason: idMatches
      ? 'Aliased to Agent ID / Users User Id — this app has no distinct SME ID field (see apr/README.md)'
      : `APR Agent ID "${apr.agentId}" does not match Users User Id "${user.userId}"`,
  });
}

/** Validates Total Active Duration (this app's "Active Time" column) against a reference value pulled from another page/query. */
export function validateActiveDuration(
  recorder: AprReportRecorder,
  ctx: ValidationContext,
  apr: AprAgentRow,
  referenceActiveTime: string,
  referenceSource: string
) {
  const cmp = compareDurations(apr.activeTime, referenceActiveTime);
  recorder.compareField({
    agentName: apr.agentName,
    agentId: apr.agentId,
    date: ctx.date,
    hour: ctx.hour,
    campaign: ctx.campaign,
    field: 'Total Active Duration',
    aprValue: apr.activeTime,
    referenceValue: referenceActiveTime,
    source: referenceSource,
    matches: cmp.matches,
    reason: cmp.matches
      ? undefined
      : `APR Total Active Duration "${apr.activeTime}" vs ${referenceSource} "${referenceActiveTime}" differ by ${cmp.diffSeconds ?? 'N/A'}s`,
  });
}

/**
 * Validates the Campaign Name column against the requested campaign (spec section 9).
 * `requestedCampaign` is the actual campaign to check against — callers only invoke this when one
 * was configured (APR_CAMPAIGN_NAME blank/unset means "no campaign filter", nothing to check).
 */
export function validateCampaign(recorder: AprReportRecorder, ctx: ValidationContext, apr: AprAgentRow, requestedCampaign: string) {
  const matches = textsMatch(apr.campaignName, requestedCampaign);
  recorder.compareField({
    agentName: apr.agentName,
    agentId: apr.agentId,
    date: ctx.date,
    hour: ctx.hour,
    campaign: ctx.campaign,
    field: 'Campaign',
    aprValue: apr.campaignName,
    referenceValue: requestedCampaign,
    source: 'APR filter parameters',
    matches,
    reason: matches ? undefined : `APR row's Campaign Name "${apr.campaignName}" does not match the requested campaign "${requestedCampaign}"`,
  });
}

/**
 * Validates Date + Hour (spec section 8). The live APR report has no per-row Date/Hour
 * breakdown — it is one row aggregated over the whole selected date range (verified live on both
 * the Live Dashboard and Insights APR views) — so "Date" just confirms the row belongs to the
 * query that was run, and "Hour" checks the agent's First Login / Last Logout clock times fall
 * inside the requested hour window, per the "treat the hour range as one window" decision
 * recorded in apr/README.md, rather than expecting a distinct row per hour.
 */
export function validateDateHourWindow(recorder: AprReportRecorder, ctx: ValidationContext, apr: AprAgentRow, startMinutes: number, endMinutes: number) {
  recorder.compareField({
    agentName: apr.agentName,
    agentId: apr.agentId,
    date: ctx.date,
    hour: ctx.hour,
    campaign: ctx.campaign,
    field: 'Date',
    aprValue: ctx.date,
    referenceValue: ctx.date,
    source: 'APR filter parameters',
    matches: true, // this row only exists because it was returned for a query scoped to this date
  });

  const first = clockToMinutes(apr.firstLogin);
  const last = clockToMinutes(apr.lastLogout);

  if (first === null && last === null) {
    recorder.compareField({
      agentName: apr.agentName,
      agentId: apr.agentId,
      date: ctx.date,
      hour: ctx.hour,
      campaign: ctx.campaign,
      field: 'Hour',
      aprValue: `${apr.firstLogin} - ${apr.lastLogout}`,
      referenceValue: ctx.hour,
      source: 'APR First Login / Last Logout',
      matches: true,
      reason: 'No login activity recorded for this agent in range — nothing outside the window to flag',
    });
    return;
  }

  const inWindow = (first === null || (first >= startMinutes && first <= endMinutes)) && (last === null || (last >= startMinutes && last <= endMinutes));
  recorder.compareField({
    agentName: apr.agentName,
    agentId: apr.agentId,
    date: ctx.date,
    hour: ctx.hour,
    campaign: ctx.campaign,
    field: 'Hour',
    aprValue: `${apr.firstLogin} - ${apr.lastLogout}`,
    referenceValue: ctx.hour,
    source: 'APR First Login / Last Logout',
    matches: inWindow,
    reason: inWindow ? undefined : `Agent activity (First Login ${apr.firstLogin}, Last Logout ${apr.lastLogout}) falls outside the requested hour window ${ctx.hour}`,
  });
}
