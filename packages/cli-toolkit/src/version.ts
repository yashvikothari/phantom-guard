import { readFileSync } from 'node:fs';

/** The version in this package's package.json, or `unknown` when it cannot be read. */
export function readVersion(): string {
  try {
    const text = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
      return typeof parsed.version === 'string' ? parsed.version : 'unknown';
    }
  } catch {
    // fall through: a missing package.json must not stop a scan
  }
  return 'unknown';
}
