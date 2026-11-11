import type { ConfigFormat, ScanReport, Severity } from '@phantomguard/core-engine';

/** The report for one scanned input, with the path the user will recognize. */
export interface ScanResult {
  readonly path: string;
  readonly report: ScanReport;
}

/** An input that could not be read at all. */
export interface InputError {
  readonly path: string;
  readonly message: string;
}

export type OutputFormat = 'pretty' | 'json' | 'sarif';

/** The lowest severity that fails the run, or `none`. */
export type FailOn = Severity | 'none';

export const OUTPUT_FORMATS: readonly OutputFormat[] = ['pretty', 'json', 'sarif'];

export const CONFIG_FORMATS: readonly ConfigFormat[] = ['terraform', 'dockerfile', 'iam-policy'];

export const FAIL_ON_VALUES: readonly string[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
  'none',
];

/** Exit codes: 0 clean, 1 findings at or above --fail-on, 2 usage error or an input that could not be analyzed. */
export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_ERROR = 2;
