import { TableRow } from './table';

/**
 * One row of the "AGENT PERFORMANCE REPORT" table, as rendered on both Live Dashboard > APR
 * Analytics (today) and Insights > APR (date range) — same component, same columns, verified
 * live. `activeTime` is this app's name for what the task spec calls "Total Active Duration".
 */
export interface AprAgentRow {
  slNo: string;
  agentId: string;
  agentName: string;
  teamLead: string;
  campaignName: string;
  mode: string;
  currentMode: string;
  firstLogin: string;
  lastLogout: string;
  totalCalls: string;
  activeTime: string;
  totalWaitingTime: string;
  breakTime: string;
  avgRingingDuration: string;
  avgAgentTalkTime: string;
  avgWrapUpTime: string;
  avgHandlingTime: string;
  agentTalkTime: string;
  totalWrapUpTime: string;
  // Confirmed live on Insights > APR (under the "Total" grouped-header column, distinct from
  // "Avg Ringing Duration"): "Total Ringing Duration" — the counterpart of the hourly report's
  // "Total Ring Time" (see HourlyAgentPerformanceRow.totalRingTime below).
  totalRingingDuration: string;
  raw: TableRow;
}

export function mapAprRow(row: TableRow): AprAgentRow {
  return {
    slNo: row['Sl. No.'] ?? row['Sl. No'] ?? '',
    agentId: row['Agent ID'] ?? '',
    // The live app has been observed rendering this column as "Agent" instead of "Agent Name"
    // (see apr/lib/tabs.ts "Two tab-bar UI variants") — fall back to it rather than misreport a
    // real header rename as a blank Agent Name.
    agentName: row['Agent Name'] ?? row['Agent'] ?? '',
    teamLead: row['Team Lead'] ?? '',
    campaignName: row['Campaign Name'] ?? '',
    mode: row['Mode'] ?? '',
    currentMode: row['Current Mode'] ?? '',
    firstLogin: row['First Login'] ?? '',
    lastLogout: row['Last Logout'] ?? '',
    totalCalls: row['Total Calls'] ?? '',
    activeTime: row['Active Time'] ?? '',
    totalWaitingTime: row['Total Waiting Time'] ?? '',
    // Confirmed live on Insights > APR (rightmost column of the table): "Break Time" — the
    // aggregated counterpart of the hourly report's "Total Break Duration" (see
    // HourlyAgentPerformanceRow.totalBreakDuration below).
    breakTime: row['Break Time'] ?? '',
    // Confirmed live on Insights > APR: "Avg Ringing Duration" — this app's naming convention
    // consistently swaps the hourly report's "...Time"/"...Duration" suffix on the Insights side
    // (e.g. hourly "Total Break Duration" ↔ Insights "Break Time" above); here it's the mirror
    // image, hourly "Avg. Ringing Time" ↔ Insights "Avg Ringing Duration" (see
    // HourlyAgentPerformanceRow.avgRingingTime below).
    avgRingingDuration: row['Avg Ringing Duration'] ?? '',
    // Confirmed live on Insights > APR: "Avg Agent Talk Time" — the counterpart of the hourly
    // report's "Avg. Talk Time" (see HourlyAgentPerformanceRow.avgTalkTime below). Unlike the
    // Ringing/Break fields, both sides here happen to share the word "Time".
    avgAgentTalkTime: row['Avg Agent Talk Time'] ?? '',
    // Confirmed live on Insights > APR: "Avg Wrap Up Time" — the counterpart of the hourly
    // report's "Avg. ACW Duration" (see HourlyAgentPerformanceRow.avgAcwDuration below). ACW
    // (After Call Work) and Wrap Up are the same call-center concept under different labels on
    // the two pages, same pattern as the Break/Ringing fields above.
    avgWrapUpTime: row['Avg Wrap Up Time'] ?? '',
    // Confirmed live on Insights > APR: "Avg Handling Time" — same name as the hourly report's
    // "Avg. Handling Time" (just missing the period), the counterpart of
    // HourlyAgentPerformanceRow.avgHandlingTime below.
    avgHandlingTime: row['Avg Handling Time'] ?? '',
    // Confirmed live on Insights > APR (under the "Total" grouped-header column, distinct from
    // "Avg Agent Talk Time"): "Agent Talk Time" — the counterpart of the hourly report's "Total
    // Talk Time" (see HourlyAgentPerformanceRow.totalTalkTime below).
    agentTalkTime: row['Agent Talk Time'] ?? '',
    // Confirmed live on Insights > APR (under the "Total" grouped-header column, distinct from
    // "Avg Wrap Up Time"): "Total Wrap Up Time" — the counterpart of the hourly report's "Total
    // ACW Duration" (see HourlyAgentPerformanceRow.totalAcwDuration below).
    totalWrapUpTime: row['Total Wrap Up Time'] ?? '',
    totalRingingDuration: row['Total Ringing Duration'] ?? '',
    raw: row,
  };
}

/** One row of the Users page (/client/users). */
export interface UserRecord {
  userId: string;
  emailId: string;
  name: string;
  role: string;
  // Confirmed live: "Team Lead" — shows the assigned team lead's name for an Agent-role user
  // (blank "-" for non-agent roles, e.g. the Team Lead row itself).
  teamLead: string;
  // Confirmed live: "In Time"/"Out Time" — this account's counterpart of the Agent Activity
  // report's "Shift Start Time"/"Shift End Time" (see AgentActivityRow below).
  inTime: string;
  outTime: string;
  raw: TableRow;
}

export function mapUserRow(row: TableRow): UserRecord {
  return {
    userId: row['User Id'] ?? '',
    emailId: row['Email ID'] ?? '',
    name: row['Name'] ?? '',
    teamLead: row['Team Lead'] ?? '',
    inTime: row['In Time'] ?? '',
    outTime: row['Out Time'] ?? '',
    role: row['Role'] ?? '',
    raw: row,
  };
}

/**
 * One row of Reports > Standard Reports > "Agent Performance" (/client/reports/standard-reports
 * ?mode=agent_performance) — one row per agent per hour, unlike the aggregated-per-agent APR
 * table above. This is the app's actual "Agent Hourly Performance Report". Confirmed live: this
 * report has a real "SME ID" column, distinct from Agent ID (unlike the APR table, which has none
 * — see apr/README.md "SME ID").
 */
export interface HourlyAgentPerformanceRow {
  date: string;
  hour: string;
  smeId: string;
  campaignName: string;
  campaignType: string;
  agentName: string;
  agentId: string;
  totalActiveDuration: string;
  totalReadyDuration: string;
  totalBreakDuration: string;
  avgRingingTime: string;
  avgTalkTime: string;
  avgAcwDuration: string;
  avgHandlingTime: string;
  totalTalkTime: string;
  totalAcwDuration: string;
  totalIdleTime: string;
  // Auto Preview dialer-mode metrics. Confirmed live (see tests/standard-report/agent-performance-report/dialers/specs/preview-auto.spec.ts):
  // this report groups metrics by dialer-mode column prefix (Auto Preview / Manual Preview /
  // Predictive / Progressive / Power / Inbound / Callback / Transfer variants).
  autoPreviewDials: string;
  autoPreviewRingTime: string;
  autoPreviewAcw: string;
  connectedAutoPreview: string;
  autoPreviewTalkTime: string;
  // Manual Preview dialer-mode metrics — same column-group pattern as Auto Preview above, column
  // names as given in the validation brief; not yet independently confirmed live (pending a
  // live-agent pass), see tests/standard-report/agent-performance-report/dialers/specs/preview-manual.spec.ts.
  manualPreviewDials: string;
  manualPreviewRingTime: string;
  manualPreviewAcw: string;
  connectedManualPreview: string;
  manualPreviewTalkTime: string;
  // Predictive dialer-mode metrics — same column-group pattern as Auto Preview above, column
  // names as given in the validation brief; not yet independently confirmed live (pending a
  // live-agent pass), see tests/standard-report/agent-performance-report/dialers/specs/predictive.spec.ts.
  predictiveDials: string;
  predictiveRingTime: string;
  predictiveAcw: string;
  connectedPredictive: string;
  predictiveTalkTime: string;
  // Progressive dialer-mode metrics — same column-group pattern as Auto Preview above, column
  // names as given in the validation brief; not yet independently confirmed live (pending a
  // live-agent pass), see tests/standard-report/agent-performance-report/dialers/specs/progressive.spec.ts.
  progressiveDials: string;
  progressiveRingTime: string;
  progressiveAcw: string;
  connectedProgressive: string;
  progressiveTalkTime: string;
  // Power dialer-mode metrics — same column-group pattern as Auto Preview above, column names as
  // given in the validation brief; not yet independently confirmed live (pending a live-agent
  // pass), see tests/standard-report/agent-performance-report/dialers/specs/power.spec.ts.
  powerDials: string;
  powerRingTime: string;
  powerAcw: string;
  connectedPower: string;
  powerTalkTime: string;
  // Inbound call-type metrics — same column-group pattern as the dialer-mode metrics above
  // (though this group is keyed by Call Type, not a dialer/campaign mode), column names as given
  // in the validation brief; not yet independently confirmed live (pending a live-agent pass),
  // see tests/standard-report/agent-performance-report/specs/inbound-check.spec.ts.
  inboundReceived: string;
  inboundRingTime: string;
  inboundTalkTime: string;
  inboundAcw: string;
  connectedInbound: string;
  // Manual Dials call-type metrics — same column-group pattern as Inbound above (keyed by Call
  // Type, distinct from the "Manual Preview" dialer-mode group), column names as given in the
  // validation brief; not yet independently confirmed live (pending a live-agent pass), see
  // tests/standard-report/agent-performance-report/dialers/specs/manual-dials.spec.ts.
  manualDials: string;
  manualRingTime: string;
  manualTalkTime: string;
  manualAcw: string;
  connectedManualDials: string;
  // Transfers Received metrics — same column-group pattern as the groups above; column names as
  // given in the validation brief; not yet independently confirmed live (pending a live-agent
  // pass), see tests/standard-report/agent-performance-report/specs/transfers-received-check.spec.ts.
  transfersReceived: string;
  transferRingTime: string;
  transferTalkTime: string;
  transferAcw: string;
  connectedTransfers: string;
  // Total Ring Time / Total Hold Time — agent-wide metrics (no Call Type/Campaign filtering, per
  // the validation brief), not yet independently confirmed live (pending a live-agent pass), see
  // tests/standard-report/agent-performance-report/ring-hold-time.spec.ts.
  totalRingTime: string;
  totalHoldTime: string;
  raw: TableRow;
}

export function mapHourlyAgentPerformanceRow(row: TableRow): HourlyAgentPerformanceRow {
  return {
    date: row['Date'] ?? '',
    hour: row['Hour'] ?? '',
    smeId: row['SME ID'] ?? '',
    campaignName: row['Campaign Name'] ?? '',
    campaignType: row['Campaign Type'] ?? '',
    agentName: row['Agent Name'] ?? '',
    agentId: row['Agent ID'] ?? '',
    totalActiveDuration: row['Total Active Duration'] ?? '',
    totalReadyDuration: row['Total Ready Duration'] ?? '',
    // Confirmed live on Reports > Standard Reports > Agent Performance: "Total Break Duration".
    totalBreakDuration: row['Total Break Duration'] ?? '',
    // Confirmed live: "Avg. Ringing Time" (note the period after "Avg", unlike the Insights
    // column's "Avg Ringing Duration" — see AprAgentRow.avgRingingDuration above).
    avgRingingTime: row['Avg. Ringing Time'] ?? '',
    // Confirmed live: "Avg. Talk Time".
    avgTalkTime: row['Avg. Talk Time'] ?? '',
    // Confirmed live: "Avg. ACW Duration".
    avgAcwDuration: row['Avg. ACW Duration'] ?? '',
    // Confirmed live: "Avg. Handling Time".
    avgHandlingTime: row['Avg. Handling Time'] ?? '',
    // Confirmed live: "Total Talk Time" (distinct from "Avg. Talk Time" above).
    totalTalkTime: row['Total Talk Time'] ?? '',
    // Confirmed live: "Total ACW Duration" (distinct from "Avg. ACW Duration" above).
    totalAcwDuration: row['Total ACW Duration'] ?? '',
    // Confirmed live: "Total Idle Time".
    totalIdleTime: row['Total Idle Time'] ?? '',
    // Confirmed live — exact-match column headers.
    autoPreviewDials: row['Auto Preview Dials'] ?? '',
    autoPreviewRingTime: row['Auto Preview Ring Time'] ?? '',
    autoPreviewAcw: row['Auto Preview ACW'] ?? '',
    connectedAutoPreview: row['Connected Auto Preview'] ?? '',
    autoPreviewTalkTime: row['Auto Preview Talk Time'] ?? '',
    // Not yet independently confirmed live — see the interface comment above.
    manualPreviewDials: row['Manual Preview Dials'] ?? '',
    manualPreviewRingTime: row['Manual Preview Ring Time'] ?? '',
    manualPreviewAcw: row['Manual Preview ACW'] ?? '',
    connectedManualPreview: row['Connected Manual Preview'] ?? '',
    manualPreviewTalkTime: row['Manual Preview Talk Time'] ?? '',
    // Not yet independently confirmed live — see the interface comment above.
    predictiveDials: row['Predictive Dials'] ?? '',
    predictiveRingTime: row['Predictive Ring Time'] ?? '',
    predictiveAcw: row['Predictive ACW'] ?? '',
    connectedPredictive: row['Connected Predictive'] ?? '',
    predictiveTalkTime: row['Predictive Talk Time'] ?? '',
    // Not yet independently confirmed live — see the interface comment above.
    progressiveDials: row['Progressive Dials'] ?? '',
    progressiveRingTime: row['Progressive Ring Time'] ?? '',
    progressiveAcw: row['Progressive ACW'] ?? '',
    connectedProgressive: row['Connected Progressive'] ?? '',
    progressiveTalkTime: row['Progressive Talk Time'] ?? '',
    // Not yet independently confirmed live — see the interface comment above.
    powerDials: row['Power Dials'] ?? '',
    powerRingTime: row['Power Ring Time'] ?? '',
    powerAcw: row['Power ACW'] ?? '',
    connectedPower: row['Connected Power'] ?? '',
    powerTalkTime: row['Power Talk Time'] ?? '',
    // Not yet independently confirmed live — see the interface comment above.
    inboundReceived: row['Inbound Received'] ?? '',
    inboundRingTime: row['Inbound Ring Time'] ?? '',
    inboundTalkTime: row['Inbound Talk Time'] ?? '',
    inboundAcw: row['Inbound ACW'] ?? '',
    connectedInbound: row['Connected Inbound'] ?? '',
    // Not yet independently confirmed live — see the interface comment above.
    manualDials: row['Manual Dials'] ?? '',
    manualRingTime: row['Manual Ring Time'] ?? '',
    manualTalkTime: row['Manual Talk Time'] ?? '',
    manualAcw: row['Manual ACW'] ?? '',
    connectedManualDials: row['Connected Manual Dials'] ?? '',
    // Not yet independently confirmed live — see the interface comment above.
    transfersReceived: row['Transfers Received'] ?? '',
    transferRingTime: row['Transfer Ring Time'] ?? '',
    transferTalkTime: row['Transfer Talk Time'] ?? '',
    transferAcw: row['Transfer ACW'] ?? '',
    connectedTransfers: row['Connected Transfers'] ?? '',
    // Not yet independently confirmed live — see the interface comment above.
    totalRingTime: row['Total Ring Time'] ?? '',
    totalHoldTime: row['Total Hold Time'] ?? '',
    raw: row,
  };
}

/**
 * One row of the Calls page (/client/calls/merge-calls) — the raw per-call log used as the
 * "source of truth" reference for Standard Reports > Agent Performance metrics. Column names are
 * as given in the validation brief; not yet confirmed against the live table (pending a live-agent
 * pass), see auto-preview-vs-calls.spec.ts.
 */
export interface CallRecord {
  timestamp: string; // "DD-MM-YYYY HH:mm:ss", e.g. "29-07-2026 15:55:51"
  agentName: string;
  campaignName: string;
  campaignType: string;
  callType: string;
  callStatus: string;
  agentRingingDuration: string;
  wrapupTime: string;
  agentTalkTime: string;
  // Used by ring-hold-time.spec.ts (Total Ring Time / Total Hold Time validation). Column names
  // as given in that brief; not yet independently confirmed live.
  holdTime: string;
  totalDuration: string;
  // Customer identity — used only for the Transfers Received "record trace" output on mismatch
  // (see tests/standard-report/agent-performance-report/specs/transfers-received-check.spec.ts), not for
  // filtering/matching.
  customerName: string;
  customerNumber: string;
  // Transfer/conference fields — used by the Transfers Received validation. Column names as
  // given in that validation brief; not yet independently confirmed live (pending a live-agent
  // pass).
  transferStatus: string;
  transferType: string;
  transferDuration: string;
  transferredAgentNumber: string;
  transferredAgentName: string;
  transferAgentRingingDuration: string;
  conferenceStatus: string;
  conferenceDuration: string;
  raw: TableRow;
}

export function mapCallRow(row: TableRow): CallRecord {
  return {
    // Confirmed live: the Calls page's actual column header is "Start Date Time" — none of the
    // other guessed names below matched it, so `timestamp` was silently empty for every row,
    // parseCallTimestamp() returned null for all of them, and every date/hour-scoped filter in
    // this suite (manual-dials/power/predictive/preview-auto/preview-manual/progressive/inbound/
    // transfers-received/total-hold-time) was silently dropping every real call.
    timestamp: row['Start Date Time'] ?? row['Call Date & Time'] ?? row['Date & Time'] ?? row['Timestamp'] ?? row['Call Time'] ?? '',
    agentName: row['Agent Name'] ?? row['Agent'] ?? '',
    campaignName: row['Campaign Name'] ?? '',
    campaignType: row['Campaign Type'] ?? '',
    callType: row['Call Type'] ?? '',
    callStatus: row['Call Status'] ?? '',
    agentRingingDuration: row['Agent Ringing Duration'] ?? '',
    wrapupTime: row['Wrapup Time'] ?? row['Wrap Up Time'] ?? '',
    agentTalkTime: row['Agent Talk Time'] ?? '',
    holdTime: row['Hold Time'] ?? '',
    totalDuration: row['Total Duration'] ?? '',
    customerName: row['Customer Name'] ?? '',
    customerNumber: row['Customer Number'] ?? '',
    transferStatus: row['Transfer Status'] ?? '',
    transferType: row['Transfer Type'] ?? '',
    transferDuration: row['Transfer Duration'] ?? '',
    transferredAgentNumber: row['Transferred Agent Number'] ?? '',
    transferredAgentName: row['Transferred Agent Name'] ?? '',
    transferAgentRingingDuration: row['Transfer Agent Ringing Duration'] ?? '',
    conferenceStatus: row['Conference Status'] ?? '',
    conferenceDuration: row['Conference Duration'] ?? '',
    raw: row,
  };
}

/**
 * One row of Reports > Standard Reports > "Agent Activity" (/client/reports/standard-reports
 * ?mode=agent_activity) — one row per agent per date. Confirmed live column headers.
 */
export interface AgentActivityRow {
  agentName: string;
  date: string;
  tlSupervisorName: string;
  shiftStartTime: string;
  shiftEndTime: string;
  loggedInTime: string;
  lastLoggedOutTime: string;
  activeTime: string;
  idleTime: string;
  breakTime: string;
  noOfBreaksTaken: string;
  autoCallOffTime: string;
  totalLoggedInDuration: string;
  systemLogoutReason: string;
  raw: TableRow;
}

export function mapAgentActivityRow(row: TableRow): AgentActivityRow {
  return {
    agentName: row['Agent Name'] ?? '',
    date: row['Date'] ?? '',
    tlSupervisorName: row['TL/Supervisor Name'] ?? '',
    shiftStartTime: row['Shift Start Time'] ?? '',
    shiftEndTime: row['Shift End Time'] ?? '',
    loggedInTime: row['Logged-in Time'] ?? '',
    lastLoggedOutTime: row['Last Logged-out Time'] ?? '',
    activeTime: row['Active Time'] ?? '',
    idleTime: row['Idle Time'] ?? '',
    breakTime: row['Break Time'] ?? '',
    noOfBreaksTaken: row['No. of Breaks Taken'] ?? '',
    autoCallOffTime: row['Auto Call Off Time'] ?? '',
    totalLoggedInDuration: row['Total Logged in Duration'] ?? '',
    systemLogoutReason: row['System Logout Reason'] ?? '',
    raw: row,
  };
}

/**
 * One row of Profile > Activity Logs (/client/profile/activity-logs) — a global account audit
 * log, one row per event (login, break in/out, campaign edits, etc). Confirmed live column
 * headers. `date` is the full timestamp ("YYYY-MM-DD HH:MM:SS"), not just a date.
 */
export interface ActivityLogRow {
  date: string;
  ipAddress: string;
  user: string;
  module: string;
  action: string;
  description: string;
  raw: TableRow;
}

export function mapActivityLogRow(row: TableRow): ActivityLogRow {
  return {
    date: row['Date'] ?? '',
    ipAddress: row['IP Address'] ?? '',
    user: row['User'] ?? '',
    module: row['Module'] ?? '',
    action: row['Action'] ?? '',
    description: row['Description'] ?? '',
    raw: row,
  };
}

/**
 * One row of Reports > Standard Reports > "Agent Status" (/client/reports/standard-reports
 * ?mode=agent_status) — one row per agent per date. Confirmed live column headers.
 */
export interface AgentStatusRow {
  agentName: string;
  date: string;
  tlSupervisorName: string;
  totalLoginTime: string;
  availableTime: string;
  onCallTime: string;
  wrapUpTime: string;
  idleTime: string;
  breakTime: string;
  raw: TableRow;
}

export function mapAgentStatusRow(row: TableRow): AgentStatusRow {
  return {
    agentName: row['Agent Name'] ?? '',
    date: row['Date'] ?? '',
    tlSupervisorName: row['TL/Supervisor Name'] ?? '',
    totalLoginTime: row['Total Login Time'] ?? '',
    availableTime: row['Available Time'] ?? '',
    onCallTime: row['On Call Time'] ?? '',
    wrapUpTime: row['Wrap-Up Time'] ?? '',
    idleTime: row['Idle Time'] ?? '',
    breakTime: row['Break Time'] ?? '',
    raw: row,
  };
}

/**
 * One row of Reports > Standard Reports > "Agent Efficiency Report" (/client/reports/standard-reports
 * ?mode=agent_efficiency) — one row per agent per date. Confirmed live column headers. Unlike
 * Agent Activity/Agent Status, this report's Filter dialog has no Agent Name field at all (Date
 * Range only, verified via the live accessibility tree) — every caller must fetch every agent for
 * the date range and filter to the one it needs client-side (see AgentEfficiencyPage.ts).
 */
export interface AgentEfficiencyRow {
  agentName: string;
  date: string;
  tlSupervisorName: string;
  avgHandlingTime: string;
  callVolumeHandled: string;
  occupancyRate: string;
  acwTime: string;
  raw: TableRow;
}

export function mapAgentEfficiencyRow(row: TableRow): AgentEfficiencyRow {
  return {
    agentName: row['Agent Name'] ?? '',
    date: row['Date'] ?? '',
    tlSupervisorName: row['TL/Supervisor Name'] ?? '',
    avgHandlingTime: row['Average Handling Time (AHT)'] ?? '',
    callVolumeHandled: row['Call Volume Handled'] ?? '',
    occupancyRate: row['Occupancy Rate'] ?? '',
    acwTime: row['After Call Work (ACW) Time'] ?? '',
    raw: row,
  };
}
