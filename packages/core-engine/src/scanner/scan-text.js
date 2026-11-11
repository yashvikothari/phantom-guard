import { parseConfig } from '../parsers/index.js';
import { scan } from './scan.js';
/**
 * Parse configuration text and scan the result: Mode 2 in one call.
 * `options.format` declares the input format (skipping detection); the report's
 * `format` is the format actually used.
 */
export function scanText(text, options = {}) {
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
