import { AprReportRecorder } from '../../apr/lib/reportRecorder';
import { AprAgentRow, UserRecord } from './types';
import { textsMatch } from '../../apr/lib/normalize';

export interface ValidationContext {
  date: string; // the single date, or "YYYY-MM-DD to YYYY-MM-DD" range label
  hour: string; // "HH:mm-HH:mm" label
  campaign: string; // requested campaign display label ("ALL" when none was configured)
  source: string; // which APR view this row came from
}

/**
 * Validates Agent Name + Agent ID against the Users page, reporting "SME ID" as an alias of
 * Agent ID / Users' User Id (this app has no distinct SME ID field on this view — see
 * apr-new-app/README.md). Own copy for this environment.
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
      ? 'Aliased to Agent ID / Users User Id — this app has no distinct SME ID field on this view (see apr-new-app/README.md)'
      : `APR Agent ID "${apr.agentId}" does not match Users User Id "${user.userId}"`,
  });
}
