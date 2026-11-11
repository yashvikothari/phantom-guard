import type { ScanReport } from '../contracts/scan.js';
import { parseConfig } from '../parsers/index.js';
import type { ParseOptions } from '../parsers/types.js';
import { scan } from './scan.js';
import type { ScanOptions } from './scan.js';

export type ScanTextOptions = Omit<ScanOptions, 'format' | 'diagnostics'> & ParseOptions;

/**
 * Parse configuration text and scan the result: Mode 2 in one call.
 * `options.format` declares the input format (skipping detection); the report's
 * `format` is the format actually used.
 */
export function scanText(text: string, options: ScanTextOptions = {}): ScanReport {
  const { format: declared, maxBytes, ...scanOptions } = options;
  const parsed = parseConfig(text, {
    ...(declared === undefined ? {} : { format: declared }),
    ...(maxBytes === undefined ? {} : { maxBytes }),
  });
  return scan(parsed.resources, {
    ...scanOptions,
    ...(parsed.format === undefined ? {} : { format: parsed.format }),
    diagnostics: parsed.diagnostics,
  });
}
