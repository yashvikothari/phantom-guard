import { SEVERITY_ORDER } from '../contracts/severity.js';
/** 0 for CRITICAL up to 4 for INFO. Lower rank means more severe. */
export function severityRank(severity) {
  return SEVERITY_ORDER.indexOf(severity);
}
/** The more severe of two severities. */
export function maxSeverity(a, b) {
  return severityRank(a) <= severityRank(b) ? a : b;
}
