import { CallRecord } from './types';
import { normalizeForCompare, isEmptyValue, durationToSeconds } from './normalize';

/**
 * Transfer-case classification for the Transfers Received validation brief. Unlike every other
 * dialer-mode/call-type metric group in this suite (a single column sum), Transfers Received
 * requires interpreting several fields together (Transfer Status + supporting evidence) rather
 * than trusting one column at face value — see tests/standard-report/agent-performance-report/
 * transfers-received-check.spec.ts and the brief's "Identifying a Transfer Case" section.
 *
 * CAVEAT — not yet confirmed live: the actual Transfer Status string values this app renders
 * (e.g. is a connected transfer literally "Successful"? "Connected"? something else?). The
 * matchers below use permissive substring matching (contains "success"/"connect" for connected,
 * excludes "fail"/"cancel"/"unanswer"/"reject" for connected) rather than exact-string equality,
 * specifically so they keep working once real values are confirmed without needing a rewrite —
 * but the classification itself should be spot-checked against real Transfer Status values from
 * a live run before trusting results at scale.
 */

const NOT_TRANSFERRED_MARKERS = new Set(['', '-', '—', 'n/a', 'na', 'none', 'no', 'not transferred', 'no transfer', 'null']);
const CONNECTED_SUBSTRINGS = ['success', 'connect'];
const NOT_CONNECTED_SUBSTRINGS = ['fail', 'cancel', 'unanswer', 'reject', 'not connect', 'no answer'];

/** Whether Transfer Status indicates a transfer occurred at all (the brief's primary indicator for "is this a transfer case"). */
export function isTransferCase(call: CallRecord): boolean {
  const status = normalizeForCompare(call.transferStatus);
  return status.length > 0 && !NOT_TRANSFERRED_MARKERS.has(status);
}

/**
 * Whether Transfer Status indicates the transfer successfully connected to the receiving agent —
 * the brief's primary indicator for Connected Transfers. Deliberately does NOT treat a populated
 * Transfer Type as sufficient on its own (per the brief: "Do not count a call as a
 * successful/connected transfer solely because Transfer Type is populated").
 */
export function statusIndicatesConnected(call: CallRecord): boolean {
  const status = normalizeForCompare(call.transferStatus);
  if (!status) return false;
  if (NOT_CONNECTED_SUBSTRINGS.some((s) => status.includes(s))) return false;
  return CONNECTED_SUBSTRINGS.some((s) => status.includes(s));
}

export interface DataQualityIssue {
  call: CallRecord;
  reason: string;
}

/**
 * Per the brief's rule 17: "If Transfer Status, Transfer Duration, or transferred-agent
 * information is inconsistent, flag the record as a data-quality issue rather than automatically
 * counting it." Checks internal consistency between Transfer Status, Transfer Duration, and the
 * transferred-agent identity fields for one already-identified transfer case (see isTransferCase
 * above) — does not re-decide whether it's a transfer case at all.
 */
export function findDataQualityIssue(call: CallRecord): DataQualityIssue | null {
  const connected = statusIndicatesConnected(call);
  const hasTransferredAgentIdentity = !isEmptyValue(call.transferredAgentName) || !isEmptyValue(call.transferredAgentNumber);
  const transferDurationSeconds = durationToSeconds(call.transferDuration);
  const hasTransferDuration = !isEmptyValue(call.transferDuration) && (transferDurationSeconds ?? 0) > 0;

  if (connected && !hasTransferredAgentIdentity) {
    return { call, reason: 'Transfer Status indicates connected, but both Transferred Agent Name and Transferred Agent Number are blank' };
  }
  if (connected && !hasTransferDuration) {
    return { call, reason: 'Transfer Status indicates connected, but Transfer Duration is blank or zero' };
  }
  if (transferDurationSeconds === null && !isEmptyValue(call.transferDuration)) {
    return { call, reason: `Transfer Duration "${call.transferDuration}" is not a parseable duration` };
  }
  return null;
}

export interface TransferTalkTimeResult {
  seconds: number;
  source: 'Conference Duration' | 'Agent Talk Time';
}

/**
 * Per the brief's rule for Transfer Talk Time: prefer Conference Duration when the transfer is
 * handled as a conference and that duration represents the connected transfer conversation;
 * otherwise fall back to Agent Talk Time. Decided per-call based on whether Conference Duration
 * is actually populated for that call (a blank Conference Duration is treated as "this call's
 * transfer wasn't conference-based / wasn't recorded that way", not as zero) — see the brief's
 * instruction to "document which field was used."
 */
export function pickTransferTalkTime(call: CallRecord): TransferTalkTimeResult {
  if (!isEmptyValue(call.conferenceDuration)) {
    return { seconds: durationToSeconds(call.conferenceDuration) ?? 0, source: 'Conference Duration' };
  }
  return { seconds: durationToSeconds(call.agentTalkTime) ?? 0, source: 'Agent Talk Time' };
}
