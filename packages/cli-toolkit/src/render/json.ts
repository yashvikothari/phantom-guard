import { redactReport } from '@phantomguard/core-engine';
import type { ScanReport } from '@phantomguard/core-engine';
import type { InputError, ScanResult } from '../types.js';

interface JsonDocument {
  readonly tool: 'phantomguard';
  readonly version: string;
  readonly results: ReadonlyArray<{ readonly path: string; readonly report: ScanReport }>;
  readonly errors: readonly InputError[];
}

/**
 * Exactly one JSON document and nothing else (Requirement 14.5). Every report
 * passes through `redactReport` first, so a value stored under a key such as
 * `password` can never reach the output.
 */
export function renderJson(
  results: readonly ScanResult[],
  errors: readonly InputError[],
  version: string,
): string {
  const document: JsonDocument = {
    tool: 'phantomguard',
    version,
    results: results.map(({ path, report }) => ({ path, report: redactReport(report) })),
    errors,
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}
