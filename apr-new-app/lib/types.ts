import { TableRow } from './table';

/**
 * One row of the "AGENT PERFORMANCE REPORT" table, as rendered on both Live Dashboard > APR
 * Analytics (today) and Insights > APR (date range). Own copy for this environment — see
 * apr-new-app/README.md "Isolation from the existing suite".
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
  raw: TableRow;
}

export function mapAprRow(row: TableRow): AprAgentRow {
  return {
    slNo: row['Sl. No.'] ?? row['Sl. No'] ?? '',
    agentId: row['Agent ID'] ?? '',
    // This app has been observed rendering this column as "Agent" instead of "Agent Name" —
    // fall back to it rather than misreport a header rename as a blank Agent Name.
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
    // Confirmed live on Insights > APR (under the "Others" grouped-header column, alongside
    // "Active Time"): "Break Time" — the aggregated counterpart of the hourly report's "Total
    // Break Duration" (see HourlyAgentPerformanceRow.totalBreakDuration below).
    breakTime: row['Break Time'] ?? '',
    // Confirmed live under the "Average" grouped-header column: "Avg Ringing Duration" — the
    // counterpart of the hourly report's "Avg. Ringing Time" (see
    // HourlyAgentPerformanceRow.avgRingingTime below).
    avgRingingDuration: row['Avg Ringing Duration'] ?? '',
    // Confirmed live under the "Average" grouped-header column: "Avg Agent Talk Time" — the
    // counterpart of the hourly report's "Avg. Talk Time" (see
    // HourlyAgentPerformanceRow.avgTalkTime below).
    avgAgentTalkTime: row['Avg Agent Talk Time'] ?? '',
    // Confirmed live under the "Average" grouped-header column: "Avg Wrap Up Time" — the
    // counterpart of the hourly report's "Avg. ACW Duration" (see
    // HourlyAgentPerformanceRow.avgAcwDuration below).
    avgWrapUpTime: row['Avg Wrap Up Time'] ?? '',
    // Confirmed live under the "Average" grouped-header column: "Avg Handling Time" — same name
    // as the hourly report's "Avg. Handling Time" (just missing the period), the counterpart of
    // HourlyAgentPerformanceRow.avgHandlingTime below.
    avgHandlingTime: row['Avg Handling Time'] ?? '',
    // Confirmed live under the "Total" grouped-header column, distinct from "Avg Agent Talk
    // Time": "Agent Talk Time" — the counterpart of the hourly report's "Total Talk Time" (see
    // HourlyAgentPerformanceRow.totalTalkTime below).
    agentTalkTime: row['Agent Talk Time'] ?? '',
    // Confirmed live under the "Total" grouped-header column, distinct from "Avg Wrap Up Time":
    // "Total Wrap Up Time" — the counterpart of the hourly report's "Total ACW Duration" (see
    // HourlyAgentPerformanceRow.totalAcwDuration below).
    totalWrapUpTime: row['Total Wrap Up Time'] ?? '',
    raw: row,
  };
}

/** One row of the Users page (/client/users). */
export interface UserRecord {
  userId: string;
  emailId: string;
  name: string;
  role: string;
  raw: TableRow;
}

export function mapUserRow(row: TableRow): UserRecord {
  return {
    userId: row['User Id'] ?? '',
    emailId: row['Email ID'] ?? '',
    name: row['Name'] ?? '',
    role: row['Role'] ?? '',
    raw: row,
  };
}

/**
 * One row of Reports > Standard Reports > "Agent Performance" — one row per agent per hour,
 * unlike the aggregated-per-agent APR table above.
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
    // Confirmed live on Reports > Standard Reports > Agent Performance Hourly Report: "Total
    // Break Duration".
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
    raw: row,
  };
}
