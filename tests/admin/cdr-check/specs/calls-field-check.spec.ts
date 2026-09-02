import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { loginAsAdmin } from '../../../../apr/lib/session';
import { CallsPage } from '../../../../apr/pages/CallsPage';
import { UsersPage } from '../../../../apr/pages/UsersPage';
import { isEmptyValue, textsMatch, durationToSeconds } from '../../../../apr/lib/normalize';
import { CallRecord } from '../../../../apr/lib/types';
import { loadCdrCheckConfig } from '../config';

/**
 * Calls (CDR) page field check — for every call row on /client/calls/merge-calls, filtered ONLY by
 * the "Select Date Range" field (START_DATE/END_DATE in ./.env — no Agent/Campaign/Queue/Call Type
 * filter is ever set), validates the original 28 field rules, Customer Hangup Cause, Agent Hangup
 * Cause, and a later batch: Agent Talk Time; Hold Time <-> Hold Time Detail; Mute Time <-> Mute
 * Time Detail; Transfer Type / Transfer Agent Ringing Duration / Transferred Agent Name /
 * Transfer Duration (all on Transfer Status == Success) / Transferred Agent Number (on
 * Transferred Agent Name populated); Conference Duration; Voice Mail Duration; Survey Duration;
 * Disconnected By; Agent Hangup Code; Customer Hangup Code; Total Duration; Recording.
 *
 * Each field lands in one of three buckets per row:
 *  - PASS — the field's rule applied to this row and the value satisfied it.
 *  - FAIL — the field's rule applied to this row and the value did NOT satisfy it.
 *  - N/A  — the field's rule does not apply to this row at all (e.g. Call Flow's "only for
 *           Incoming" rule on an Outgoing call) — NOT evaluated, not a pass or a failure. Unlike
 *           an earlier version of this suite, a conditional field being populated when its
 *           condition does NOT hold is no longer flagged as a failure — only the "must be
 *           populated when the condition holds" direction is asserted.
 *
 * Duration fields (Agent Ringing/Customer Ringing/Agent Call Processing/Connected/Agent
 * Connected/Customer Connected/Pre-Conference Duration) treat a literal "0" the same as a blank
 * cell — confirmed live: the app renders "no duration" as "0", not an empty cell.
 *
 * Column names are read straight off each row's raw TableRow (CallRecord.raw) using the exact
 * labels given for this check — if a column reads back blank for every row, the header text
 * likely doesn't match the live table exactly (see apr/lib/types.ts mapCallRow's "Field-name note"
 * comments for the pattern used elsewhere in this suite when that happens).
 *
 * Fields with no stated rule (Customer Number #9, DTMF #13) and fields this suite can't verify
 * (Customer Name #10 — depends on Contacts-page state; Team Lead #20 / Login Mode #21 — Users-page
 * reference lookups, no CDR column to compare against) are always N/A.
 *
 * Abandoned Reason (#16) is the one SYMMETRIC exception in this suite: required when Call
 * Status=Abandoned, AND must be BLANK otherwise — both directions are asserted, per explicit
 * instruction (every other conditional field only asserts the "populated when condition holds"
 * direction, N/A otherwise). Its exact value then drives four more real rules: abandoned_in_ivr ->
 * IVR Duration (#12) must not be 0/blank; abandoned_in_agent -> Agent Name (#18, replacing the
 * earlier "Abandoned in agent" text-match) must be populated; abandoned_in_voicemail -> Voice Mail
 * Status must be populated; abandoned_in_queue -> Queue Wait Duration (#15) must not be 0/blank.
 *
 * Customer Hangup Cause (#29) is classification-only and can NEVER fail: only 4 "Expected
 * Blank/NA" exceptions were confirmed (Call Status=Abandoned + Agent Hangup Cause="Call Rejected
 * By Agent"/"Call Rejected", or Disconnected By="system - (agent timeout)"/"system - (agent
 * ringing timeout)") — every other Campaign Type/Call Type/Call Status/Disconnected By/Agent
 * Hangup Cause combination is marked "Needs Business Rule Confirmation" rather than guessed at,
 * per the explicit instruction not to assume (e.g. Agent Hangup Cause="Normal Clearing", or Call
 * Status=Failed + "Normal Clearing", do NOT reliably imply blank). Once a confirmed
 * Required/Populated rule exists for at least one combination, this can become a real assertion.
 *
 * Agent Hangup Cause (#30) validates the VALUE, not just blank/populated, but only two
 * combinations are confirmed strongly enough to assert (both CAN fail): Call Status=Success
 * requires it non-blank (exact expected value not confirmed — only presence); Call
 * Status=Abandoned + Disconnected By=agent_disconnect requires it to exactly equal "Call Rejected
 * By Agent". Every other combination (agent ringing timeout / agent timeout / customer /
 * customer timeout / anything else) is classification-only, per the brief's explicit warnings
 * against inferring a single expected value without dataset proof — these are always N/A, never
 * FAIL. The exploratory "campaign-specific" breakdown the brief asked for (does Agent Hangup Cause
 * behave differently per Campaign Type/Call Type/Call Status/Disconnected By) is written as a
 * second worksheet in result.xlsx ("Agent Hangup Patterns") — a grouped count, not a pass/fail
 * check — for manually confirming or refining these rules per campaign.
 *
 * result.xlsx (written next to this file's .env/config.ts) lists every FAIL row on the "Result"
 * sheet — PASS and N/A are excluded there. PASS when every FAIL-eligible field on every fetched
 * row satisfies its rule.
 */
test.describe('Calls (CDR) page — field check', () => {
  test('every call row satisfies its field presence/value rules', async ({ page }) => {
    test.setTimeout(180_000);

    const cfg = loadCdrCheckConfig();
    await loginAsAdmin(page, cfg);

    // Only the date range filter is applied on /client/calls/merge-calls — no Agent/Campaign/
    // Queue/Call Type filter is set (those params are left unset, same as leaving them untouched
    // in the Filter Calls dialog).
    const callsPage = new CallsPage(page);
    const calls = await callsPage.getRowsForFilters({ startDate: cfg.startDate, endDate: cfg.endDate });

    // Users page (Team Lead / Login Mode reference) — fetched once, matched client-side by Agent
    // Name, same pattern as tests/standard-report/agent-activity-report/specs/field-check.spec.ts.
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    const allUsers = await usersPage.getAllRows();

    type Status = 'PASS' | 'FAIL' | 'N/A';

    interface FieldResult {
      row: number;
      timestamp: string;
      sessionId: string;
      field: string;
      conditionEvaluated: string;
      expected: string;
      actual: string;
      status: Status;
      reason?: string;
    }

    const CAMPAIGN_LIST_TYPES = ['preview manual', 'preview auto', 'power dialer', 'progressive dialer', 'predictive dialer'];
    const CALL_STATUSES = ['success', 'failed', 'abandoned'];

    const results: FieldResult[] = [];
    const displayValue = (v: string) => (isEmptyValue(v) ? '—' : v);

    calls.forEach((call: CallRecord, idx: number) => {
      const rowNum = idx + 1;
      const raw = call.raw;
      const get = (col: string) => (raw[col] ?? '').trim();
      const sessionId = get('Session Id');

      const pushResult = (field: string, conditionEvaluated: string, expected: string, actual: string, status: Status, reason?: string) => {
        results.push({ row: rowNum, timestamp: call.timestamp, sessionId, field, conditionEvaluated, expected, actual, status, reason });
      };

      /** Always-applicable "must not be blank" field — never N/A. */
      const requiredAlways = (field: string, value: string, failReason: string) => {
        const blank = isEmptyValue(value);
        pushResult(field, 'Always required', 'Not Blank', displayValue(value), blank ? 'FAIL' : 'PASS', blank ? failReason : undefined);
      };

      /**
       * Conditional "must not be blank" field. When `applicable` is false the row is marked N/A
       * (rule doesn't apply here) rather than asserting the field must be blank. `isBlankFn`
       * defaults to isEmptyValue; duration fields pass isBlankDuration instead (see below).
       */
      const conditionalNotBlank = (
        field: string,
        value: string,
        applicable: boolean,
        conditionLabel: string,
        naReason: string,
        failReason: string,
        isBlankFn: (v: string) => boolean = isEmptyValue
      ) => {
        if (!applicable) {
          pushResult(field, conditionLabel, 'Not Blank', displayValue(value), 'N/A', naReason);
          return;
        }
        const blank = isBlankFn(value);
        pushResult(field, conditionLabel, 'Not Blank', displayValue(value), blank ? 'FAIL' : 'PASS', blank ? failReason : undefined);
      };

      /** Field with no stated rule, or one this suite can't verify — always N/A. */
      const notAsserted = (field: string, value: string, reason: string) => {
        pushResult(field, reason, '—', displayValue(value), 'N/A', reason);
      };

      /** Duration fields: the app renders "no duration" as a literal "0" (or "0:00"/"00:00:00"),
       *  not an empty cell — confirmed by the user ("duration field can be 0 and blank"). */
      const isBlankDuration = (value: string): boolean => isEmptyValue(value) || durationToSeconds(value) === 0;

      // --- 1-6, 8: always required ---
      requiredAlways('Start Date Time', call.timestamp || get('Start Date Time'), 'Start Date Time is required');
      requiredAlways('End Date Time', get('End Date Time'), 'End Date Time is required');
      requiredAlways('Session Id', get('Session Id'), 'Session Id is required');
      requiredAlways('Call Type', call.callType, 'Call Type is required');
      requiredAlways('Campaign Name', call.campaignName, 'Campaign Name is required');
      requiredAlways('Campaign Type', call.campaignType, 'Campaign Type is required');
      requiredAlways('Virtual Number', get('Virtual Number'), 'Virtual Number is required');

      // --- 7: Campaign List Name — required only for these dialer/campaign types ---
      const isCampaignListType = CAMPAIGN_LIST_TYPES.includes(call.campaignType.trim().toLowerCase());
      conditionalNotBlank(
        'Campaign List Name',
        get('Campaign List Name'),
        isCampaignListType,
        'Campaign Type = Preview Manual/Preview Auto/Power/Progressive/Predictive dialer',
        `Campaign Type is ${call.campaignType || '(blank)'}`,
        `Required for ${call.campaignType || 'this Campaign Type'}`
      );

      // --- 9/10: no rule / can't verify — always N/A ---
      notAsserted('Customer Number', call.customerNumber, 'No rule specified — captured for visibility only');
      notAsserted('Customer Name', call.customerName, 'Depends on Contacts page — not checked');

      // --- 11: Call Flow — only for Incoming calls ---
      const isIncoming = textsMatch(call.callType, 'Incoming');
      const isOutgoing = textsMatch(call.callType, 'Outgoing');
      const callFlow = get('Call Flow');
      conditionalNotBlank(
        'Call Flow',
        callFlow,
        isIncoming,
        'Call Type = Incoming',
        `Call Type is ${call.callType || '(blank)'}`,
        'Call Flow required for Incoming calls'
      );

      // --- Call Status buckets + Abandoned Reason (moved up: needed by IVR Duration, Queue, Queue
      // Wait Duration, Agent Name and Voice Mail Status below) ---
      const isAbandoned = textsMatch(call.callStatus, 'Abandoned');
      const isSuccess = textsMatch(call.callStatus, 'Success');
      const isFailed = textsMatch(call.callStatus, 'Failed');
      const abandonedReason = get('Abandoned Reason');
      const voiceMailStatus = get('Voice Mail Status');

      // --- 16: Abandoned Reason — SYMMETRIC per explicit instruction (unlike most conditional
      // fields in this suite): required when Abandoned, and must be BLANK when Call Status is
      // anything else — both directions are asserted (FAIL-eligible), not just the populated side. ---
      {
        const blank = isEmptyValue(abandonedReason);
        if (isAbandoned && blank) {
          pushResult('Abandoned Reason', 'Call Status = Abandoned', 'Not Blank', displayValue(abandonedReason), 'FAIL', 'Abandoned Reason required when Abandoned');
        } else if (!isAbandoned && !blank) {
          pushResult(
            'Abandoned Reason',
            'Call Status != Abandoned',
            'Blank/NA',
            displayValue(abandonedReason),
            'FAIL',
            'Abandoned Reason must be blank when Call Status is not Abandoned'
          );
        } else {
          pushResult(
            'Abandoned Reason',
            isAbandoned ? 'Call Status = Abandoned' : 'Call Status != Abandoned',
            isAbandoned ? 'Not Blank' : 'Blank/NA',
            displayValue(abandonedReason),
            'PASS'
          );
        }
      }

      // Abandoned Reason sub-scenarios — only reachable when Abandoned Reason actually equals one
      // of these exact values (which per the rule above only happens when Call Status = Abandoned).
      const isAbandonedInIvr = textsMatch(abandonedReason, 'abandoned_in_ivr');
      const isAbandonedInAgent = textsMatch(abandonedReason, 'abandoned_in_agent');
      const isAbandonedInVoicemail = textsMatch(abandonedReason, 'abandoned_in_voicemail');
      const isAbandonedInQueue = textsMatch(abandonedReason, 'abandoned_in_queue');

      // --- 12: IVR Duration — must not be 0/blank when Abandoned Reason = abandoned_in_ivr;
      // otherwise no rule given (N/A). ---
      conditionalNotBlank(
        'IVR Duration',
        get('IVR Duration'),
        isAbandonedInIvr,
        'Abandoned Reason = abandoned_in_ivr',
        `Abandoned Reason is ${abandonedReason || '(blank)'}`,
        'IVR Duration must not be 0 or blank when Abandoned Reason = abandoned_in_ivr',
        isBlankDuration
      );
      // --- 13: DTMF — no rule — always N/A ---
      notAsserted('DTMF', get('DTMF'), 'No rule specified — captured for visibility only');

      // --- 14: Queue — also required when Abandoned Reason = abandoned_in_queue, regardless of the
      // Incoming/Outgoing branches below: per the dialer-specific rules, "do not expect
      // abandoned_in_queue unless queue information confirms the call entered a queue" — so a call
      // labeled abandoned_in_queue with no Queue value is a real failure, not a silent N/A. ---
      const incomingQueueBranch = isIncoming && (isSuccess || isAbandoned) && !isEmptyValue(callFlow);
      const outgoingQueueBranch = isOutgoing && (isSuccess || isFailed || isAbandoned);
      const queueApplicable = incomingQueueBranch || outgoingQueueBranch || isAbandonedInQueue;
      const queueNaReason = !isIncoming && !isOutgoing ? `Call Type is ${call.callType || '(blank)'}` : isIncoming && isEmptyValue(callFlow) ? 'Call Flow is blank' : `Call Status is ${call.callStatus || '(blank)'}`;
      conditionalNotBlank(
        'Queue',
        get('Queue'),
        queueApplicable,
        'Incoming + Status (Success/Abandoned) + Call Flow present, OR Outgoing + Status (Success/Failed/Abandoned), OR Abandoned Reason = abandoned_in_queue',
        queueNaReason,
        isAbandonedInQueue ? 'Queue required — Abandoned Reason = abandoned_in_queue but no queue evidence found' : 'Queue is mandatory'
      );

      // --- 15: Queue Wait Duration — must not be 0/blank when Abandoned Reason = abandoned_in_queue;
      // otherwise no rule given (N/A). ---
      conditionalNotBlank(
        'Queue Wait Duration',
        get('Queue Wait Duration'),
        isAbandonedInQueue,
        'Abandoned Reason = abandoned_in_queue',
        `Abandoned Reason is ${abandonedReason || '(blank)'}`,
        'Queue Wait Duration must not be 0 or blank when Abandoned Reason = abandoned_in_queue',
        isBlankDuration
      );

      // --- Voice Mail Status — required when Abandoned Reason = abandoned_in_voicemail ---
      conditionalNotBlank(
        'Voice Mail Status',
        voiceMailStatus,
        isAbandonedInVoicemail,
        'Abandoned Reason = abandoned_in_voicemail',
        `Abandoned Reason is ${abandonedReason || '(blank)'}`,
        'Voice Mail Status required when Abandoned Reason = abandoned_in_voicemail'
      );

      // --- 17: Call Status — always required, must be one of Success/Failed/Abandoned ---
      const statusBlank = isEmptyValue(call.callStatus);
      const statusValid = !statusBlank && CALL_STATUSES.includes(call.callStatus.trim().toLowerCase());
      pushResult(
        'Call Status',
        'Always required, valid status',
        'Success / Failed / Abandoned',
        displayValue(call.callStatus),
        statusValid ? 'PASS' : 'FAIL',
        statusValid ? undefined : statusBlank ? 'Call Status is required' : `Invalid status: ${call.callStatus}`
      );

      // --- 18: Agent Name — required for Success/Failed, or Abandoned with Reason = abandoned_in_agent ---
      const abandonedInAgent = isAbandoned && isAbandonedInAgent;
      const agentNameNaReason = isAbandoned ? `Abandoned Reason is ${abandonedReason || '(blank)'}, not "abandoned_in_agent"` : `Call Status is ${call.callStatus || '(blank)'}`;
      conditionalNotBlank(
        'Agent Name',
        call.agentName,
        isSuccess || isFailed || abandonedInAgent,
        'Status = Success/Failed, or Abandoned with Reason = abandoned_in_agent',
        agentNameNaReason,
        'Agent Name required'
      );

      // --- 19: Agent Number — required exactly when Agent Name is present ---
      const agentNumber = get('Agent Number');
      conditionalNotBlank(
        'Agent Number',
        agentNumber,
        !isEmptyValue(call.agentName),
        'Agent Name exists',
        'Agent Name is blank',
        'Agent Number required when Agent Name exists'
      );

      // --- 20/21: Team Lead / Login Mode — Users-page lookup, always N/A (no CDR column to compare) ---
      if (!isEmptyValue(call.agentName)) {
        const user = allUsers.find((u) => textsMatch(u.name, call.agentName));
        notAsserted('Team Lead', user?.teamLead ?? '(agent not found on Users page)', 'Reference lookup from Users page — no CDR field to compare');
        notAsserted(
          'Login Mode',
          user?.raw['Login Mode'] ?? '(agent not found on Users page)',
          'Reference lookup from Users page — no CDR field to compare'
        );
      } else {
        notAsserted('Team Lead', '', 'Agent Name is blank');
        notAsserted('Login Mode', '', 'Agent Name is blank');
      }

      // --- 22: Agent Ringing Duration ---
      const agentRingingNaReason = !isSuccess ? `Call Status is ${call.callStatus || '(blank)'}` : 'Agent Name or Agent Number is blank';
      conditionalNotBlank(
        'Agent Ringing Duration',
        call.agentRingingDuration,
        !isEmptyValue(call.agentName) && !isEmptyValue(agentNumber) && isSuccess,
        'Agent Name + Agent Number set + Status = Success',
        agentRingingNaReason,
        'Agent Ringing Duration required',
        isBlankDuration
      );

      // --- 23: Customer Ringing Duration ---
      conditionalNotBlank(
        'Customer Ringing Duration',
        get('Customer Ringing Duration'),
        isSuccess && isOutgoing,
        'Status = Success + Call Type = Outgoing',
        !isSuccess ? `Call Status is ${call.callStatus || '(blank)'}` : `Call Type is ${call.callType || '(blank)'}`,
        'Customer Ringing Duration required',
        isBlankDuration
      );

      // --- 24: Agent Call Processing Duration ---
      const agentCallProcessingCondition = (isIncoming && (isSuccess || isAbandoned)) || (isOutgoing && isFailed);
      conditionalNotBlank(
        'Agent Call Processing Duration',
        get('Agent Call Processing Duration'),
        agentCallProcessingCondition,
        'Incoming + Status (Success/Abandoned), OR Outgoing + Status Failed',
        `Call Type is ${call.callType || '(blank)'}, Call Status is ${call.callStatus || '(blank)'}`,
        'Agent Call Processing Duration required',
        isBlankDuration
      );

      // --- 25: Connected Duration ---
      const connectedDurationCondition = (isSuccess && (isIncoming || isOutgoing)) || (isAbandoned && isIncoming);
      conditionalNotBlank(
        'Connected Duration',
        get('Connected Duration'),
        connectedDurationCondition,
        'Status Success (Incoming/Outgoing), OR Status Abandoned + Incoming',
        `Call Type is ${call.callType || '(blank)'}, Call Status is ${call.callStatus || '(blank)'}`,
        'Connected Duration required',
        isBlankDuration
      );

      // --- 26/27: Agent/Customer Connected Duration — same stated condition for both ---
      const connectedCondition = (isSuccess || isFailed) && (isIncoming || isOutgoing);
      const connectedNaReason = `Call Status is ${call.callStatus || '(blank)'}`;
      conditionalNotBlank(
        'Agent Connected Duration',
        get('Agent Connected Duration'),
        connectedCondition,
        'Status Success/Failed + Call Type Incoming/Outgoing',
        connectedNaReason,
        'Agent Connected Duration required',
        isBlankDuration
      );
      conditionalNotBlank(
        'Customer Connected Duration',
        get('Customer Connected Duration'),
        connectedCondition,
        'Status Success/Failed + Call Type Incoming/Outgoing',
        connectedNaReason,
        'Customer Connected Duration required',
        isBlankDuration
      );

      // --- 28: Pre-Conference Duration ---
      const preConferenceCondition =
        textsMatch(call.transferStatus, 'Success') && textsMatch(call.conferenceStatus, 'Yes') && !isEmptyValue(call.transferType);
      conditionalNotBlank(
        'Pre-Conference Duration',
        get('Pre-Conference Duration'),
        preConferenceCondition,
        'Transfer Status = Success + Conference Status = Yes + Transfer Type present',
        `Transfer Status is ${call.transferStatus || '(blank)'}, Conference Status is ${call.conferenceStatus || '(blank)'}`,
        'Pre-Conference Duration required',
        isBlankDuration
      );

      // --- 29: Customer Hangup Cause — classification only, never asserted (see file header).
      // Only 4 "Expected Blank/NA" scenarios are confirmed; no "Required/Populated" rule was given
      // for any combination, and the brief explicitly warns against inferring one (e.g. Agent
      // Hangup Cause == Normal Clearing, or Call Status == Failed + Normal Clearing, do NOT
      // reliably imply blank — behavior varies by Campaign Type/Disconnected By). So this field can
      // never FAIL yet: every row is classified as either a known Expected Blank/NA exception, or
      // Needs Business Rule Confirmation (with the deciding field values captured for follow-up).
      const disconnectedBy = get('Disconnected By');
      const agentHangupCause = get('Agent Hangup Cause');
      const customerHangupCause = get('Customer Hangup Cause');

      const hangupScenario = !isAbandoned
        ? null
        : textsMatch(agentHangupCause, 'Call Rejected By Agent')
        ? 'Agent rejects the call (Call Status=Abandoned, Agent Hangup Cause="Call Rejected By Agent")'
        : textsMatch(disconnectedBy, 'system - (agent timeout)')
        ? 'Agent timeout (Call Status=Abandoned, Disconnected By="system - (agent timeout)")'
        : textsMatch(disconnectedBy, 'system - (agent ringing timeout)')
        ? 'Agent ringing timeout (Call Status=Abandoned, Disconnected By="system - (agent ringing timeout)")'
        : textsMatch(agentHangupCause, 'Call Rejected')
        ? 'Call rejected (Call Status=Abandoned, Agent Hangup Cause="Call Rejected")'
        : null;

      if (hangupScenario) {
        pushResult(
          'Customer Hangup Cause',
          hangupScenario,
          'Blank/NA (known exception)',
          displayValue(customerHangupCause),
          'N/A',
          `Expected Blank/NA — ${hangupScenario}`
        );
      } else {
        pushResult(
          'Customer Hangup Cause',
          `Campaign Type=${call.campaignType || '(blank)'}, Call Type=${call.callType || '(blank)'}, Call Status=${call.callStatus || '(blank)'}, Disconnected By=${
            disconnectedBy || '(blank)'
          }, Agent Hangup Cause=${agentHangupCause || '(blank)'}`,
          'Not yet confirmed',
          displayValue(customerHangupCause),
          'N/A',
          'Needs Business Rule Confirmation — no confirmed Required/Populated rule for this combination yet'
        );
      }

      // --- 30: Agent Hangup Cause — value-correctness check, not just blank/populated (see file
      // header). Only two combinations are confirmed strongly enough to assert; everything else is
      // classification-only per the heavily-hedged "observed patterns" in the brief (explicitly:
      // do not force a single expected value without dataset proof).
      if (isSuccess) {
        // Rule 1: a successful call is expected to have SOME Agent Hangup Cause recorded (commonly
        // "Normal Clearing", but that exact value is not asserted — only presence is confirmed).
        const blank = isEmptyValue(agentHangupCause);
        pushResult(
          'Agent Hangup Cause',
          'Call Status = Success',
          'Not Blank',
          displayValue(agentHangupCause),
          blank ? 'FAIL' : 'PASS',
          blank ? 'Agent Hangup Cause required for a successful call' : undefined
        );
      } else if (isAbandoned && textsMatch(disconnectedBy, 'agent_disconnect')) {
        // Rule 2: Abandoned + Disconnected By == agent_disconnect -> exact value "Call Rejected By
        // Agent" (particularly Preview Auto/Preview Manual dialer per the brief).
        const matches = textsMatch(agentHangupCause, 'Call Rejected By Agent');
        pushResult(
          'Agent Hangup Cause',
          'Call Status = Abandoned + Disconnected By = agent_disconnect',
          'Call Rejected By Agent',
          displayValue(agentHangupCause),
          matches ? 'PASS' : 'FAIL',
          matches ? undefined : `Expected "Call Rejected By Agent", got "${agentHangupCause || '(blank)'}"`
        );
      } else {
        let scenario: string;
        if (isAbandoned && textsMatch(disconnectedBy, 'system - (agent ringing timeout)')) {
          scenario = 'Abandoned + Disconnected By = system - (agent ringing timeout): may be Normal Clearing or Unallocated number depending on path';
        } else if (isAbandoned && textsMatch(disconnectedBy, 'system - (agent timeout)')) {
          scenario = 'Abandoned + Disconnected By = system - (agent timeout): validate against campaign/termination path';
        } else if (textsMatch(disconnectedBy, 'customer')) {
          scenario = 'Disconnected By = customer: may be Normal Clearing or NA depending on whether the agent leg was established';
        } else if (textsMatch(disconnectedBy, 'system - (customer timeout)')) {
          scenario = 'Disconnected By = system - (customer timeout): NA is acceptable if the agent leg never connected';
        } else {
          scenario = `Combination not covered by confirmed rules — Campaign Type=${call.campaignType || '(blank)'}, Call Type=${
            call.callType || '(blank)'
          }, Call Status=${call.callStatus || '(blank)'}, Disconnected By=${disconnectedBy || '(blank)'}`;
        }
        pushResult('Agent Hangup Cause', scenario, 'Not yet confirmed', displayValue(agentHangupCause), 'N/A', `Needs Business Rule Confirmation — ${scenario}`);
      }

      // --- Agent Talk Time — required when Call Status = Success ---
      conditionalNotBlank(
        'Agent Talk Time',
        call.agentTalkTime,
        isSuccess,
        'Call Status = Success',
        `Call Status is ${call.callStatus || '(blank)'}`,
        'Agent Talk Time required for a successful call',
        isBlankDuration
      );

      // --- Hold Time <-> Hold Time Detail — each required exactly when the other is populated ---
      const holdTimeDetail = get('Hold Time Detail');
      conditionalNotBlank(
        'Hold Time',
        call.holdTime,
        !isEmptyValue(holdTimeDetail),
        'Hold Time Detail is not empty',
        'Hold Time Detail is blank',
        'Hold Time required when Hold Time Detail is populated',
        isBlankDuration
      );
      conditionalNotBlank(
        'Hold Time Detail',
        holdTimeDetail,
        !isBlankDuration(call.holdTime),
        'Hold Time is not empty',
        'Hold Time is blank',
        'Hold Time Detail required when Hold Time is populated'
      );

      // --- Mute Time <-> Mute Time Detail — same pattern as Hold Time above ---
      const muteTime = get('Mute Time');
      const muteTimeDetail = get('Mute Time Detail');
      conditionalNotBlank(
        'Mute Time',
        muteTime,
        !isEmptyValue(muteTimeDetail),
        'Mute Time Detail is not empty',
        'Mute Time Detail is blank',
        'Mute Time required when Mute Time Detail is populated',
        isBlankDuration
      );
      conditionalNotBlank(
        'Mute Time Detail',
        muteTimeDetail,
        !isBlankDuration(muteTime),
        'Mute Time is not empty',
        'Mute Time is blank',
        'Mute Time Detail required when Mute Time is populated'
      );

      // --- Transfer Type / Transfer Agent Ringing Duration / Transferred Agent Name / Transfer
      // Duration — all required when Transfer Status == Success ---
      const isTransferSuccess = textsMatch(call.transferStatus, 'Success');
      conditionalNotBlank(
        'Transfer Type',
        call.transferType,
        isTransferSuccess,
        'Transfer Status = Success',
        `Transfer Status is ${call.transferStatus || '(blank)'}`,
        'Transfer Type required when Transfer Status = Success'
      );
      conditionalNotBlank(
        'Transfer Agent Ringing Duration',
        call.transferAgentRingingDuration,
        isTransferSuccess,
        'Transfer Status = Success',
        `Transfer Status is ${call.transferStatus || '(blank)'}`,
        'Transfer Agent Ringing Duration required when Transfer Status = Success',
        isBlankDuration
      );
      conditionalNotBlank(
        'Transferred Agent Name',
        call.transferredAgentName,
        isTransferSuccess,
        'Transfer Status = Success',
        `Transfer Status is ${call.transferStatus || '(blank)'}`,
        'Transferred Agent Name required when Transfer Status = Success'
      );
      conditionalNotBlank(
        'Transfer Duration',
        call.transferDuration,
        isTransferSuccess,
        'Transfer Status = Success',
        `Transfer Status is ${call.transferStatus || '(blank)'}`,
        'Transfer Duration required when Transfer Status = Success',
        isBlankDuration
      );

      // --- Transferred Agent Number — required when Transferred Agent Name is populated ---
      conditionalNotBlank(
        'Transferred Agent Number',
        call.transferredAgentNumber,
        !isEmptyValue(call.transferredAgentName),
        'Transferred Agent Name is not empty',
        'Transferred Agent Name is blank',
        'Transferred Agent Number required when Transferred Agent Name is populated'
      );

      // --- Conference Duration — required when Conference Status == Success, as literally given.
      // NOTE: this suite's earlier Pre-Conference Duration rule (#28) used Conference Status ==
      // "Yes" instead of "Success" — flagging the discrepancy rather than silently reconciling it,
      // since neither value has been independently confirmed live against the actual column. ---
      conditionalNotBlank(
        'Conference Duration',
        call.conferenceDuration,
        textsMatch(call.conferenceStatus, 'Success'),
        'Conference Status = Success',
        `Conference Status is ${call.conferenceStatus || '(blank)'}`,
        'Conference Duration required when Conference Status = Success',
        isBlankDuration
      );

      // --- Voice Mail Duration / Survey Duration — required when their own Status field == Success
      // (voiceMailStatus declared earlier, alongside Abandoned Reason) ---
      conditionalNotBlank(
        'Voice Mail Duration',
        get('Voice Mail Duration'),
        textsMatch(voiceMailStatus, 'Success'),
        'Voice Mail Status = Success',
        `Voice Mail Status is ${voiceMailStatus || '(blank)'}`,
        'Voice Mail Duration required when Voice Mail Status = Success',
        isBlankDuration
      );
      const surveyStatus = get('Survey Status');
      conditionalNotBlank(
        'Survey Duration',
        get('Survey Duration'),
        textsMatch(surveyStatus, 'Success'),
        'Survey Status = Success',
        `Survey Status is ${surveyStatus || '(blank)'}`,
        'Survey Duration required when Survey Status = Success',
        isBlankDuration
      );

      // --- Disconnected By — always required ---
      requiredAlways('Disconnected By', disconnectedBy, 'Disconnected By is required');

      // --- Agent Hangup Code / Customer Hangup Code — required when their Cause counterpart is populated ---
      conditionalNotBlank(
        'Agent Hangup Code',
        get('Agent Hangup Code'),
        !isEmptyValue(agentHangupCause),
        'Agent Hangup Cause is not empty',
        'Agent Hangup Cause is blank',
        'Agent Hangup Code required when Agent Hangup Cause is populated'
      );
      conditionalNotBlank(
        'Customer Hangup Code',
        get('Customer Hangup Code'),
        !isEmptyValue(customerHangupCause),
        'Customer Hangup Cause is not empty',
        'Customer Hangup Cause is blank',
        'Customer Hangup Code required when Customer Hangup Cause is populated'
      );

      // --- Total Duration — always required EXCEPT when Call Status == Abandoned ---
      conditionalNotBlank(
        'Total Duration',
        call.totalDuration,
        !isAbandoned,
        'Call Status != Abandoned',
        `Call Status is ${call.callStatus || '(blank)'}`,
        'Total Duration required unless Call Status = Abandoned',
        isBlankDuration
      );

      // --- Recording — required when Call Status == Success ---
      // (End Date Time was NOT re-added here — it's already field #2 above, always required.)
      conditionalNotBlank(
        'Recording',
        get('Recording'),
        isSuccess,
        'Call Status = Success',
        `Call Status is ${call.callStatus || '(blank)'}`,
        'Recording required for a successful call'
      );
    });

    const failures = results.filter((r) => r.status === 'FAIL');
    const naCount = results.filter((r) => r.status === 'N/A').length;
    const hangupResults = results.filter((r) => r.field === 'Customer Hangup Cause');
    const hangupKnownException = hangupResults.filter((r) => r.reason?.startsWith('Expected Blank/NA')).length;
    const hangupNeedsConfirmation = hangupResults.filter((r) => r.reason?.startsWith('Needs Business Rule Confirmation')).length;

    // Campaign-specific Agent Hangup Cause pattern breakdown — exploratory data (not a pass/fail
    // check) so the actual Campaign Type/Call Type/Call Status/Disconnected By/Agent Hangup Cause
    // combinations observed in this dataset can be reviewed to confirm or refine the business
    // rules for field #30 (see the brief's "Campaign-Specific Validation" section).
    interface HangupPattern {
      campaignType: string;
      callType: string;
      callStatus: string;
      disconnectedBy: string;
      agentHangupCause: string;
      count: number;
    }
    const hangupPatternMap = new Map<string, HangupPattern>();
    calls.forEach((call) => {
      const disconnectedBy = (call.raw['Disconnected By'] ?? '').trim() || '(blank)';
      const agentHangupCause = (call.raw['Agent Hangup Cause'] ?? '').trim() || '(blank)';
      const campaignType = call.campaignType.trim() || '(blank)';
      const callType = call.callType.trim() || '(blank)';
      const callStatus = call.callStatus.trim() || '(blank)';
      const key = [campaignType, callType, callStatus, disconnectedBy, agentHangupCause].join('|');
      const existing = hangupPatternMap.get(key);
      if (existing) existing.count++;
      else hangupPatternMap.set(key, { campaignType, callType, callStatus, disconnectedBy, agentHangupCause, count: 1 });
    });
    const hangupPatterns = Array.from(hangupPatternMap.values()).sort(
      (a, b) => a.campaignType.localeCompare(b.campaignType) || b.count - a.count
    );

    // Campaign-specific Abandoned Reason breakdown — exploratory data supporting the "Dialer-
    // Specific Rules" brief (e.g. "primarily abandoned_in_agent", "do not expect abandoned_in_queue
    // unless queue information confirms...", "validate other abandonment reasons against the
    // actual call flow") — shows, per Campaign Type, which Abandoned Reason values actually occur
    // and whether Queue/Agent Name evidence backs them up, without inventing per-dialer pass/fail
    // rules the brief didn't give exact values for.
    interface AbandonedPattern {
      campaignType: string;
      callType: string;
      abandonedReason: string;
      queuePopulated: string;
      agentNamePopulated: string;
      count: number;
    }
    const abandonedPatternMap = new Map<string, AbandonedPattern>();
    calls
      .filter((call) => textsMatch(call.callStatus, 'Abandoned'))
      .forEach((call) => {
        const campaignType = call.campaignType.trim() || '(blank)';
        const callType = call.callType.trim() || '(blank)';
        const abandonedReasonValue = (call.raw['Abandoned Reason'] ?? '').trim() || '(blank)';
        const queuePopulated = isEmptyValue(call.raw['Queue'] ?? '') ? 'No' : 'Yes';
        const agentNamePopulated = isEmptyValue(call.agentName) ? 'No' : 'Yes';
        const key = [campaignType, callType, abandonedReasonValue, queuePopulated, agentNamePopulated].join('|');
        const existing = abandonedPatternMap.get(key);
        if (existing) existing.count++;
        else abandonedPatternMap.set(key, { campaignType, callType, abandonedReason: abandonedReasonValue, queuePopulated, agentNamePopulated, count: 1 });
      });
    const abandonedPatterns = Array.from(abandonedPatternMap.values()).sort(
      (a, b) => a.campaignType.localeCompare(b.campaignType) || b.count - a.count
    );

    const dateLabel = cfg.startDate === cfg.endDate ? cfg.startDate : `${cfg.startDate} to ${cfg.endDate}`;
    const reportLines = [
      `Date range: ${dateLabel} (only filter applied on /client/calls/merge-calls)`,
      '',
      `Calls checked: ${calls.length}`,
      `Field checks: ${results.length} (${results.filter((r) => r.status === 'PASS').length} pass, ${failures.length} fail, ${naCount} N/A)`,
      `Customer Hangup Cause breakdown: ${hangupResults.length} calls — ${hangupKnownException} known Expected Blank/NA exception, ${hangupNeedsConfirmation} Needs Business Rule Confirmation`,
      '',
      'Row | Session Id                                                | Field                          | Result | Reason',
      ...results
        .filter((r) => r.status !== 'PASS')
        .map(
          (r) =>
            `${String(r.row).padEnd(3)} | ${r.sessionId.padEnd(58)} | ${r.field.padEnd(31)} | ${r.status.padEnd(5)} | ${r.reason ?? ''}`
        ),
    ];
    const reportText = reportLines.join('\n');
    console.log(reportText);
    await test.info().attach('calls-field-check-report', { body: reportText, contentType: 'text/plain' });

    // result.xlsx — FAIL rows only (PASS and N/A both excluded per request). Columns match the
    // requested layout: Field Name, Condition Evaluated, Expected, Actual, Result, Failure Reason
    // — with Session Id prepended so a row can be traced back to its call.
    const STATUS_DISPLAY: Record<Status, string> = { PASS: '✅ Pass', FAIL: '❌ Fail', 'N/A': '— N/A' };
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Result');
    sheet.columns = [
      { header: 'Session Id', key: 'sessionId', width: 38 },
      { header: 'Field Name', key: 'fieldName', width: 30 },
      { header: 'Condition Evaluated', key: 'conditionEvaluated', width: 70 },
      { header: 'Expected', key: 'expected', width: 14 },
      { header: 'Actual', key: 'actual', width: 20 },
      { header: 'Result', key: 'result', width: 12 },
      { header: 'Failure Reason', key: 'failureReason', width: 60 },
    ];
    failures.forEach((r) => {
      sheet.addRow({
        sessionId: r.sessionId || `(missing Session Id — row ${r.row}, ${r.timestamp})`,
        fieldName: r.field,
        conditionEvaluated: r.conditionEvaluated,
        expected: r.expected,
        actual: r.actual,
        result: STATUS_DISPLAY[r.status],
        failureReason: r.reason ?? '',
      });
    });
    sheet.getRow(1).font = { bold: true };

    // Second sheet: exploratory Agent Hangup Cause pattern breakdown by campaign (not pass/fail —
    // for reviewing which combinations need a confirmed business rule).
    const patternsSheet = workbook.addWorksheet('Agent Hangup Patterns');
    patternsSheet.columns = [
      { header: 'Campaign Type', key: 'campaignType', width: 26 },
      { header: 'Call Type', key: 'callType', width: 14 },
      { header: 'Call Status', key: 'callStatus', width: 14 },
      { header: 'Disconnected By', key: 'disconnectedBy', width: 34 },
      { header: 'Agent Hangup Cause', key: 'agentHangupCause', width: 30 },
      { header: 'Count', key: 'count', width: 10 },
    ];
    hangupPatterns.forEach((p) => patternsSheet.addRow(p));
    patternsSheet.getRow(1).font = { bold: true };

    // Third sheet: exploratory Abandoned Reason pattern breakdown by campaign (not pass/fail — for
    // reviewing dialer-specific abandonment scenarios against actual Queue/Agent Name evidence).
    const abandonedSheet = workbook.addWorksheet('Abandoned Reason Patterns');
    abandonedSheet.columns = [
      { header: 'Campaign Type', key: 'campaignType', width: 26 },
      { header: 'Call Type', key: 'callType', width: 14 },
      { header: 'Abandoned Reason', key: 'abandonedReason', width: 26 },
      { header: 'Queue Populated?', key: 'queuePopulated', width: 18 },
      { header: 'Agent Name Populated?', key: 'agentNamePopulated', width: 22 },
      { header: 'Count', key: 'count', width: 10 },
    ];
    abandonedPatterns.forEach((p) => abandonedSheet.addRow(p));
    abandonedSheet.getRow(1).font = { bold: true };

    // result.xlsx must always reflect the latest run — retry a few times if it's currently open in
    // Excel (which locks the file and makes writeFile fail with EBUSY/EPERM on Windows) instead of
    // silently leaving a stale file behind.
    const resultPath = path.resolve(__dirname, '../result.xlsx');
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await workbook.xlsx.writeFile(resultPath);
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if ((code !== 'EBUSY' && code !== 'EPERM') || attempt === maxAttempts) {
          throw new Error(
            `Could not write ${resultPath} (${code ?? 'unknown error'}) after ${attempt} attempt(s) — close it if it's open in Excel and rerun.`,
            { cause: err }
          );
        }
        console.log(`result.xlsx is locked (attempt ${attempt}/${maxAttempts}) — close it in Excel if open; retrying in 2s...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    console.log(
      `CDR field check result written to: ${resultPath} (${failures.length} FAIL rows written; PASS and N/A excluded; ${hangupPatterns.length} Agent Hangup Cause patterns; ${abandonedPatterns.length} Abandoned Reason patterns)`
    );

    expect(calls.length, 'No Calls page rows found for the configured filters/date range').toBeGreaterThan(0);
    expect(failures, reportText).toEqual([]);
  });
});
