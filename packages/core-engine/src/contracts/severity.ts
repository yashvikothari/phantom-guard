export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/** Highest severity first. The index in this list is the sort rank. */
export const SEVERITY_ORDER: readonly Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

/** Contribution of one Finding to the Risk_Score (capped at 100 per report). */
export const SEVERITY_WEIGHT: Readonly<Record<Severity, number>> = {
  CRITICAL: 40,
  HIGH: 20,
  MEDIUM: 8,
  LOW: 2,
  INFO: 0,
};
